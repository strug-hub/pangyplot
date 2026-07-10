# PangyPlot — single image bundling BOTH odgi (CPU) and odgi_gpu (CUDA GPU).
#
# Covers the full pipeline (raw GFA -> odgi build/sort/layout -> pangyplot add
# -> serve) with no manual dependency setup, and serves the bundled HPRC chrY
# demo out of the box.
#
# Build with the repo root as context (the image needs the app + datastore/):
#   docker build -f docker/Dockerfile -t pangyplot .
#
#   CPU (any host):    docker run --rm -p 5700:5700 pangyplot
#   GPU (NVIDIA host): docker run --rm --device nvidia.com/gpu=all -p 5700:5700 pangyplot
#   then open          http://localhost:5700/#chrY:23129355-23199010
#
# `odgi`      -> CPU build (bioconda), the default; runs anywhere.
# `odgi_gpu`  -> GPU build (-DUSE_GPU=ON); used for `odgi_gpu layout --gpu`
#               on an NVIDIA host. nvcc compiles without a GPU present; a device
#               is only needed at runtime.

# ---------------------------------------------------------------------------
# Stage 1: compile GPU-enabled odgi from source.
# ---------------------------------------------------------------------------
FROM nvidia/cuda:12.3.2-devel-ubuntu22.04 AS build-odgi
ENV DEBIAN_FRONTEND=noninteractive
# Build deps per odgi's own Dockerfile, plus ca-certificates for the https clone.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git bash make g++ build-essential cmake pkg-config autoconf \
        ca-certificates python3-dev python3-distutils \
        libatomic-ops-dev libgsl-dev zlib1g-dev libzstd-dev \
        libjemalloc-dev libhts-dev \
    && rm -rf /var/lib/apt/lists/*

# odgi's CMakeLists auto-detects the build host's GPU and OVERWRITES
# CMAKE_CUDA_ARCHITECTURES, so CUDAARCHS/-DCMAKE_CUDA_ARCHITECTURES are ignored.
# There is no GPU during an image build, so detection would fall back to CMake's
# "common architectures" (no Ada sm_89). We pre-seed odgi's detection cache var
# CUDA_GPU_DETECT_OUTPUT with the target compute capabilities (dotted, space-
# separated) so it builds real SASS for them. 8.9 = Ada (RTX 40-series, e.g. the
# RTX 4050); 8.0 = A100; 8.6 = common Ampere. Edit this list for other GPUs.
# CMAKE_BUILD_TYPE=Generic (odgi's default) avoids -march=native for CPU portability.
RUN git clone --recursive https://github.com/pangenome/odgi.git /opt/odgi-src \
    && cd /opt/odgi-src \
    && cmake -DUSE_GPU=ON -DCMAKE_BUILD_TYPE=Generic \
             -DCUDA_GPU_DETECT_OUTPUT="8.0 8.6 8.9" -H. -Bbuild \
    && cmake --build build -- -j"$(nproc)" \
    && cp bin/odgi /usr/local/bin/odgi_gpu \
    && (strip /usr/local/bin/odgi_gpu || true)

# ---------------------------------------------------------------------------
# Stage 2: runtime image — CUDA runtime + CPU odgi + Python + PangyPlot.
# ---------------------------------------------------------------------------
FROM nvidia/cuda:12.3.2-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive

# Runtime libs odgi_gpu links against + shell tools used by generated preprocess
# scripts. (CUDA runtime libs come from the base image.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libjemalloc2 libgomp1 libatomic1 libgsl27 libzstd1 libhts3 zlib1g \
        gzip bash ca-certificates bzip2 curl \
    && rm -rf /var/lib/apt/lists/*

# GPU odgi binary from the build stage.
COPY --from=build-odgi /usr/local/bin/odgi_gpu /usr/local/bin/odgi_gpu

# micromamba: clean Python 3.11 env + CPU odgi (bioconda) + gunicorn.
ENV MAMBA_ROOT_PREFIX=/opt/conda
RUN curl -Ls https://micro.mamba.pm/api/micromamba/linux-64/latest \
        | tar -xj -C /usr/local bin/micromamba \
    && micromamba create -y -p ${MAMBA_ROOT_PREFIX} -c conda-forge -c bioconda \
        python=3.11 odgi gunicorn \
    && micromamba clean --all --yes
ENV PATH=${MAMBA_ROOT_PREFIX}/bin:${PATH}

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
    ODGI=odgi \
    ODGI_GPU=odgi_gpu

EXPOSE 5700

# Invoked via bash so the move into docker/ doesn't depend on the exec bit
# surviving checkout. WORKDIR stays /app, so gunicorn resolves wsgi:app.
ENTRYPOINT ["bash", "docker/docker-entrypoint.sh"]
