"""graphd lifecycle for the GBWT path engine (GBWT migration Stage 3).

Owns the GBWT graphd process and hands back a GbwtClient bound to each
chromosome's graph. GBWT mode is opt-in and reversible: when it is off (the
default) the app uses the legacy binpath PathIndex and this module does nothing.

Configuration (env vars, read at startup — matches the rest of app.py):

    PANGYPLOT_GBWT       "1"/"true" to enable the GBWT path engine (default off)
    PANGYPLOT_GBWT_BIN   path to the gbwt-graphd binary
                         (default: gbwt/graphd/pangyplot-graphd)
    PANGYPLOT_GBWT_GBZ   per-chr GBZ filename inside each chr dir (default graph.gbz)
    PANGYPLOT_GBWT_WORKERS  accept threads for the daemon (default: the graphd's
                         own — cores, clamped 2..8, shared by every chromosome)
    PANGYPLOT_GBWT_URLS  optional JSON {chrom: base_url} — point at externally
                         managed graph daemons instead of spawning, one per
                         chromosome. This is how you shard: each is a
                         single-graph daemon and needs no ?graph= selector.

ONE daemon serves every chromosome, spawned lazily on first use and keyed by
`?graph=<chrom>`. It was one daemon per chromosome, because the graphd could
only hold one index — which made a 25-chr datastore 25 processes, 25 ports and
227 threads. That is the shape of a distributed deployment, and almost nobody
runs one; those who do can still have it via PANGYPLOT_GBWT_URLS. Spawned
processes are terminated on shutdown (atexit + explicit shutdown()).

LAUNCH CONTRACT (any graphd binary must honor this so the manager spawns it
unchanged — the memory-mapped C++ `gbwt/graphd`, or a wire-compatible swap):

    <binary>  <NAME=index-file>...  <addr: 127.0.0.1:PORT>  [--workers=N]

positional args, and it must answer the HTTP wire contract in
`gbwt/graphd/README.md` (/health, /meta, /walk, /count), honouring ?graph=NAME.
A daemon holding a single graph may take a bare index path and treat the
selector as optional. The DA/document-array is loaded OFF by default (count/walk
never need it; only a future `locate` would). The C++ mmap graphd is therefore a
drop-in: build it separately and set PANGYPLOT_GBWT_BIN to its path — same
"optional external binary, gracefully skipped if absent" model as the Rust path
service, since GBWT mode is opt-in anyway.
"""
import atexit
import json
import os
import socket
import subprocess
import time

from pangyplot.db.gbwt_client import GbwtClient

DEFAULT_BIN = os.path.join("gbwt", "graphd", "pangyplot-graphd")
GBWT_NATIVE_NAME = "graph.gbwt"
DEFAULT_GBZ_NAME = "graph.gbz"
# Accept threads. Unset means "let the graphd choose" (cores, clamped 2..8),
# which is right now that ONE daemon serves the whole genome: it is the standalone
# case that default was written for, and every chromosome's requests share those
# threads. Capping it here is how the old per-chromosome topology got to 227
# threads -- and capping it low now would cap genome-wide concurrency instead.
GRAPHD_WORKERS = os.getenv("PANGYPLOT_GBWT_WORKERS")
_TRUE = {"1", "true", "yes", "on"}


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GbwtManager:
    """Starts/stops the GBWT graph daemon and vends a client per chromosome.

    One daemon serves every chromosome (`?graph=<chrom>`), spawned on first use.
    It used to be one daemon per chromosome, which made a 25-chr datastore 25
    processes, 25 ports and 227 threads -- a distributed-deployment shape that
    almost no installation wants, imposed on all of them.

    Sharding is still available and is now the opt-in it should be: run a
    single-graph daemon per chromosome yourself and point PANGYPLOT_GBWT_URLS at
    them. Those daemons need no selector (one graph => implied), so a shard
    speaks the original protocol.
    """

    def __init__(self, repo_root=None, graph_path=None):
        self.enabled = os.getenv("PANGYPLOT_GBWT", "").lower() in _TRUE
        self.repo_root = repo_root or os.getcwd()
        self.graph_path = graph_path

        bin_path = os.getenv("PANGYPLOT_GBWT_BIN", DEFAULT_BIN)
        if not os.path.isabs(bin_path):
            bin_path = os.path.join(self.repo_root, bin_path)
        self.bin_path = bin_path

        # Serve graph.gbwt (native compact build) if present, else graph.gbz
        # (adopted, possibly chopped). The graphd auto-detects the format.
        self.index_names = [GBWT_NATIVE_NAME, os.getenv("PANGYPLOT_GBWT_GBZ", DEFAULT_GBZ_NAME)]

        urls = os.getenv("PANGYPLOT_GBWT_URLS")
        self.external_urls = json.loads(urls) if urls else {}

        self._procs = []      # spawned subprocess.Popen handles
        self._base_url = None  # the one local daemon, once spawned
        self._graphs = set()   # graph names it serves
        self._started = False  # spawn attempted (success or not); don't retry
        atexit.register(self.shutdown)

    def _index_for(self, chr_dir):
        return next((os.path.join(chr_dir, n) for n in self.index_names
                     if os.path.exists(os.path.join(chr_dir, n))), None)

    def client_for_chrom(self, chrom, chr_dir):
        """Return a GbwtClient for `chrom`, or None to keep the legacy engine.

        Order: external URL (a shard; no spawn) -> the shared local daemon ->
        None (GBWT off, or no index). A missing index under GBWT mode is a
        warning, not a crash: the app boots on the binpath engine for that chr.
        """
        if not self.enabled:
            return None

        # Sharded: this chromosome has its own daemon somewhere. Single-graph, so
        # no selector -- that daemon speaks the pre-multi-graph protocol.
        if chrom in self.external_urls:
            client = GbwtClient(self.external_urls[chrom])
            if client.health():
                return client
            print(f"  ⚠️  GBWT graphd for {chrom} at {self.external_urls[chrom]} "
                  f"is not responding; using the legacy path engine.")
            return None

        if self._index_for(chr_dir) is None:
            print(f"  ⚠️  GBWT mode on but none of {self.index_names} in {chr_dir}; "
                  f"using the legacy path engine for {chrom}.")
            return None

        # chr_dir is <graph_path>/<chrom> by construction, so the sibling scan
        # can start from here when the caller did not say where the datastore is.
        self._ensure_daemon(default_graph_path=os.path.dirname(os.path.abspath(chr_dir)))
        if self._base_url is None or chrom not in self._graphs:
            return None
        return GbwtClient(self._base_url, graph=chrom)

    def _discover(self, graph_path):
        """(name, index_path) for every chromosome dir under `graph_path`."""
        found = []
        if not graph_path or not os.path.isdir(graph_path):
            return found
        for name in sorted(os.listdir(graph_path)):
            d = os.path.join(graph_path, name)
            if not os.path.isdir(d):
                continue
            index = self._index_for(d)
            if index:
                found.append((name, index))
        return found

    def _ensure_daemon(self, default_graph_path=None):
        """Spawn the one daemon, serving every chromosome that has an index."""
        if self._started:
            return
        self._started = True

        graph_path = self.graph_path or default_graph_path
        if not os.path.exists(self.bin_path):
            print(f"  ⚠️  gbwt-graphd binary not found at {self.bin_path}; "
                  f"using the legacy path engine.")
            return
        graphs = self._discover(graph_path)
        if not graphs:
            print(f"  ⚠️  no GBWT indexes under {graph_path}; "
                  f"using the legacy path engine.")
            return
        self._spawn(graphs)

    def _spawn(self, graphs):
        """Start the daemon on `graphs` [(name, index_path), ...] and wait for it."""
        port = _free_port()
        addr = f"127.0.0.1:{port}"
        args = [self.bin_path]
        args += [f"{name}={index}" for name, index in graphs]
        args += [addr]
        if GRAPHD_WORKERS:
            args += [f"--workers={int(GRAPHD_WORKERS)}"]
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._procs.append(proc)

        # Wait as long as the daemon is alive. Startup is dominated by loading
        # the indexes, which scales with them (chr1's GBZ alone is 396 MB), so a
        # fixed number of tries is a size we haven't hit yet -- and the failure
        # here is quiet: a load that outran the wait fell back to the legacy
        # engine with a warning, so a big deploy would just be permanently slower
        # with nothing to show for it. poll() catches the real failure (the
        # daemon died) on every pass, which is the case that must not hang boot.
        client = GbwtClient(f"http://{addr}")
        while not client.health():
            if proc.poll() is not None:
                print(f"  ⚠️  gbwt-graphd exited (code {proc.returncode}); "
                      f"using the legacy path engine.")
                return
            time.sleep(0.1)

        self._base_url = f"http://{addr}"
        self._graphs = {name for name, _ in graphs}
        print(f"  🧬 GBWT graphd ready on {addr}: {len(graphs)} graphs")

    @staticmethod
    def _terminate(proc):
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    def shutdown(self):
        for proc in self._procs:
            self._terminate(proc)
        self._procs.clear()
