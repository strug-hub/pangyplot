.. _pangyplot-serve:

###############
pangyplot serve
###############

Launch the PangyPlot web server in production mode (via gunicorn).

SYNOPSIS
========

**pangyplot serve** [*OPTION*]…

DESCRIPTION
===========

Serves PangyPlot the same way :ref:`pangyplot-run` does, but for production /
remote use rather than local development. The two differ in three ways:

* **serve** binds ``0.0.0.0`` (reachable from outside the host or container);
  **run** binds ``127.0.0.1`` (localhost only).
* **serve** is backed by `gunicorn <https://gunicorn.org/>`_, which is
  **required** — the command exits with an error if it is not installed; **run**
  uses Flask's built-in development server.
* **serve** takes worker/thread/timeout tuning options.

Like **run**, it warms the datastore (building any missing paths, indexes, and
skeletons) before the workers boot.

This command is what the Docker image's default entrypoint invokes, so serving
from the container is the same command you would type on a host:
``pangyplot serve --db <NAME> --ref <REF>``.

OPTIONS
=======

MANDATORY OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-db** *NAME*
| Database name.

| **-\-ref** *STRING*
| Reference genome name.


DATABASE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-annotations** *NAME*
| Annotation set name (default: none).

| **-\-dir** *DIR*
| Database directory (default: ``datastore``).


SERVER OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-host** *ADDRESS*
| Address to bind to (default: ``0.0.0.0``, i.e. reachable from outside the
  host/container).

| **-\-port** *N*
| Port to serve app (default: ``5700``).

| **-\-workers** *N*
| Number of gunicorn worker processes (default: ``1``).

| **-\-threads** *N*
| Number of threads per gunicorn worker (default: ``4``).

| **-\-timeout** *N*
| gunicorn worker timeout in seconds (default: ``120``).
