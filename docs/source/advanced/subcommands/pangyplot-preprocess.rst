.. _pangyplot-preprocess:

####################
pangyplot preprocess
####################

Interactively generate a shell (or SLURM) script that preprocesses a GFA or OG file with `odgi <https://github.com/pangenome/odgi>`_ into the sorted GFA plus layout TSV inputs expected by :ref:`pangyplot-add`.

SYNOPSIS
========

**pangyplot preprocess**

DESCRIPTION
===========

Runs an interactive prompt that asks for the input file, reference path names, thread count, GPU availability, and (optionally) SLURM job parameters, then writes a self-contained bash script that:

1. Converts the input GFA to ODGI ``.og`` format.
2. Optionally sorts the graph with a prioritized list of reference paths.
3. Runs ``odgi layout`` (with optional GPU acceleration) to produce the 2D coordinates TSV.
4. Writes the sorted GFA back out.

The generated script's outputs — a sorted ``.gfa`` and a layout ``.tsv`` — are the two files that :ref:`pangyplot-add` expects via ``--gfa`` and ``--layout``.

This command does not run odgi itself; it just produces the script, so the preprocessing can run on a workstation or compute cluster independent of where PangyPlot is installed.

OPTIONS
=======

No command-line options. All parameters are collected via interactive prompts.
