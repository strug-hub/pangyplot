#!/usr/bin/env bash
# Warm up the datastore (build any missing paths/indexes/skeleton the same way
# `pangyplot run` does — wsgi.py skips this) then serve via gunicorn on 0.0.0.0.
set -euo pipefail

DATA="${PANGYPLOT_DATA:-/app/datastore}"
DB="${PANGYPLOT_DB:-hprc.clip}"
REF="${PANGYPLOT_REF:-GRCh38}"

# Report the odgi toolchain (informational — odgi is only used to *prepare*
# custom data, not to serve an existing datastore).
if command -v odgi >/dev/null 2>&1; then
    echo "PangyPlot: CPU odgi available -> $(command -v odgi)"
fi
if command -v odgi_gpu >/dev/null 2>&1; then
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
        echo "PangyPlot: GPU detected -> odgi_gpu can accelerate 'odgi layout --gpu'"
    else
        echo "PangyPlot: odgi_gpu present but no GPU visible (run with --gpus all to enable); CPU odgi will be used"
    fi
fi

echo "PangyPlot: preparing datastore (db=${DB}, ref=${REF}) ..."
python - "$DATA" "$DB" "$REF" <<'PY'
import sys
from pangyplot.preprocess.ensure_paths import ensure_paths
from pangyplot.db.indexes.ensure_indexes import ensure_indexes
from pangyplot.preprocess.skeleton.generate_skeleton import ensure_skeleton

data_dir, db_name, ref = sys.argv[1], sys.argv[2], sys.argv[3]
ensure_paths(data_dir, db_name)
ensure_indexes(data_dir, db_name, ref)
ensure_skeleton(data_dir, db_name, ref)
PY

echo "PangyPlot: starting server on 0.0.0.0:${PANGYPLOT_PORT:-5700}"
exec gunicorn \
    --bind "0.0.0.0:${PANGYPLOT_PORT:-5700}" \
    --workers "${PANGYPLOT_WORKERS:-1}" \
    --threads "${PANGYPLOT_THREADS:-4}" \
    --timeout "${PANGYPLOT_TIMEOUT:-120}" \
    wsgi:app
