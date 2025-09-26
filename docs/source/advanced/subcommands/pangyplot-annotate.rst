.. _pangyplot-annotate:
.. include:: ../../substitutions.rst

##################
pangyplot annotate
##################

Add annotation dataset.

SYNOPSIS
========

**pangyplot annotate** **-\-gff3** *FILE* **-\-name** *STRING* **-\-ref** *STRING* **[OPTION]…**

DESCRIPTION
===========

Imports a gene annotation dataset (i.e. GFF3) into the database.

OPTIONS
=======

MANDATORY OPTIONS
~~~~~~~~~~~~~~~~~

| **-\-gff3** *FILE*
| Path to GFF3 file.

| **-\-ref** *STRING*
| Reference genome name.

| **-\-name** *STRING*
| Annotation set name.

DATABASE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-dir** *DIR*
| Database directory (default: ``datastore``).


CONVENIENCE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-force**
| Overwrite existing database without prompting.
