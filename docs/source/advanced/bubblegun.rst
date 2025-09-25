.. include:: ../substitutions.rst

Calculating Bubbles
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

`BubbleGun <https://github.com/fawaz-dabbaghieh/bubble_gun>`_ is a tool that identifies topological structures in a graph (GFA file).
These topological structures can be nested within each other, forming a hierarchical chain of superstructures.

.. note::
    BubbleGun is automatically run within |tool|. This section is for informational purposes.

Structure Definitions
~~~~~~~~~~~~~~~~~~~~~~~~

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-regular fa-square"></i>
      <div class="icon-text">
        <div class="icon-label">Segment</div>
        <div class="icon-description">a contiguous chunk of sequence with no variation. Basic nodes that make up a graph genome.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-regular fa-circle"></i>
      <div class="icon-text">
        <div class="icon-label">Bubble</div>
        <div class="icon-description">An acyclic, directed subgraph with source and sink nodes. All paths through the bubble must touch the source and sink nodes.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-chain"></i>
      <div class="icon-text">
        <div class="icon-label">Bubble Chain</div>
        <div class="icon-description">A sequence of bubbles where the sink of one directly connects to the source of the next, forming a larger structure.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-boxes-stacked"></i>
      <div class="icon-text">
        <div class="icon-label">Compacted Graph</div>
        <div class="icon-description">A genome graph simplified by merging consecutive, non-branching segments into single nodes while preserving all variation points.</div>
      </div>
    </div>
  </div>

.. figure:: ../_images/bubblegun_figure.png
   :alt: figure from BubbleGun paper 
   :align: center

   From the `BubbleGun publication <https://doi.org/10.1093/bioinformatics/btac448>`_. 

#todo:
why we compact the graph
#maybe:
the significance of source and sink nodes