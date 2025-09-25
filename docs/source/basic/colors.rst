.. _colors:
.. include:: ../substitutions.rst

Colors
-----------------------

Color Selection
~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/colors.svg
   :alt: color gradient
   :align: center
   :width: 500px

   Color of graph components can be changed.

.. figure:: ../_images/ui/preset_colors.svg
   :alt: preset colors
   :align: center
   :width: 800px

   Preset color gradients available for nodes.

|tool| provides different methods of coloring the nodes in the visualization.
Node colors are selected on a 3-color scale that can form a gradient. Link and background colors can be also be changed.
A set of predefined color palettes are available.

.. list-table:: Color Presets
   :header-rows: 1
   :widths: 15 15 15 15 30

   * - Name
     - Color 1
     - Color 2
     - Color 3
     - Gradient
   * - Primary
     - .. raw:: html

          <div class="color-swatch" style="background:#0762e5;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#f2dc0f;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#ff6700;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#0762e5,#f2dc0f,#ff6700);"></div>
   * - Peach
     - .. raw:: html

          <div class="color-swatch" style="background:#659157;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#E05263;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#F3DE8A;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#659157,#E05263,#F3DE8A);"></div>
   * - Mystic
     - .. raw:: html

          <div class="color-swatch" style="background:#1b9e77;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#d95f02;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#7570b3;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#1b9e77,#d95f02,#7570b3);"></div>
   * - Purples
     - .. raw:: html

          <div class="color-swatch" style="background:#efedf5;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#bcbddc;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#756bb1;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#efedf5,#bcbddc,#756bb1);"></div>
   * - Greens
     - .. raw:: html

          <div class="color-swatch" style="background:#f7fcb9;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#addd8e;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#31a354;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#f7fcb9,#addd8e,#31a354);"></div>
   * - Blues
     - .. raw:: html

          <div class="color-swatch" style="background:#eff3ff;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#6baed6;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#08519c;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#eff3ff,#6baed6,#08519c);"></div>
   * - Heat
     - .. raw:: html

          <div class="color-swatch" style="background:#ffeda0;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#feb24c;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#f03b20;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#ffeda0,#feb24c,#f03b20);"></div>
   * - GoldenTide
     - .. raw:: html

          <div class="color-swatch" style="background:#d8b365;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#f5f5f5;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#5ab4ac;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#d8b365,#f5f5f5,#5ab4ac);"></div>
   * - Iris
     - .. raw:: html

          <div class="color-swatch" style="background:#af8dc3;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#f7f7f7;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#7fbf7b;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#af8dc3,#f7f7f7,#7fbf7b);"></div>
   * - Sorbet
     - .. raw:: html

          <div class="color-swatch" style="background:#f1a340;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#f7f7f7;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#998ec3;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#f1a340,#f7f7f7,#998ec3);"></div>
   * - CoralSky
     - .. raw:: html

          <div class="color-swatch" style="background:#91bfdb;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#ffffbf;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#fc8d59;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#91bfdb,#ffffbf,#fc8d59);"></div>
   * - Viridis
     - .. raw:: html

          <div class="color-swatch" style="background:#fbe74c;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#31a186;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#461352;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#fbe74c,#31a186,#461352);"></div>
   * - Mako
     - .. raw:: html

          <div class="color-swatch" style="background:#94dbb4;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#36679e;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#35264b;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#94dbb4,#36679e,#35264b);"></div>
   * - Magma
     - .. raw:: html

          <div class="color-swatch" style="background:#fcb683;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#d6496a;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#181331;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#fcb683,#d6496a,#181331);"></div>
   * - Rocket
     - .. raw:: html

          <div class="color-swatch" style="background:#f7d1b7;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#e33540;"></div>
     - .. raw:: html

          <div class="color-swatch" style="background:#441b46;"></div>
     - .. raw:: html

          <div class="color-swatch-gradient" style="background:linear-gradient(90deg,#f7d1b7,#e33540,#441b46);"></div>

.. note:: 
    Some palettes are better for discrete colors and some are better for heatmap gradients. An attempt was made to provide multiple colorblind-friendly palettes but not all of them are guaranteed to be safe.


Color Style
~~~~~~~~~~~~~~~~~

.. figure:: ../_images/ui/color_style.svg
   :alt: color style
   :align: center
   :width: 800px

   Different coloring styles can be applied to nodes.

Depending on the mode selected, the colors will either be used to form as a continuous gradient or will be used as three discrete colors. 


.. raw:: html

     <div class="icon-list">
          <div class="icon-item">
          <i class="fa-solid fa-circle-nodes"></i>
          <div class="icon-text">
               <div class="icon-label">Node Type <code>discrete</code></div>
               <div class="icon-description">The color is determined by the type of node: segment, bubble, or chain.</div>
          </div>
          </div>

          <div class="icon-item">
          <i class="fa-solid fa-arrows-to-circle"></i>
          <div class="icon-text">
               <div class="icon-label">Bubble Size <code>continuous</code></div>
               <div class="icon-description">The color is determined by the total number of segments inside a bubble or chain. Not to be confused with length, which is based on total basepairs.</div>
          </div>
          </div>

          <div class="icon-item">
          <i class="fa-solid fa-arrow-down-short-wide"></i>
          <div class="icon-text">
               <div class="icon-label">Node Length <code>continuous</code></div>
               <div class="icon-description">The color is determined by the total number of basepairs represented by a node.</div>
          </div>
          </div>

          <div class="icon-item">
          <i class="fa-solid fa-shuffle"></i>
          <div class="icon-text">
               <div class="icon-label">Ref/Alt <code>discrete</code></div>
               <div class="icon-description">Reference and alternative paths are colored differently using a 2-color scheme from the gradient ends.</div>
          </div>
          </div>

          <div class="icon-item">
          <i class="fa-solid fa-dna"></i>
          <div class="icon-text">
               <div class="icon-label">GC Content <code>continuous</code></div>
               <div class="icon-description">The color is determined by the GC percentage of all basepairs represented by a node (with the human genome averaging ~41%).</div>
          </div>
          </div>
     </div>
