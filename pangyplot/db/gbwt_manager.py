"""Sidecar lifecycle for the GBWT path engine (GBWT migration Stage 3).

Owns the per-chromosome GBWT sidecar processes and hands back a GbwtClient for
each. GBWT mode is opt-in and reversible: when it is off (the default) the app
uses the legacy binpath PathIndex and this module does nothing.

Configuration (env vars, read at startup — matches the rest of app.py):

    PANGYPLOT_GBWT       "1"/"true" to enable the GBWT path engine (default off)
    PANGYPLOT_GBWT_BIN   path to the gbwt-sidecar binary
                         (default: tools/gbwt-sidecar/target/release/gbwt-sidecar)
    PANGYPLOT_GBWT_GBZ   per-chr GBZ filename inside each chr dir (default graph.gbz)
    PANGYPLOT_GBWT_URLS  optional JSON {chrom: base_url} — point at externally
                         managed sidecars instead of spawning. Production sets
                         this and runs the sidecars however it likes; Flask never
                         spawns a subprocess.

Each chromosome's GBZ is a separate in-memory index, so it gets its own sidecar
on its own localhost port (the wire contract is one-GBZ-per-service). Spawned
processes are terminated on shutdown (atexit + explicit shutdown()).
"""
import atexit
import json
import os
import socket
import subprocess
import time

from pangyplot.db.gbwt_client import GbwtClient

DEFAULT_BIN = os.path.join("tools", "gbwt-sidecar", "target", "release", "gbwt-sidecar")
DEFAULT_GBZ_NAME = "graph.gbz"
_TRUE = {"1", "true", "yes", "on"}


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class GbwtManager:
    """Starts/stops GBWT sidecars and vends clients, one per chromosome."""

    def __init__(self, repo_root=None):
        self.enabled = os.getenv("PANGYPLOT_GBWT", "").lower() in _TRUE
        self.repo_root = repo_root or os.getcwd()

        bin_path = os.getenv("PANGYPLOT_GBWT_BIN", DEFAULT_BIN)
        if not os.path.isabs(bin_path):
            bin_path = os.path.join(self.repo_root, bin_path)
        self.bin_path = bin_path

        self.gbz_name = os.getenv("PANGYPLOT_GBWT_GBZ", DEFAULT_GBZ_NAME)

        urls = os.getenv("PANGYPLOT_GBWT_URLS")
        self.external_urls = json.loads(urls) if urls else {}

        self._procs = []  # spawned subprocess.Popen handles
        atexit.register(self.shutdown)

    def client_for_chrom(self, chrom, chr_dir):
        """Return a GbwtClient for `chrom`, or None to keep the legacy engine.

        Order: external URL (no spawn) -> spawn a sidecar on the chr GBZ ->
        None (GBWT off, or GBZ missing). A missing GBZ under GBWT mode is a
        warning, not a crash: the app boots on the binpath engine for that chr.
        """
        if not self.enabled:
            return None

        if chrom in self.external_urls:
            client = GbwtClient(self.external_urls[chrom])
            if client.health():
                return client
            print(f"  ⚠️  GBWT sidecar for {chrom} at {self.external_urls[chrom]} "
                  f"is not responding; using the legacy path engine.")
            return None

        gbz = os.path.join(chr_dir, self.gbz_name)
        if not os.path.exists(gbz):
            print(f"  ⚠️  GBWT mode on but no {self.gbz_name} in {chr_dir}; "
                  f"using the legacy path engine for {chrom}.")
            return None
        if not os.path.exists(self.bin_path):
            print(f"  ⚠️  gbwt-sidecar binary not found at {self.bin_path}; "
                  f"using the legacy path engine for {chrom}.")
            return None

        return self._spawn(chrom, gbz)

    def _spawn(self, chrom, gbz):
        port = _free_port()
        addr = f"127.0.0.1:{port}"
        proc = subprocess.Popen([self.bin_path, gbz, addr],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._procs.append(proc)

        client = GbwtClient(f"http://{addr}")
        for _ in range(100):  # ~10s: GBZ load can take a few hundred ms
            if proc.poll() is not None:
                print(f"  ⚠️  gbwt-sidecar for {chrom} exited "
                      f"(code {proc.returncode}); using the legacy path engine.")
                return None
            if client.health():
                print(f"  🧬 GBWT sidecar for {chrom} ready on {addr}")
                return client
            time.sleep(0.1)

        print(f"  ⚠️  gbwt-sidecar for {chrom} did not become ready; "
              f"using the legacy path engine.")
        self._terminate(proc)
        return None

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
