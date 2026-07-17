.. _pangyplot-preprocess:

####################
pangyplot preprocess
####################

Preprocess a graph with `vg <https://github.com/vgteam/vg>`_ / `odgi <https://github.com/pangenome/odgi>`_ into the sorted GFA plus layout TSV inputs expected by :ref:`pangyplot-add`.

The command has two modes:

* **Interactive (default):** generate a shell (or SLURM) script you run yourself.
* **Execute (**\ ``--run``\ **):** run the pipeline directly via subprocess.

SYNOPSIS
========

| **pangyplot preprocess**
| **pangyplot preprocess -\-run -\-input** *FILE* [*OPTION*]…

DESCRIPTION
===========

Interactive mode
~~~~~~~~~~~~~~~~~~~~~

Runs an interactive prompt that asks for the input file, reference path names, thread count, GPU availability, and (optionally) SLURM job parameters, then writes a self-contained bash script that:

1. Converts the input GFA to ODGI ``.og`` format.
2. Optionally sorts the graph with a prioritized list of reference paths.
3. Runs ``odgi layout`` (with optional GPU acceleration) to produce the 2D coordinates TSV.
4. Writes the sorted GFA back out.

The interactive mode does not run odgi itself; it just produces the script, so the preprocessing can run on a workstation or compute cluster independent of where PangyPlot is installed. This is the default because a bare install cannot assume ``vg``/``odgi`` are present or know where they live.

Execute mode (``--run``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~

With **-\-run**, PangyPlot executes the same pipeline directly instead of writing a script. This requires ``vg``/``odgi`` on ``PATH`` and is intended for the :ref:`Docker container <quickstart>`, which ships the whole toolchain. Given an input graph (``.vg``, ``.gfa``, ``.gfa.gz``, or ``.og``) it runs:

1. ``vg convert --no-wline`` (only for ``.vg`` input, which odgi cannot read directly).
2. ``odgi build`` — GFA → ``.og``.
3. ``odgi sort`` — optional 1D sort, prioritizing the paths given by **-\-paths**/**-\-ref**.
4. ``odgi layout`` — 2D coordinates (with **-\-gpu** to use ``odgi_gpu``).
5. ``odgi view`` — export the sorted GFA.

On success it prints the resulting ``<prefix>.sorted.gfa`` and ``<prefix>.lay.tsv`` — the two files :ref:`pangyplot-add` expects — along with the ``pangyplot add`` command to run next. If a required tool is missing, it exits with an error pointing you back to the interactive script generator.

OPTIONS
=======

Interactive mode takes no command-line options; all parameters are collected via prompts. The options below apply to **-\-run**.

| **-\-run**
| Execute the pipeline directly instead of generating a script.

| **-\-input** *FILE*
| Input graph: ``.vg``, ``.gfa``, ``.gfa.gz``, or ``.og``. Required with **-\-run**.

| **-\-out-dir** *DIR*
| Directory to write outputs into (default: current directory).

| **-\-prefix** *NAME*
| Basename for output files (default: derived from **-\-input**).

| **-\-ref** *STRING*
| Primary reference path name to prioritize during the sort.

| **-\-paths** *A,B,…*
| Comma-separated path names to prioritize during the sort, in order. Overrides **-\-ref**.

| **-\-threads** *N*
| Number of threads for odgi (default: ``4``).

| **-\-gpu**
| Use ``odgi_gpu`` for the layout step.

| **-\-no-sort**
| Skip the 1D sort step.
