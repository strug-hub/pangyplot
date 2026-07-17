.. _organisms:

Organisms and Cytobands
==================================

Built-in Organisms
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

PangyPlot has built-in cytobands for the following:

.. list-table:: 
   :header-rows: 1
   :widths: 10 30 30

   * - 
     - Organism
     - Build
   * - .. raw:: html

          <span style="font-size:2rem;">🧍</span>
     - human-hg38 [default]
     - hg38
   * - .. raw:: html

          <span style="font-size:2rem;">🧍</span>
     - human-t2t
     - chm13
   * - .. raw:: html

          <span style="font-size:2rem;">🐁</span>
     - mouse
     - mm39
   * - .. raw:: html

          <span style="font-size:2rem;">🪰</span>
     - fruitfly
     - dm6
   * - .. raw:: html

          <span style="font-size:2rem;">🐠</span>
     - zebrafish
     - danRer11
   * - .. raw:: html

          <span style="font-size:2rem;">🐓</span>
     - chicken
     - galGal6
   * - .. raw:: html

          <span style="font-size:2rem;">🐇</span>
     - rabbit
     - oryCun2
   * - .. raw:: html

          <span style="font-size:2rem;">🐕</span>
     - dog
     - canFam3
   * - .. raw:: html

          <span style="font-size:2rem;">❓</span>
     - custom
     - 
   * - .. raw:: html

          <span style="font-size:2rem;">❌</span>
     - none
     -

.. note::

   More organisms can be added on request, if you have cytoband files. Please open an issue on the `GitHub repository <https://github.com/strug-hub/pangyplot/issues>`_.



If your organism is not in this list, you can either
:ref:`generate a dummy cytoband <pseudo-cytoband>` from your reference FASTA, or
:ref:`run without one <no-cytoband>`.

Custom Organisms
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To add a custom organism, you need to provide two files:

- A cytoband file, tab-separated with five columns and no header
  (``chrom``, ``start``, ``end``, ``band name``, ``stain``)
- A text file specifying the main canonical chromosomes (one per line)

.. code-block:: text

   chr1	0	2300000	p36.33	gneg
   chr1	2300000	5300000	p36.32	gpos25

.. code-block:: text

   chr1
   chr2

Once these files are prepared, you can specify them during the interactive
`setup process <subcommands/pangyplot-setup.html>`_, which sets ``ORGANISM=custom``
along with ``CYTOBAND_PATH`` and ``CANONICAL_PATH``.

Examples can be found in ``pangyplot/static/cytoband``.

.. _pseudo-cytoband:

Dummy Cytobands
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

For organisms with no cytogenetic data, PangyPlot can generate a dummy pair of the
files above from a reference FASTA index (``.fai``). Each chromosome is drawn as a
single bar spanning its length.

.. code-block:: bash

   samtools faidx myorganism.fa
   pangyplot cytoband --fai myorganism.fa.fai --out-dir cytoband/ --genome myOrg

This writes ``cytoband/myOrg.cytoBand.txt`` and ``cytoband/myOrg.canonical.txt``, and
prints the lines to add to your ``.env``:

.. code-block:: text

   ORGANISM=custom
   CYTOBAND_PATH=/abs/path/cytoband/myOrg.cytoBand.txt
   CANONICAL_PATH=/abs/path/cytoband/myOrg.canonical.txt

The chromosome view then renders as it does for a built-in organism.

.. note::

   Sequences shorter than 1 Mb are left out, since a ``.fai`` usually lists many
   unplaced scaffolds. Use ``--min-length``, ``--pattern`` or ``--chromosomes`` to
   choose which sequences appear.

See :ref:`pangyplot-cytoband` for the full set of options.

.. _no-cytoband:

Running Without a Cytoband
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Setting ``ORGANISM=none`` runs PangyPlot with no cytoband data. The chromosome and
locus selectors are hidden, and you navigate by typing a region into the coordinate
box (``chr:start-end``).

