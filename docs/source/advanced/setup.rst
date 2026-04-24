.. _setup:

Dotenv Setup
==============================

``pangyplot setup`` is a utility to configure the PangyPlot environment.

This configures the environment by generating a ``.env`` file.
This file contains key variables that define application parameters.

If a ``.env`` file already exists, you will be prompted whether to overwrite it.
Existing values are shown as defaults, and you may press Enter to accept them.

Environment Variables
------------------------------

The following variables are supported:

- **GA_TAG_ID** *(optional)*  
  Google Analytics tag ID.  
  Default: ``None``

Cytoband Settings
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **ORGANISM** *(optional)*
  Organism key used to select the cytoband reference. Must be one of the keys defined in ``pangyplot/organisms.py``:
  ``human-hg38``, ``human-t2t``, ``mouse``, ``fruitfly``, ``zebrafish``, ``chicken``, ``rabbit``, ``dog``,
  or the special values ``none`` (no cytoband) or ``custom`` (bring your own).
  Default: ``human-hg38``.

- **CYTOBAND_PATH** *(conditional)*
  Path to a custom cytoband file.
  Required only if ``ORGANISM=custom``.
  Default: none.

- **CANONICAL_PATH** *(conditional)*
  Path to a canonical chromosome definition file.
  Required only if ``ORGANISM=custom``.
  Default: none.

For Production Deployment
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **PANGYPLOT_DATA** *(optional)*
  Absolute path to the directory containing PangyPlot database files.
  Default: the ``datastore/`` directory next to ``wsgi.py``.

- **PANGYPLOT_DB** *(optional)*
  Name of the PangyPlot database.
  Default: ``_default_``.

- **PANGYPLOT_ANNOTATION** *(optional)*
  Annotation dataset to load with the graph.
  Default: ``None``.

- **PANGYPLOT_REF** *(optional)*
  Reference genome identifier used by the dataset.
  Default: ``None``.

- **PANGYPLOT_PORT** *(optional)*
  Port number for running the PangyPlot web application.
  Default: ``5700``.

