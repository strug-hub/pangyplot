.. _quickstart:
.. include:: ../substitutions.rst

Quick Start
==============================

Prerequisites
~~~~~~~~~~~~~~~~~~~~~~

- Python 3.11 or higher recommended.
- Install the required Python packages: ``bitarray``, ``sqlite``, ``matplotlib``, ``pympler``, ``flask``, ``python-dotenv``
- `odgi <https://github.com/pangenome/odgi>`_ required to prepare custom data.


.. code-block:: bash

   git clone https://github.com/ScottMastro/pangyplot.git
   cd pangyplot


Quick Start - Running |tool|
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY


This should launch a local web server at http://127.0.0.1:5700 with chrY data that is included with the codebase.


.. dropdown:: What is it doing?

   ``pangyplot run`` loads the specified database (``--db``) and launches the Flask web server.

   The database is loaded from ``datastore/graphs/{db}``. The directory at this location is assumed to be filled with chromosome-specific subdirectories (i.e. ``datastore/graphs/hprc.clip/chrY``).
   Each chromosome directory holds the database files created from a GFA file.
   
   The reference path (``--ref``) is used to specify the primary reference path. 

   The optional gene annotation file (``--annotations``) is similarily loaded from ``datastore/annotations/{ref}/{annotations}`` (i.e. ``datastore/annotations/GRCh38/gencode48.chrY``).

Quick Start - Loading Prepared Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   wget https://zenodo.org/records/17173731/files/chrY.zip
   unzip chrY.zip

   mkdir -p datastore/graphs/hprc.prepared
   mv chrY datastore/graphs/hprc.prepared/chrY

   python pangyplot.py run --db hprc.clip --ref GRCh38

.. dropdown:: What is it doing?

   HPRC chromosome data has been preprocessed and available at: https://doi.org/10.5281/zenodo.17173731
   Here we manually set up the directory structure to store the prepared data.

   Zipping up the directory structure is a convenient way to share prepared |tool| data.


Quick Start - Preparing Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   cd pangyplot
   wget https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.chroms/chrY.vg

   # convert to odgi format - odgi cannot read GFA files with W-lines
   vg convert --no-wline chrY.vg -f > chrY_unsorted.gfa
   odgi build -O -g chrY_unsorted.gfa -o chrY_unsorted.og

   # one-dimensional sort
   odgi paths -L -i chrY_unsorted.og | grep GRCh38 > path_sort_order.txt
   odgi paths -L -i chrY_unsorted.og | grep CHM13 >> path_sort_order.txt
   odgi sort -t 4 --optimize -Y -H path_sort_order.txt -i chrY_unsorted.og -o chrY.og -P

   # create layout file
   odgi layout -t 4 -i chrY.og --tsv chrY.lay.tsv -P

   # create GFA file
   odgi view -i chrY.og -g > chrY.gfa

   python pangyplot.py add --ref GRCh38 --chr chrY --db hprc.test --gfa chrY.gfa --layout chrY.lay.tsv
   python pangyplot.py status --db hprc.test
   python pangyplot.py run --db hprc.test --ref GRCh38

.. dropdown:: What is it doing?

   This is how the data was prepared for the previous example. 
   |tool| requires a GFA file and an layout file to create the database.
   Here we optimize the graph for the primary reference path GRCh38 during the 1D sort.