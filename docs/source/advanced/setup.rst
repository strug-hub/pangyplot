.. include:: ../substitutions.rst
.. _setup:

Dotenv Setup
==============================

The |tool| setup utility configures the environment by generating a ``.env`` file.
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

- **ORGANISM** *(required)*  
  Organism to use for cytoband reference. Must be one of:  
  ``NO_ORGANISM``, ``CUSTOM_ORGANISM``, or a supported reference (e.g., GRCh38).  
  Default: value of ``DEFAULT_ORGANISM`` in PangyPlot.

- **CYTOBAND_PATH** *(conditional)*  
  Path to a custom cytoband file.  
  Required only if ``ORGANISM=CUSTOM_ORGANISM``.  
  Default: none

- **CANONICAL_PATH** *(conditional)*  
  Path to a canonical chromosome definition file.  
  Required only if ``ORGANISM=CUSTOM_ORGANISM``.  
  Default: none

For Production Deployment
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- **PANGYPLOT_DATA** *(required)*  
  Absolute path to the directory containing PangyPlot database files.  
  Default: none [defaults to the datastore directory]

- **PANGYPLOT_DB** *(required)*  
  Name of the PangyPlot database.  
  Default: ``_default_``

- **PANGYPLOT_ANNOTATION** *(optional)*  
  Annotation dataset to load with the graph.  
  Default: ``None``

- **PANGYPLOT_REF** *(optional)*  
  Reference genome identifier used by the dataset.  
  Default: ``None``

- **PANGYPLOT_PORT** *(required)*  
  Port number for running the PangyPlot web application.  
  Default: ``5700``

