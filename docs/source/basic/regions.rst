.. _regions:
.. include:: ../substitutions.rst

Choosing a Region
==================================

Selecting by Chromosome
--------------------------

.. figure:: ../_images/ui/chromosome_selector.svg
   :alt: chromosome selector
   :align: center
   :width: 800px

   Genome cytoband selector.

.. figure:: ../_images/ui/locus_selector.svg
   :alt: locus selector
   :align: center
   :width: 800px

   Chromosome cytoband selector.

Cytoband data is specified during setup. The default is human hg38. 
A chromosome can be selected by clicking on it. Non-canonical chromosomes can be found in the ``Other`` selection box.
A cytoband view of the selected chromosome is rendered. Clicking and dragging along the chromosome will select a specific region.

.. note::
   Currently there is a limitation on the size of the region that can be viewed. Enabling arbitrarily large regions for viewing is a future goal.


Selecting by Gene
--------------------------

Gene annotations data is specified during setup. The gene search bar will search for any preloaded genes. The last four searches are saved as buttons.

.. figure:: ../_images/ui/gene_selector.svg
   :alt: gene selector
   :align: center
   :width: 800px

   Select by Gene.


Selecting by Coordinate
--------------------------

|tool| uses a coordinate system based on one of the reference paths embedded in the sequence graph. The primary coordinate system is specified during setup — typically using a reference genome such as hg38 or t2t for humans.

.. raw:: html

   Selection methods above will fill the <i class="fas fa-crosshairs"></i> with a set of coordinates.</p>

.. figure:: ../_images/ui/coordinate_selector.svg
   :alt: coordinate section
   :align: center
   :width: 800px

   Coordinate section.

.. raw:: html

   <div class="icon-list">
      <div class="icon-item">
         <i class="fa-solid fa-crosshairs"></i>
         <div class="icon-text">
            <div class="icon-label">Enter coordinates</div>
            <div class="icon-description">Manually enter or adjust the coordinate range.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-copy"></i>
         <div class="icon-text">
            <div class="icon-label">Copy coordinates</div>
            <div class="icon-description">Copy the current coordinate range.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-plus-minus"></i>
         <div class="icon-text">
            <div class="icon-label">Set flanking</div>
            <div class="icon-description">Set the number of flanking base pairs to include.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-minus"></i>
         <div class="icon-text">
            <div class="icon-label">Upstream flanking</div>
            <div class="icon-description">Include flanking sequence upstream of the coordinate range.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-plus"></i>
         <div class="icon-text">
            <div class="icon-label">Downstream flanking</div>
            <div class="icon-description">Include flanking sequence downstream of the coordinate range.</div>
         </div>
      </div>

      <div class="icon-item">
         <i class="fa-solid fa-bolt-lightning"></i>
         <div class="icon-text">
            <div class="icon-label">Go</div>
            <div class="icon-description">Retrieve and display the specified coordinate range.</div>
         </div>
      </div>
   </div>

