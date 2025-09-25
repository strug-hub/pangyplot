.. _advanced_usage:
.. include:: ../substitutions.rst

Advanced Usage
==============

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


.. toctree::
    :maxdepth: 2
    :caption: Advanced Topics

    setup
    organisms
    subcommands
    layout
    bubblegun
    schema
    forcegraph
