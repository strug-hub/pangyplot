.. _pangyplot-cytoband:

##################
pangyplot cytoband
##################

Generate a dummy cytoband for an organism with no cytogenetic data.

SYNOPSIS
========

**pangyplot cytoband** **-\-fai** *FILE* **[OPTION]…**

DESCRIPTION
===========

Generates a dummy cytoband from a reference FASTA index (``.fai``), so that organisms
with no cytoband data can still be visualized in PangyPlot. Each chromosome is drawn
as a single bar spanning its length.

Two files are written into ``--out-dir``:

- ``{genome}.cytoBand.txt`` — the cytoband file
- ``{genome}.canonical.txt`` — the canonical chromosome list, one name per line

Point ``CYTOBAND_PATH`` and ``CANONICAL_PATH`` at them and set ``ORGANISM=custom``
(see :ref:`setup`). The command prints the exact lines to add to your ``.env``.

.. note::

   Sequences shorter than ``--min-length`` (1,000,000 bp by default) are left out,
   since a ``.fai`` usually lists many unplaced scaffolds. The command reports what
   it kept and what it dropped.

OPTIONS
=======

MANDATORY OPTIONS
~~~~~~~~~~~~~~~~~

| **-\-fai** *FILE*
| Path to a FASTA ``.fai`` index. A plain ``name<TAB>length`` TSV also works.

OUTPUT OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-out-dir** *DIR*
| Directory to write the two files into (default: current directory).

| **-\-genome** *STRING*
| Genome name used for the output filenames (default: derived from ``--fai``).

SEQUENCE SELECTION OPTIONS
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

| **-\-min-length** *INT*
| Drop sequences shorter than this many bp (default: ``1000000``). Use ``0`` to
  keep every sequence.

| **-\-chromosomes** *STRING*
| Comma-separated list of sequences to keep, in this order. Overrides
  ``--min-length`` and ``--pattern``.

| **-\-pattern** *REGEX*
| Keep only sequences whose name matches this regular expression, e.g. ``^chr``.

BANDING OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-band-size** *INT*
| Subdivide each chromosome into shaded bands of this many bp, as a coordinate
  ruler. Default: a single bar per chromosome.

| **-\-num-bands** *INT*
| Subdivide each chromosome into this many bands, as an alternative to
  ``--band-size``.

CONVENIENCE OPTIONS
~~~~~~~~~~~~~~~~~~~~~

| **-\-force**
| Overwrite existing files without prompting.

EXAMPLES
========

Index the reference FASTA, then generate the cytoband:

.. code-block:: bash

   samtools faidx myorganism.fa
   pangyplot cytoband --fai myorganism.fa.fai --out-dir cytoband/ --genome myOrg

Keep only the named chromosomes, in that order:

.. code-block:: bash

   pangyplot cytoband --fai myorganism.fa.fai \
       --chromosomes chr1,chr2,chr3,chrX

Subdivide into 1 Mb bands, and keep every sequence including short scaffolds:

.. code-block:: bash

   pangyplot cytoband --fai myorganism.fa.fai \
       --band-size 1000000 --min-length 0
