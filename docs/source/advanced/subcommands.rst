.. _subcommands:
.. include:: ../substitutions.rst

|tool| Subcommands
==================

setup
-----
Setup the environment for database connection.

status
------
Check database status.

**Options:**

``--dir``  
   Database directory (default: ``datastore``)

``--db``  
   Specific database name

``--table``  
   Specific table (e.g. ``segment``)

run
---
Launch the PangyPlot web server.

**Options:**

``--db``  
   Database name (default: ``_default_``)

``--ref``  
   Reference genome name (**required**)

``--port``  
   Port to serve app (default: ``5700``)

``--dir``  
   Database directory (default: ``datastore``)

``--annotations``  
   Annotation set name

add
---
Add a pangenome dataset.

**Options:**

``--db``  
   Database name (default: ``_default_``)

``--ref``  
   Reference genome name (**required**)

``--chr``  
   Chromosome name (**required**)

``--path``  
   Reference path name

``--gfa``  
   Path to GFA file (**required**)

``--layout``  
   Path to layout TSV file (**required**)

``--dir``  
   Database directory (default: ``datastore``)

``--force``  
   Overwrite existing files

``--retry``  
   Use existing GFA index

``--offset``  
   Basepair offset for reference path

``--sep``  
   Separator for path names

annotate
--------
Add annotation dataset.

**Options:**

``--ref``  
   Reference genome name (**required**)

``--gff3``  
   Path to GFF3 file

``--bed``  
   Path to BED file (not yet supported)

``--name``  
   Annotation set name (**required**)

``--dir``  
   Database directory (default: ``datastore``)

``--force``  
   Overwrite existing files

version
-------
Show version information.

example
-------
Add example DRB1 dataset.
