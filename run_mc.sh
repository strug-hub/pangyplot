#!/bin/bash
DATA=../data/minigraph_cactus
DB=hprc.mc

for CHR in chrM chrY chrX chr22 chr21 chr20 chr19 chr18 chr17 chr16 chr15 chr14 chr13 chr12 chr11 chr10 chr9 chr8 chr7 chr6 chr5 chr4 chr3 chr2 chr1; do
    if [ -f "datastore/graphs/$DB/$CHR/timings.tsv" ]; then
        echo "[SKIP] $CHR (timings.tsv exists)"
        continue
    fi
    python pangyplot.py add \
        --db "$DB" \
        --ref grch38 \
        --chr "$CHR" \
        --gfa  "$DATA/$CHR/$CHR.mc-grch38.sorted.gfa.gz" \
        --layout "$DATA/$CHR/$CHR.mc-grch38.lay.tsv.gz" \
        --force \
        || echo "[FAILED] $CHR"
done
