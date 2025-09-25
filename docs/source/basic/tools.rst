.. _tools:
.. include:: ../substitutions.rst

Tools
==================================

Tool Tabs
~~~~~~~~~~~~~~~~~~~

.. raw:: html

   <div class="tool-bar">
     <a href="#graph-information" title="Graph Information">
       <i class="fa-solid fa-circle-info"></i>
     </a>
     <a href="#gene-annotations" title="Gene Annotations">
       <i class="fa-solid fa-tag"></i>
     </a>
     <a href="#path-selector" title="Path Selector">
       <i class="fa-solid fa-diagram-project"></i>
     </a>
     <a href="#search" title="Search">
       <i class="fa-solid fa-magnifying-glass"></i>
     </a>
     <a href="#settings" title="Settings">
       <i class="fa-solid fa-sliders"></i>
     </a>
     <a href="#options" title="Options">
       <i class="fa-solid fa-gear"></i>
     </a>
     <a href="#input-commands" title="Input Commands">
       <i class="fa-solid fa-keyboard"></i>
     </a>
   </div>

Select the icon to jump to the relevant section.


Graph Information
~~~~~~~~~~~~~~~~~~~

.. note::
   Under active development.

.. figure:: ../_images/ui/tools_information.svg
   :alt: tools: information
   :align: left
   :width: 300px

   Display for graph information.

When a node is selected, information about that node will be displayed here. Icons for each node type:

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-regular fa-square"></i>
      <div class="icon-text">
        <div class="icon-label">Segment</div>
        <div class="icon-description">Corresponds to <code>S</code> line in GFA.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-regular fa-circle"></i>
      <div class="icon-text">
        <div class="icon-label">Bubble</div>
        <div class="icon-description">A bubble containing one or more segments.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-right-to-bracket"></i>
      <div class="icon-text">
        <div class="icon-label">Bubble Source</div>
        <div class="icon-description">The source node for a bubble. Revealed when a bubble is popped.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-right-from-bracket"></i>
      <div class="icon-text">
        <div class="icon-label">Bubble Sink</div>
        <div class="icon-description">The sink node for a bubble. Revealed when a bubble is popped.</div>
      </div>
    </div>
  </div>


.. note::
   Debugging information will be displayed here if the instance was started in debug mode.


Path Selector
~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/tools_path.svg
   :alt: tools: path selector
   :align: left
   :width: 300px

   Tools for viewing paths.

Select a sample to view the paths that are contained in the subgraph currently being viewed. "Show All Paths" will highlight links touched by any path in that sample.
Selecting a specific graph can enable animation of it. You can play through the steps of the path using the controls below.

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-solid fa-play"></i>
      <div class="icon-text">
        <div class="icon-label">Play</div>
        <div class="icon-description">Start playback of the path animation.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-backward-step"></i>
      <div class="icon-text">
        <div class="icon-label">Previous</div>
        <div class="icon-description">Go back to the previous step.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-forward-step"></i>
      <div class="icon-text">
        <div class="icon-label">Next</div>
        <div class="icon-description">Advance to the next step.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-pause"></i>
      <div class="icon-text">
        <div class="icon-label">Pause</div>
        <div class="icon-description">Pause the animation at the current step.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-rotate-left"></i>
      <div class="icon-text">
        <div class="icon-label">Reset</div>
        <div class="icon-description">Restart the animation from the beginning.</div>
      </div>
    </div>


Gene Annotations
~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/tools_annotation.svg
   :alt: tools: annotations
   :align: left
   :width: 300px

   Adjusting annotations.

Each annotation has three options:

- Toggle visibility (by clicking on gene name)
- Draw exons only (by clicking on the icon)
- Change color (by clicking on the color swatch)

.. raw:: html

    <div class="icon-list">
      <div class="icon-item">
          <i class="fa-solid fa-eye"></i>
          <div class="icon-text">
          <div class="icon-label">Draw exons</div>
          <div class="icon-description">When enabled, exons will be drawn on the graph instead of full genes.</div>
          </div>
      </div>
    </div>

Search
~~~~~~~~~~~~~~~~~~~

.. note::
   More options will be added here over time.

.. figure:: ../_images/ui/tools_search.svg
   :alt: tools: annotations
   :align: left
   :width: 300px

   Search features.

Currently this section only supports searching for nodes by ID. Clicking on a search result will center the canvas view on that node.

Settings
~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/tools_settings.svg
   :alt: tools: settings
   :align: left
   :width: 300px

   Adjust forces and rendering settings.

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-solid fa-atom"></i>
      <div class="icon-text">
        <div class="icon-label">Charge</div>
        <div class="icon-description">Controls the repulsive force applied to nodes.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-arrows-left-right-to-line"></i>
      <div class="icon-text">
        <div class="icon-label">Charge Distance</div>
        <div class="icon-description">Sets the maximum distance over which nodes exert charge force.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-explosion"></i>
      <div class="icon-text">
        <div class="icon-label">Node Collision</div>
        <div class="icon-description">Prevents nodes from overlapping by applying collision force.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-ruler-horizontal"></i>
      <div class="icon-text">
        <div class="icon-label">Collision Radius</div>
        <div class="icon-description">The radius around a node that determines a collision.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-arrows-left-right"></i>
      <div class="icon-text">
        <div class="icon-label">Link Size</div>
        <div class="icon-description">Shrinks or grows target link length.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-person-skating"></i>
      <div class="icon-text">
        <div class="icon-label">Friction</div>
        <div class="icon-description">Dampens node motion, slowing down layout movement.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-circle-nodes"></i>
      <div class="icon-text">
        <div class="icon-label">Layout Impulse</div>
        <div class="icon-description">Applies a force that drives nodes to their initial layout positions.</div>
      </div>
    </div>
    
    <hr>
    
    <div class="icon-item">
      <i class="fa-solid fa-circle-plus"></i>
      <div class="icon-text">
        <div class="icon-label">Node Width</div>
        <div class="icon-description">Adjusts the thickness of node rendering.</div>
      </div>
    </div>

    <div class="icon-item">
      <i class="fa-solid fa-text-width"></i>
      <div class="icon-text">
        <div class="icon-label">Font Size</div>
        <div class="icon-description">Changes the annotation label font sizes.</div>
      </div>
    </div>
  </div>

Options
~~~~~~~~~~~~~~~~~~~

.. note::
   More options will be added here over time.

.. figure:: ../_images/ui/tools_options.svg
   :alt: tools: options
   :align: left
   :width: 300px

   Miscellaneous options.

.. raw:: html

    <div class="icon-list">
      <div class="icon-item">
          <i class="fa-solid fa-anchor"></i>
          <div class="icon-text">
          <div class="icon-label">Anchor on drag</div>
          <div class="icon-description">Fixes a node to a dragged position when enabled.</div>
          </div>
      </div>
      <div class="icon-item">
          <i class="fa-solid fa-paint-roller"></i>
          <div class="icon-text">
          <div class="icon-label">Smooth GC colors</div>
          <div class="icon-description">Smooths out color in GC style by averaging GC content over a node and its neighbors.</div>
          </div>
      </div>
    </div>


Input Commands
~~~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/tools_keyboard.svg
   :alt: tools: input commands
   :align: left
   :width: 300px

   Self-explanatory list of input commands.