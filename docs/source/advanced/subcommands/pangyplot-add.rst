.. _pangyplot-add:
.. include:: ../../substitutions.rst

#############
pangyplot add
#############

Add a pangenome dataset.

SYNOPSIS
========

**pangyplot add** **-\-gfa** *FILE* **-\-layout** *FILE* **-\-ref** *STRING* **-\-chr** *STRING* [*OPTION*]…

DESCRIPTION
===========

Imports a new GFA dataset into the database. Requires a precomputed layout file and reference information. 
Use of **-\-db** is recommended.

OPTIONS
=======

MANDATORY OPTIONS
~~~~~~~~~~~~~~~~~

| **-\-gfa** *FILE*
| Path to GFA file.

| **-\-layout** *FILE*
| Path to layout file.

| **-\-ref** *STRING*
| Reference genome name.

| **-\-chr** *STRING*
| Chromosome name.

DATABASE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-db** *NAME*
| Database name (default: ``_default_``).

| **-\-dir** *DIR*
| Database directory (default: ``datastore``).


PATH-SPECIFIC OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-path** *STRING*
| Reference path name (if not specified, **-\-ref** will be used to find reference path).

| **-\-offset** *N*
| Basepair offset for reference path (default: attempt to infer, otherwise 1).

| **-\-sep** *CHAR*
| Separator for path names (takes prefix as path name).


CONVENIENCE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-force**
| Overwrite existing database without prompting.

| **-\-retry**
| Retry adding dataset if it fails (skips completed steps).
