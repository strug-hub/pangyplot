.. _visuals:

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


PangyPlot First displays top-level bubbles. Bubbles can be popped to reveal finer-scale details.

.. figure:: ../_images/graph/bubble_pop.svg
   :alt: Bubbles in PangyPlot
   :width: 100%
   :align: center

   Iterative bubble popping to the segment level.

Gene Annotations
~~~~~~~~~~~~~~~~~~~

The gene annotations are provided during setup up PangyPlot. The HPRC live instance uses annotations from `GENCODE <https://www.gencodegenes.org/human/>`_ (any GFF3 file can be used).

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
         <i class="fa-solid fa-up-down-left-right"></i>
         <div class="icon-text">
            <div class="icon-label">Pan/Zoom Mode <code>default</code></div>
            <div class="icon-description">Click and drag to pan the view. Use mouse wheel to zoom in and out.</div>
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
         <i class="fa-solid fa-arrow-pointer"></i>
         <div class="icon-text">
            <div class="icon-label">Selection Mode <code>shift key</code></div>
            <div class="icon-description">Click nodes to select. Drag to create a selection rectangle.</div>
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

The right-click menu is context-sensitive: the available actions depend on what
is under the cursor and whether you have a selection.

Right-click a chain to act on it:

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-right-left"></i>
         <div class="icon-text">
            <div class="icon-label">Flip Chain</div>
            <div class="icon-description">Reverse the orientation of the chain.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-burst"></i>
         <div class="icon-text">
            <div class="icon-label">Pop All Bubbles</div>
            <div class="icon-description">Expand every bubble along the chain.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-tag"></i>
         <div class="icon-text">
            <div class="icon-label">Add Custom Annotation</div>
            <div class="icon-description">Name and label the chain (or the current selection).</div>
         </div>
      </div>
   </div>
   <hr>

With a set of chains highlighted (:code:`Shift`-drag to select), act on the selection:

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-clipboard"></i>
         <div class="icon-text">
            <div class="icon-label">Copy Approx Coordinates</div>
            <div class="icon-description">Copy the coordinate range spanned by the selection.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-burst"></i>
         <div class="icon-text">
            <div class="icon-label">Pop Highlighted</div>
            <div class="icon-description">Expand every bubble within the selection.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-file-export"></i>
         <div class="icon-text">
            <div class="icon-label">Export GFA</div>
            <div class="icon-description">Export the selected region as a GFA file (detail view).</div>
         </div>
      </div>
   </div>
   <hr>

Export the current view (always available):

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-download"></i>
         <div class="icon-text">
            <div class="icon-label">Download PNG</div>
            <div class="icon-description">Save the current view as a PNG image.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-download"></i>
         <div class="icon-text">
            <div class="icon-label">Download SVG</div>
            <div class="icon-description">Save the current view as an SVG vector image.</div>
         </div>
      </div>
   </div>



