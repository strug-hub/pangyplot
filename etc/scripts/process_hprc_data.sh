export PATH=$PWD:$PATH
THREADS=8
URL_PREFIX=https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.chroms

PANGYPLOT_PY=pangyplot/pangyplot.py

SUFFIX=hprc-v1.1-mc-grch38

OUT=./hprc-data
mkdir -p $OUT

for c in M Y X {1..22}; do
    CHR=chr${c}
    CHR_DIR=${OUT}/${CHR}
    GRAPH=${CHR_DIR}/${CHR}.${SUFFIX}
    
    mkdir -p $CHR_DIR
    
    VG=${GRAPH}.vg
    if [ ! -f "$VG" ]; then
        wget ${URL_PREFIX}/${CHR}.vg
        mv ${CHR}.vg $VG
    fi
    
    OG=${GRAPH}.og
    if [ ! -f "$OG" ]; then
        UNSORTED_GFA=${GRAPH}.unsorted.gfa
        vg convert --gfa-out --no-wline $VG > $UNSORTED_GFA
    
        UNSORTED_OG=${GRAPH}.unsorted.og
        odgi build --optimize -g $UNSORTED_GFA -o $UNSORTED_OG
    
        odgi paths -L -i $UNSORTED_OG | grep "GRCh38" > paths.txt
        odgi paths -L -i $UNSORTED_OG | grep "CHM13" >> paths.txt
    
        odgi sort -t $THREADS --optimize -Y -H paths.txt -i $UNSORTED_OG -o $OG -P
    fi
    
    GFA=${GRAPH}.gfa
    if [ ! -f "$GFA" ]; then
        odgi view -i ${OG} -g > ${GFA} &
    fi
    
    LAYOUT=${GRAPH}.lay.tsv
    if [ ! -f "$LAYOUT" ]; then
        odgi layout -t $THREADS -i ${OG} --tsv $LAYOUT -o ${GRAPH}.lay -P
    fi
    
    PANGYPLOT_DIR=$(dirname "$PANGYPLOT_PY")
    CHECK_DONE=${PANGYPLOT_DIR}/datastore/graphs/${SUFFIX}/${CHR}/.done
    if [ ! -f "$CHECK_DONE" ]; then
        python $PANGYPLOT_PY add --db $SUFFIX --ref GRCh38 --chr $CHR --gfa $GFA --layout $LAYOUT --force
        
        # mark as done
        touch $CHECK_DONE
    fi
    
done
