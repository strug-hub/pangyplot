.. _organisms:
.. include:: ../substitutions.rst

Organisms and Cytobands
==================================

Built-in Organisms
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

|tool| has built-in cytobands for the following:

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
     - human-chm13
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

   More organisms can be added on request, if you have cytoband files. Please open an issue on the `GitHub repository <https://github.com/scottmastro/pangyplot/issues>`_.



Custom Organisms
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

To add a custom organism, you need to provide a two files:

- A cytoband file in the UCSC format
- A text file specifying the main canonical chromosomes (one per line)

Once these files are prepared, you can specify them during the interactive `setup process <subcommands/pangyplot-setup.html>`_.

Examples can be found in ``pangyplot/static/cytoband``. Use ``pangyplot setup`` to specify the cytoband files.

