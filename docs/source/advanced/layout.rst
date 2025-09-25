.. _layout:
.. include:: ../substitutions.rst

Calculating Graph Layout
==============================

odgi Layout
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/logo/odgi.png
    :alt: odgi logo
    :width: 80px
    :align: left


|tool| relies on `odgi <https://github.com/pangenome/odgi>`_ to calculate the 2D layout of nodes.
The GFA file is therefore needs to be converted into odgi format ``*.og``.


From the odgi documentation:

   The `odgi layout <https://pangenome.github.io/odgi.github.io/rst/commands/odgi_layout.html>`_ command computes 2D layouts of the graph using stochastic gradient descent (SGD).
   The input graph must be sorted and id-compacted. The algorithm itself is described in 
   `Graph Drawing by Stochastic Gradient Descent <https://arxiv.org/abs/1710.04626>`_. 
   The force-directed graph drawing algorithm minimizes the graph's energy function or stress level.

The command used to calculate the layout:

.. code-block:: bash

    odgi layout -i ${INPUT}.og -o ${OUTPUT}.lay -T ${OUTPUT}.lay.tsv


RECOMMENDED PARAMS?

.. note::
    The ``--gpu`` flag can be added if odgi was built with CUDA support, available, which speeds up the layout calculation significantly.
    https://arxiv.org/abs/2409.00876


The ``*.lay.tsv`` output is structured as follows:

+-----+--------+-------------------+-----------+
| idx | X      | Y                 | component |
+=====+========+===================+===========+
| 0   | 1000   | 12547.3115187589  | 0         |
+-----+--------+-------------------+-----------+
| 1   | 165426 | 10586.0915549587  | 0         |
+-----+--------+-------------------+-----------+
| 2   | 165426 | 7320.81894996611  | 0         |
+-----+--------+-------------------+-----------+
| 3   | 165427 | 14814.159085348   | 0         |
+-----+--------+-------------------+-----------+
| 4   | 165427 | 14425.5419673736  | 0         |
+-----+--------+-------------------+-----------+
| 5   | 165445 | 15525.0135879779  | 0         |
+-----+--------+-------------------+-----------+
| 6   | 165445 | 12244.877453525   | 0         |
+-----+--------+-------------------+-----------+
| 7   | 165446 | 12979.6128977908  | 0         |
+-----+--------+-------------------+-----------+
| ... | ...    | ...               | ...       |
+-----+--------+-------------------+-----------+

For each ``S`` line in the GFA file, two coordinate pairs are calculate, representing the coordinates for the start position and end position of each |segment|.
For example, for the first ``S`` line, the start position is given by line ``idx = 0`` and the end position by ``idx = 1``.

Bandage Layout
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/logo/bandage.png
    :alt: bandage logo
    :width: 80px
    :align: left


`Bandage <https://github.com/asl/BandageNG>`_ can also be used to calculate the 2D layout of nodes.
After opening the GFA file in Bandage, the layout can be exported via ``File -> Export Layout`` in the Bandage layout format (``*.layout``). The graph has to be fully opened in Bandage, which is not always possible since Bandage loads the entire graph into memory.


