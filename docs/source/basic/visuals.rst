.. _visuals:
.. include:: ../substitutions.rst

Viewing the Pangenome
==================================

Node Types
~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/graph/segments.svg
   :alt: segments
   :align: center
   :width: 100%

   Segments = ``S`` lines from GFA files (blue). Links = ``L`` lines from GFA files (gray).

.. figure:: ../_images/graph/bubble_chain.svg
   :alt: bubble and chain
   :align: center
   :width: 100%

   A chain of bubbles. Each bubble in the chain is shown in yellow, the chain links are orange. 


|tool| First displays top-level bubbles. Bubbles can be popped to reveal finer-scale details.

.. figure:: ../_images/graph/bubble_pop.svg
   :alt: Bubbles in |tool|
   :width: 100%
   :align: center

   Iterative bubble popping to the segment level.

Gene Annotations
~~~~~~~~~~~~~~~~~~~

The gene annotations are provided during setup up |tool|. The HPRC live instance uses annotations from `GENCODE <https://www.gencodegenes.org/human/>`_ (any GFF3 file can be used).

Annotations are rendered as outlines around nodes and edges:

.. figure:: ../_images/graph/gene_annotation.svg
   :alt: gene annotation
   :align: center
   :width: 800px

   Example of rendered gene annotations.

Interactions
~~~~~~~~~~~~~~~~~~~


.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-arrow-pointer"></i>
         <div class="icon-text">
            <div class="icon-label">Selection Mode <code>default</code></div>
            <div class="icon-description">Click nodes to select and drag.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-hand-pointer"></i>
         <div class="icon-text">
            <div class="icon-label">Bubble Pop Mode <code>ctrl key</code>/<code>cmd key</code></div>
            <div class="icon-description">Click nodes to pop bubbles.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-up-down-left-right"></i>
         <div class="icon-text">
            <div class="icon-label">Pan/Zoom Mode <code>shift key</code></div>
            <div class="icon-description">Click and drag to pan the view. Use mouse wheel to zoom in and out.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-arrows-to-circle"></i>
         <div class="icon-text">
            <div class="icon-label">Recenter on Subgraph <code>space bar</code></div>
            <div class="icon-description">Press the space bar to recenter the view on the full subgraph.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-arrows-to-dot"></i>
         <div class="icon-text">
            <div class="icon-label">Recenter on Selection <code>up arrow</code></div>
            <div class="icon-description">Press the up arrow key to recenter the view on the selected nodes.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-anchor"></i>
         <div class="icon-text">
            <div class="icon-label">Anchor on Drag <code>F key</code></div>
            <div class="icon-description">Press the F key to toggle whether a node position is fixed after dragging.</div>
         </div>
      </div>
   </div>



Right-Click Menu
~~~~~~~~~~~~~~~~~~~

.. warning::
   "Download GFA" is currently broken.

Actions performed on the full subgraph:

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-arrows-to-circle"></i>
         <div class="icon-text">
            <div class="icon-label">Recenter Graph</div>
            <div class="icon-description">Zoom to fit the entire subgraph in view.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-file-export"></i>
         <div class="icon-text">
            <div class="icon-label">Download GFA</div>
            <div class="icon-description">Export the current subgraph as a GFA file.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-download"></i>
         <div class="icon-text">
            <div class="icon-label">Download PNG</div>
            <div class="icon-description">Export the current subgraph as a PNG image.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-download"></i>
         <div class="icon-text">
            <div class="icon-label">Download SVG</div>
            <div class="icon-description">Export the current graph as an SVG vector image.</div>
         </div>
      </div>
   </div>
   <hr>

Actions performed on a selected set of nodes:

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-burst"></i>
         <div class="icon-text">
            <div class="icon-label">Pop nodes</div>
            <div class="icon-description">Pop selected bubbles.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-dna"></i>
         <div class="icon-text">
            <div class="icon-label">Show Sequence</div>
            <div class="icon-description">Display truncated sequence for selected nodes.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-pen"></i>
         <div class="icon-text">
            <div class="icon-label">Add Custom Label</div>
            <div class="icon-description">Assign a custom text label to selected nodes.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-tag"></i>
         <div class="icon-text">
            <div class="icon-label">Add Custom Annotation</div>
            <div class="icon-description">Create a custom gene annotation on selected nodes.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-trash-can"></i>
         <div class="icon-text">
            <div class="icon-label">Clear Labels</div>
            <div class="icon-description">Remove all custom text labels from nodes.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-lock-open"></i>
         <div class="icon-text">
            <div class="icon-label">Unlock nodes</div>
            <div class="icon-description">Allow nodes to move freely again.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-lock"></i>
         <div class="icon-text">
            <div class="icon-label">Lock nodes</div>
            <div class="icon-description">Fix node positions to their current coordinates.</div>
         </div>
      </div>
   </div>



