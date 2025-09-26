.. _quickstart:
.. include:: ../substitutions.rst

Quick Start
==============================

Prerequisites
~~~~~~~~~~~~~~~~~~~~~~

- Python 3.11 or higher recommended.
- Install the required Python packages: ``bitarray``, ``sqlite``, ``matplotlib``, ``pympler``, ``flask``, ``python-dotenv``
- `odgi <https://github.com/pangenome/odgi>`_ required to prepare custom data.



Quick Start With Preprocessed Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   git clone https://github.com/ScottMastro/pangyplot.git
   cd pangyplot

.. code-block:: bash

   python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY


This should launch a local web server at http://127.0.0.1:5700 with chrY data.


.. dropdown:: What is it doing?

    ``pangyplot run`` loads the specified database (``--db``) and launches the Flask web server.

    The database is loaded from ``datastore/graphs/{db}``. The directory at this location is assumed to be filled with chromosome-specific subdirectories (i.e. ``datastore/graphs/hprc.clip/chrY``).
    Each chromosome directory holds the database files created from a GFA file.
    
    The reference path (``--ref``) is used to specify the primary reference path. 

    The optional gene annotation file (``--annotations``) is similarily loaded from ``datastore/annotations/{ref}/{annotations}`` (i.e. ``datastore/annotations/GRCh38/gencode48.chrY``).

Quick Start With Custom Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

cd pangyplot
cp example/DRB1-3123_unsorted.gfa .

odgi build -g DRB1-3123_unsorted.gfa -o DRB1-3123_unsorted.og

# one-dimensional sort
odgi paths -L -i DRB1-3123_unsorted.og
echo "gi|28212470:131613-146345" > path_sort_order.txt
odgi sort -t 4 --optimize -Y -H path_sort_order.txt -i DRB1-3123_unsorted.og -o DRB1-3123.og -P

# create layout file
odgi layout -t 4 -i DRB1-3123.og --tsv DRB1-3123.lay.tsv -P

# create GFA file
odgi view -i DRB1-3123.og -g > DRB1-3123.gfa

python pangyplot.py add --ref "gi|28212470" --chr DRB1-3123 --db DRB1 --gfa DRB1-3123.gfa --layout DRB1-3123.lay.tsv
python pangyplot.py run --db DRB1 --ref "gi|28212470"



To run |tool| from scratch locally or on a remote server, you’ll need the following:

1. The |tool| `source code`_.
2. A GFA graph file.
3. An odgi layout file.
4. Gene annotation file [optional].

.. _source code: https://github.com/scottmastro/pangyplot



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

