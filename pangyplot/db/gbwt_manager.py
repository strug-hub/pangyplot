"""graphd lifecycle for the GBWT path engine (GBWT migration Stage 3).

Owns the per-chromosome GBWT graphd processes and hands back a GbwtClient for
each. GBWT mode is opt-in and reversible: when it is off (the default) the app
uses the legacy binpath PathIndex and this module does nothing.

Configuration (env vars, read at startup — matches the rest of app.py):

    PANGYPLOT_GBWT       "1"/"true" to enable the GBWT path engine (default off)
    PANGYPLOT_GBWT_BIN   path to the gbwt-graphd binary
                         (default: gbwt/graphd/pangyplot-graphd)
    PANGYPLOT_GBWT_GBZ   per-chr GBZ filename inside each chr dir (default graph.gbz)
    PANGYPLOT_GBWT_WORKERS  accept threads per spawned daemon (default 2). One
                         daemon per chromosome means the graphd's own default
                         (cores, up to 8) multiplies by the genome: 25 chrs came
                         to 227 threads. Raise it only if one chromosome is
                         genuinely serving concurrent requests.
    PANGYPLOT_GBWT_URLS  optional JSON {chrom: base_url} — point at externally
                         managed graph daemons instead of spawning. Production sets
                         this and runs the graph daemons however it likes; Flask never
                         spawns a subprocess.

Each chromosome's GBZ is a separate in-memory index, so it gets its own graphd
on its own localhost port (the wire contract is one-GBZ-per-service). Spawned
processes are terminated on shutdown (atexit + explicit shutdown()).

LAUNCH CONTRACT (any graphd binary must honor this so the manager spawns it
unchanged — the memory-mapped C++ `gbwt/graphd`, or a wire-compatible swap):

    <binary>  <index-file: graph.gbwt|graph.gbz>  <addr: 127.0.0.1:PORT>

positional args, and it must answer the HTTP wire contract in
`gbwt/graphd/README.md` (/health, /meta, /walk, /count). The DA/document-array
is loaded OFF by default (count/walk never need it; only a future `locate`
would). The C++ mmap graphd is therefore a drop-in: build it separately and set
PANGYPLOT_GBWT_BIN to its path — same "optional external binary, gracefully
skipped if absent" model as the Rust path service, since GBWT mode is opt-in anyway.
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
# Accept threads per spawned daemon. 2 rather than 1 so a slow request cannot
# block the next one on the same chromosome; the breadth that matters is across
# chromosomes, and that comes from having a daemon each.
GRAPHD_WORKERS = int(os.getenv("PANGYPLOT_GBWT_WORKERS", "2"))
_TRUE = {"1", "true", "yes", "on"}


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GbwtManager:
    """Starts/stops GBWT graph daemons and vends clients, one per chromosome."""

    def __init__(self, repo_root=None):
        self.enabled = os.getenv("PANGYPLOT_GBWT", "").lower() in _TRUE
        self.repo_root = repo_root or os.getcwd()

        bin_path = os.getenv("PANGYPLOT_GBWT_BIN", DEFAULT_BIN)
        if not os.path.isabs(bin_path):
            bin_path = os.path.join(self.repo_root, bin_path)
        self.bin_path = bin_path

        # Serve graph.gbwt (native compact build) if present, else graph.gbz
        # (adopted, possibly chopped). The graphd auto-detects the format.
        self.index_names = [GBWT_NATIVE_NAME, os.getenv("PANGYPLOT_GBWT_GBZ", DEFAULT_GBZ_NAME)]

        urls = os.getenv("PANGYPLOT_GBWT_URLS")
        self.external_urls = json.loads(urls) if urls else {}

        self._procs = []  # spawned subprocess.Popen handles
        atexit.register(self.shutdown)

    def client_for_chrom(self, chrom, chr_dir):
        """Return a GbwtClient for `chrom`, or None to keep the legacy engine.

        Order: external URL (no spawn) -> spawn a graphd on the chr index
        (graph.gbwt preferred, else graph.gbz) -> None (GBWT off, or no index).
        A missing index under GBWT mode is a warning, not a crash: the app boots
        on the binpath engine for that chr.
        """
        if not self.enabled:
            return None

        if chrom in self.external_urls:
            client = GbwtClient(self.external_urls[chrom])
            if client.health():
                return client
            print(f"  ⚠️  GBWT graphd for {chrom} at {self.external_urls[chrom]} "
                  f"is not responding; using the legacy path engine.")
            return None

        index = next((os.path.join(chr_dir, n) for n in self.index_names
                      if os.path.exists(os.path.join(chr_dir, n))), None)
        if index is None:
            print(f"  ⚠️  GBWT mode on but none of {self.index_names} in {chr_dir}; "
                  f"using the legacy path engine for {chrom}.")
            return None
        if not os.path.exists(self.bin_path):
            print(f"  ⚠️  gbwt-graphd binary not found at {self.bin_path}; "
                  f"using the legacy path engine for {chrom}.")
            return None

        return self._spawn(chrom, index)

    def _spawn(self, chrom, index):
        port = _free_port()
        addr = f"127.0.0.1:{port}"
        # One daemon per chromosome, so the graphd's own default (cores, up to 8)
        # multiplies by chromosome count: a 25-chr datastore spawned 227 accept
        # threads. A request only ever touches one chromosome, so that breadth
        # buys nothing -- concurrency across chromosomes is the app's job, not
        # each daemon's. Cheap either way (those threads sit in accept()), but it
        # should not scale with the genome.
        proc = subprocess.Popen(
            [self.bin_path, index, addr, f"--workers={GRAPHD_WORKERS}"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._procs.append(proc)

        # Wait as long as the daemon is alive. Startup is dominated by loading
        # the index, which scales with it (chr1's GBZ is 396 MB), so a fixed
        # number of tries is a size we haven't hit yet -- and the failure here is
        # quiet: a load that outran the wait fell back to the legacy engine with
        # a warning, so a chr1-scale deploy would just be permanently slower with
        # nothing to show for it. poll() catches the real failure (the daemon
        # died) on every pass, which is the case that must not hang boot.
        client = GbwtClient(f"http://{addr}")
        while not client.health():
            if proc.poll() is not None:
                print(f"  ⚠️  gbwt-graphd for {chrom} exited "
                      f"(code {proc.returncode}); using the legacy path engine.")
                return None
            time.sleep(0.1)

        print(f"  🧬 GBWT graphd for {chrom} ready on {addr}")
        return client

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
