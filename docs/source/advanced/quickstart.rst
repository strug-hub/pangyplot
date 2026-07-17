.. _quickstart:

Quick Start
==============================

Prerequisites
~~~~~~~~~~~~~~~~~~~~~~

- Python 3.11 or higher recommended.
- `odgi <https://github.com/pangenome/odgi>`_ required to prepare custom data.

.. code-block:: bash

   git clone https://github.com/strug-hub/pangyplot.git
   cd pangyplot
   pip install -r requirements.txt

``gunicorn`` is additionally recommended for production deployment but is not required for local development (Flask's built-in server is used in that case). See the commented line in ``requirements.txt``.


Quick Start - Docker Container
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you would rather skip installing Python and ``odgi`` yourself, a prebuilt
container image ships the entire toolchain and serves the bundled chrY demo out
of the box:

.. code-block:: bash

   docker run --rm -p 5700:5700 ghcr.io/strug-hub/pangyplot:latest

Then open http://127.0.0.1:5700/#chrY:23129355-23199010.

The image bundles ``odgi``, so it covers the full data-preparation pipeline
(see *Preparing Data* below) as well as running. To serve your own prepared
data, mount a datastore directory over ``/app/datastore`` and point the
``PANGYPLOT_*`` variables at it:

.. code-block:: bash

   docker run --rm -p 5700:5700 \
       -v "$PWD/my-datastore:/app/datastore" \
       -e PANGYPLOT_DB=my.db -e PANGYPLOT_REF=GRCh38 \
       ghcr.io/strug-hub/pangyplot:latest

See :ref:`setup` for the full list of ``PANGYPLOT_*`` variables the container reads.

The moving ``:latest`` tag tracks the newest build; pin a specific version with
e.g. ``ghcr.io/strug-hub/pangyplot:0.3.0``.

.. dropdown:: Prepare your own data in the container (GFA → server)

   The image bundles the whole toolchain (``vg``, ``odgi``, ``pangyplot``, and
   the GBWT ``graphd``), so the *Preparing Data* steps below run entirely inside
   the container — nothing to install locally. Override the entrypoint to run the
   pipeline into a mounted work directory, then serve what you built. Using the
   same chrY example:

   .. code-block:: bash

      mkdir -p work
      wget -P work https://s3-us-west-2.amazonaws.com/human-pangenomics/pangenomes/freeze/freeze1/minigraph-cactus/hprc-v1.1-mc-grch38/hprc-v1.1-mc-grch38.chroms/chrY.vg

      # build the datastore in-container (vg -> odgi -> pangyplot add)
      docker run --rm -v "$PWD/work:/work" --entrypoint bash \
          ghcr.io/strug-hub/pangyplot:0.3.0 -c '
        cd /work
        vg convert --no-wline chrY.vg -f > chrY_unsorted.gfa
        odgi build -O -g chrY_unsorted.gfa -o chrY_unsorted.og
        odgi paths -L -i chrY_unsorted.og | grep GRCh38 >  path_sort_order.txt
        odgi paths -L -i chrY_unsorted.og | grep CHM13  >> path_sort_order.txt
        odgi sort -t 4 --optimize -Y -H path_sort_order.txt -i chrY_unsorted.og -o chrY.og -P
        odgi layout -t 4 -i chrY.og --tsv chrY.lay.tsv -P
        odgi view -i chrY.og -g > chrY.gfa
        python pangyplot.py add --ref GRCh38 --chr chrY --db hprc.test \
            --gfa chrY.gfa --layout chrY.lay.tsv --dir /work/datastore
      '

      # serve the datastore you just built
      docker run --rm -p 5700:5700 -v "$PWD/work/datastore:/app/datastore" \
          -e PANGYPLOT_DB=hprc.test -e PANGYPLOT_REF=GRCh38 -e PANGYPLOT_ANNOTATION= \
          ghcr.io/strug-hub/pangyplot:0.3.0

   See *Preparing Data* below for what each ``odgi`` step does. (Gene annotations
   are optional — add them later with ``pangyplot annotate``.)

.. dropdown:: GPU-accelerated layout

   ``odgi layout`` can be run on an NVIDIA GPU for a large speedup on complex
   graphs. A CUDA-enabled ``odgi_gpu`` build is published under the ``:gpu`` tag:

   .. code-block:: bash

      docker run --rm --device nvidia.com/gpu=all -p 5700:5700 \
          ghcr.io/strug-hub/pangyplot:gpu

   This requires an NVIDIA host with the `nvidia-container-toolkit
   <https://github.com/NVIDIA/nvidia-container-toolkit>`_ installed; it also runs
   CPU-only if launched without ``--device``.

   .. note::

      The GPU image accelerates ``odgi layout`` for data preparation only; it
      does not currently bundle the GBWT path daemon. Use the default (CPU)
      image to serve GBZ-native datastores with ``PANGYPLOT_GBWT=1``.


Quick Start - Running PangyPlot
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY


This should launch a local web server at http://127.0.0.1:5700 with chrY data that is included with the codebase.


.. dropdown:: What is it doing?

   ``pangyplot run`` loads the specified database (``--db``) and launches the Flask web server.

   The database is loaded from ``datastore/graphs/{db}``. The directory at this location is assumed to be filled with chromosome-specific subdirectories (i.e. ``datastore/graphs/hprc.clip/chrY``).
   Each chromosome directory holds the database files created from a GFA file.
   
   The reference path (``--ref``) is used to specify the primary reference path. 

   The optional gene annotation file (``--annotations``) is similarly loaded from ``datastore/annotations/{ref}/{annotations}`` (i.e. ``datastore/annotations/GRCh38/gencode48.chrY``).

Quick Start - Loading Prepared Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. code-block:: bash

   wget https://zenodo.org/records/17174109/files/chrY.zip
   unzip chrY.zip

   mkdir -p datastore/graphs/hprc.prepared
   mv chrY datastore/graphs/hprc.prepared/chrY

   python pangyplot.py run --db hprc.prepared --ref GRCh38

.. dropdown:: What is it doing?

   HPRC chromosome data has been preprocessed and available at: https://doi.org/10.5281/zenodo.17174109
   Here we manually set up the directory structure to store the prepared data.

   Note that this is the *processed database* record, ready to ``run``. The
   companion record https://doi.org/10.5281/zenodo.17173731 holds the *inputs*
   (GFA + odgi layout) for those chromosomes, which is what you would feed to
   ``pangyplot add`` if you wanted to preprocess them yourself.

   Zipping up the directory structure is a convenient way to share prepared PangyPlot data.


Quick Start - Preparing Data
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. tip::
   The steps below can be generated for you interactively with
   :ref:`pangyplot-preprocess`, which writes a tailored shell (or SLURM)
   script from a few prompts. The manual walkthrough below is kept for
   reference and for cases where you want finer control over the
   individual ``odgi`` invocations.

.. note::
   For the HPRC chromosomes specifically, the ``vg``/``odgi`` steps below have
   already been run for you: https://doi.org/10.5281/zenodo.17173731 hosts the
   resulting GFA + layout pair per chromosome. Download one and skip straight to
   ``pangyplot add``.

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
   PangyPlot requires a GFA file and an layout file to create the database.
   Here we optimize the graph for the primary reference path GRCh38 during the 1D sort.