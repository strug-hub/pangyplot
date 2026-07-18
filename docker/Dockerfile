# PangyPlot — CPU image (the default, small variant).
#
# Covers the full pipeline (raw GFA -> odgi build/sort/layout -> pangyplot add
# -> serve) using CPU odgi from bioconda, plus the GBWT path daemon (graphd)
# built reproducibly from the pinned C++ submodules in deps/. Serves the bundled
# HPRC chrY demo out of the box (binpath engine; GBWT is opt-in via
# PANGYPLOT_GBWT=1 for GBZ-native datastores). Runs on any machine.
#
# For GPU-accelerated odgi layout, build docker/Dockerfile.gpu instead.
#
# IMPORTANT: the C++ toolchain lives in git submodules, so the build context
# must include them -- clone recursively before building:
#   git clone --recurse-submodules https://github.com/strug-hub/pangyplot
#   # (existing checkout: git submodule update --init --recursive)
#   docker build -f docker/Dockerfile -t pangyplot .
#   docker run --rm -p 5700:5700 pangyplot
#   then open http://localhost:5700/#chrY:23129355-23199010

# ---------------------------------------------------------------------------
# Stage 1 — build the GBWT graphd from the pinned toolchain (deps/ submodules).
# Static gbwt + sdsl are baked into the binary; only libstdc++/gomp/zstd/libc
# remain as dynamic deps, so the runtime stage stays slim.
# ---------------------------------------------------------------------------
FROM debian:12-slim AS graphd-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        g++ make cmake pkg-config libzstd-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
# Pinned sources (see deps/README.md): sdsl-lite @ 349de44, gbwt-mmap @ ac9a59a.
COPY deps/sdsl-lite deps/sdsl-lite
COPY deps/gbwt-mmap deps/gbwt-mmap
COPY gbwt/graphd    gbwt/graphd

# 1. sdsl-lite -> /opt/sdsl (headers + libsdsl.a; also writes deps/sdsl-lite/Make.helper)
RUN cd deps/sdsl-lite && ./install.sh /opt/sdsl
# 2. gbwt-mmap finds sdsl via ../sdsl-lite/Make.helper -> lib/libgbwt.a + include/
RUN make -C deps/gbwt-mmap -j"$(nproc)"
# 3. graphd: links the two static archives + dynamic zstd/OpenMP.
RUN make -C gbwt/graphd -j"$(nproc)" GBWT_DIR=/src/deps/gbwt-mmap SDSL_PREFIX=/opt/sdsl \
    && strip gbwt/graphd/pangyplot-graphd \
    && gbwt/graphd/pangyplot-graphd 2>&1 | head -1   # smoke-test: prints usage

# ---------------------------------------------------------------------------
# Stage 2 — runtime image.
# ---------------------------------------------------------------------------
FROM debian:12-slim

# OCI image metadata — populates the GHCR package page and links it to the repo.
LABEL org.opencontainers.image.title="PangyPlot" \
      org.opencontainers.image.description="Interactive pangenome graph browser — serves the bundled HPRC chrY demo out of the box and runs the full raw-GFA -> odgi -> pangyplot pipeline. CPU image (default)." \
      org.opencontainers.image.source="https://github.com/strug-hub/pangyplot" \
      org.opencontainers.image.url="https://pangyplot.research.sickkids.ca/" \
      org.opencontainers.image.documentation="https://pangyplot.readthedocs.io/" \
      org.opencontainers.image.licenses="MIT"

ENV DEBIAN_FRONTEND=noninteractive

# Shell tools for generated preprocess scripts, curl for micromamba, and the
# graphd's dynamic runtime libs (libstdc++6/libgomp1/libzstd1).
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl bzip2 gzip bash \
        libstdc++6 libgomp1 libzstd1 \
    && rm -rf /var/lib/apt/lists/*

# micromamba: clean Python 3.11 env + CPU odgi (bioconda) + gunicorn.
ENV MAMBA_ROOT_PREFIX=/opt/conda
RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest \
        | tar -xj -C /usr/local bin/micromamba \
    && micromamba create -y -p ${MAMBA_ROOT_PREFIX} -c conda-forge -c bioconda \
        python=3.11 odgi gunicorn \
    && micromamba clean --all --yes
ENV PATH=${MAMBA_ROOT_PREFIX}/bin:${PATH}

# vg — needed to convert HPRC's per-chromosome .vg graphs into the P-line GFA
# odgi can read (odgi cannot parse W-lines, hence --no-wline). Upstream ships a
# static binary, so there is nothing to build and no runtime deps to install.
ARG VG_VERSION=v1.69.0
RUN curl -fsSL -o /usr/local/bin/vg \
        https://github.com/vgteam/vg/releases/download/${VG_VERSION}/vg \
    && chmod +x /usr/local/bin/vg \
    && vg version

WORKDIR /app

# Python deps first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code + bundled demo datastore. (deps/ submodule sources come along
# but are only needed at build time; the compiled graphd is copied in below.)
COPY . .

# The reproducibly-built graphd, overwriting whatever the context carried.
# GbwtManager resolves gbwt/graphd/pangyplot-graphd relative to the repo root (/app).
COPY --from=graphd-builder /src/gbwt/graphd/pangyplot-graphd /app/gbwt/graphd/pangyplot-graphd

# Defaults target the committed HPRC chrY demo; override any at runtime.
# GBWT is opt-in: set PANGYPLOT_GBWT=1 to serve a GBZ-native datastore via graphd.
ENV PANGYPLOT_DATA=/app/datastore \
    PANGYPLOT_DB=hprc.clip \
    PANGYPLOT_REF=GRCh38 \
    PANGYPLOT_ANNOTATION=gencode48.chrY \
    PANGYPLOT_PORT=5700 \
    PANGYPLOT_WORKERS=1 \
    PANGYPLOT_THREADS=4 \
    PANGYPLOT_TIMEOUT=120 \
    ODGI=odgi

EXPOSE 5700

# The entrypoint IS the CLI: `docker run <image> <args>` runs `pangyplot <args>`,
# so container commands are identical to host commands (serve/add/annotate/...).
# The default CMD serves the committed HPRC chrY demo; `serve` is the production
# sibling of `run` (gunicorn, bound to 0.0.0.0 so it is reachable from the host).
ENTRYPOINT ["python", "/app/pangyplot.py"]
CMD ["serve", "--db", "hprc.clip", "--ref", "GRCh38", "--annotations", "gencode48.chrY"]
