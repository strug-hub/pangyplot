# PangyPlot — CPU image (the default, small variant).
#
# Covers the full pipeline (raw GFA -> odgi build/sort/layout -> pangyplot add
# -> serve) using CPU odgi from bioconda, with no manual dependency setup, and
# serves the bundled HPRC chrY demo out of the box. Runs on any machine.
#
# For GPU-accelerated odgi layout, build docker/Dockerfile.gpu instead.
#
# Build with the repo root as context (the image needs the app + datastore/):
#   docker build -f docker/Dockerfile -t pangyplot .
#   docker run --rm -p 5700:5700 pangyplot
#   then open http://localhost:5700/#chrY:23129355-23199010

FROM debian:12-slim
ENV DEBIAN_FRONTEND=noninteractive

# Shell tools used by generated preprocess scripts + curl for micromamba.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl bzip2 gzip bash \
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

# Application code + bundled demo datastore.
COPY . .

# Defaults target the committed HPRC chrY demo; override any at runtime.
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

# Invoked via bash so the move into docker/ doesn't depend on the exec bit
# surviving checkout. WORKDIR stays /app, so gunicorn resolves wsgi:app.
ENTRYPOINT ["bash", "docker/docker-entrypoint.sh"]
