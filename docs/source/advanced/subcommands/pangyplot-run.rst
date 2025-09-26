.. _pangyplot-run:
.. include:: ../../substitutions.rst

#############
pangyplot run
#############

Launch the PangyPlot web server.

SYNOPSIS
========

**pangyplot run** [*OPTION*]…

DESCRIPTION
===========

Starts the PangyPlot web server in development mode. 
Use of **-\-db** is recommended.

OPTIONS
=======

MANDATORY OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-ref** *STRING*
| Reference genome name.



DATABASE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-db** *NAME*
| Database name (default: ``_default_``).

| **-\-annotations** *NAME*
| Annotation set name (default: most recent data matching **-\-ref**).

| **-\-dir** *DIR*
| Database directory (default: ``datastore``).


SERVER OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-port** *N*
| Port to serve app (default: ``5700``).
