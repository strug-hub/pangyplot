DIR="static/data/hprc_chr3"
PREFIX="${DIR}/chr3.d9"
THREADS=15

VG="${PREFIX}.vg"
XG="${PREFIX}.xg"
uGFA="${PREFIX}.uncompact.gfa"
GFA="${PREFIX}.gfa"
ODGI="${PREFIX}.og"

#odgi can't handle W lines
#vg view -g -$VG > $GFA
vg convert -W -f $VG > $uGFA

# --------------- LAYOUT FILE ----------------------------
odgi build -t $THREADS -g $uGFA -O -o $ODGI
odgi layout -t $THREADS -i ${ODGI} --tsv ${PREFIX}.lay.tsv -o ${PREFIX}.lay

# --------------- GFA FILE ----------------------------

odgi view -t $THREADS -i $ODGI -g > $GFA 


# --------------- POSITION FILE SETUP ----------------------------

odgi paths -L -i $ODGI

cat ${GFA} | grep ^S | cut -f2 > ${DIR}/segment_starts.txt
odgi position -t $THREADS -i ${ODGI} -r CHM13#chr3 --graph-pos-file ${DIR}/segment_starts.txt > ${DIR}/start_positions.txt
rm ${DIR}/segment_starts.txt

cat ${GFA} | grep ^S | awk '{print $2 "," length($3)-1}' > ${DIR}/segment_ends.txt
odgi position -t $THREADS -i ${ODGI} -r CHM13#chr3 --graph-pos-file ${DIR}/segment_ends.txt > ${DIR}/end_positions.txt
rm ${DIR}/segment_ends.txt

awk -F"[,\t]" '{print $1 "\t" $4 ":" $5+1}' ${OUT}/start_positions.txt | grep -v ^"#" | sort -k1,1 > tmp1.txt
awk -F"[,\t]" '{print $1 "\t" $4 ":" $5+1}' ${OUT}/end_positions.txt | grep -v ^"#" | sort -k1,1 > tmp2.txt

# --------------- POSITION FILE ----------------------------

join -t $'\t' tmp1.txt tmp2.txt > ${OUT}/node_positions.txt
rm tmp1.txt ; rm tmp2.txt

