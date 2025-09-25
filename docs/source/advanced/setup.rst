.. include:: ../substitutions.rst
.. _setup:

Quick Example
==============================

.. figure:: ../_images/logo/odgi.png
   :alt: odgi "logo"
   :width: 120px
   :target: layout.html

   **Prerequisite**: `odgi <https://github.com/pangenome/odgi>`_ installed to calculate graph layout.




Setting up with HPRC data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To test |tool| with Human Pangenome Reference Consortium (HPRC) data, follow the steps below.

- **Resource**: `https://github.com/human-pangenomics/hpp_pangenome_resources <https://github.com/human-pangenomics/hpp_pangenome_resources>`_
- **Download directory**: `hprc-v1.1-mc-grch38.chroms <https://s3-us-west-2.amazonaws.com/human-pangenomics/index.html?prefix=pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.chroms>`_

**Example: Setup for chromosome 7**

.. code-block:: bash

   THREADS=16

   OUT=./data
   mkdir -p $OUT
   PREFIX=./${OUT}/chr7.d9

   wget https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.chroms/chr7.d9.vg 
   mv chr7.d9.vg ${PREFIX}.vg

   vg convert ${PREFIX}.vg -W -f > ${PREFIX}.gfa

   odgi build -t $THREADS -g ${PREFIX}.gfa -O -o ${PREFIX}.unsorted.og
   odgi sort -t $THREADS -Y -i ${PREFIX}.unsorted.og -o ${PREFIX}.sorted.og
   odgi normalize -t $THREADS -i ${PREFIX}.sorted.og -o ${PREFIX}.og

   # --------------- LAYOUT FILE ----------------------------
   odgi layout -t $THREADS -i ${PREFIX}.og --tsv ${PREFIX}.lay.tsv -o ${PREFIX}.lay

   # --------------- GFA FILE ----------------------------
   odgi view -t $THREADS -i ${PREFIX}.og -g > ${PREFIX}.gfa

   cat ${PREFIX}.gfa | grep ^P | cut -f 2 | grep CHM13 > ${OUT}/reference_paths.txt
   cat ${PREFIX}.gfa | grep ^S | cut -f2 > ${OUT}/segment_starts.txt
   cat ${PREFIX}.gfa | grep ^S | awk '{print $2 "," length($3)-1}' > ${OUT}/segment_ends.txt

   odgi position -t $THREADS -i ${PREFIX}.og --ref-paths ${OUT}/reference_paths.txt --graph-pos-file ${OUT}/segment_starts.txt > ${OUT}/start_positions.txt
   odgi position -t $THREADS -i ${PREFIX}.og --ref-paths ${OUT}/reference_paths.txt --graph-pos-file ${OUT}/segment_ends.txt > ${OUT}/end_positions.txt

   awk -F"[,\t]" '{print $1 "\t" $4 ":" $5+1}' ${OUT}/start_positions.txt | grep -v ^"#" | sort -k1,1 > tmp1.txt
   awk -F"[,\t]" '{print $1 "\t" $4 ":" $5+1}' ${OUT}/end_positions.txt | grep -v ^"#" | sort -k1,1 > tmp2.txt

   # --------------- POSITION FILE ----------------------------
   join -t $'\t' tmp1.txt tmp2.txt > ${OUT}/node_positions.txt
   rm tmp1.txt ; rm tmp2.txt

pangyplot setup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Sets up the environment by generating a `.env` file used to configure the Neo4j database connection and other variables.

You will be interactively prompted for:

- **DB_USER** – Neo4j username (default: `neo4j`)
- **DB_PASS** – Neo4j password (default: `password`)
- **DB_HOST** – Host address (e.g., `bolt://localhost`)
- **DB_PORT** – Port number (default: `7687`)
- **GA_TAG_ID** – Optional Google Analytics ID

If a `.env` file already exists, you will be prompted whether to overwrite it. Existing values are shown as defaults.