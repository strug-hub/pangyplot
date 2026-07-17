.. figure:: _images/logo/pangyplot_header.svg
   :target: index.html
   :width: 500px
   :alt: PangyPlot


PangyPlot is a browser that enables visualization of pangenomic data. 

Quick Links
----------------------------------------------

.. raw:: html

    <div class="icon-list">
      <div class="icon-item">
          <i class="fa-solid fa-desktop"></i>
          <div class="icon-text">
          <div class="icon-label"><a href="https://pangyplot.research.sickkids.ca/">Live Instance</a></div>
          <div class="icon-description">
            Preloaded with <a href="https://github.com/human-pangenomics/hpp_pangenome_resources">HPRC data</a>  
            [<a href="https://doi.org/10.5281/zenodo.17174109">database files</a>]
          </div>
          </div>
      </div>
      <div class="icon-item">
          <i class="fa-solid fa-table"></i>
          <div class="icon-text">
          <div class="icon-label"> <a href="https://doi.org/10.5281/zenodo.17173731">Input Data</a></div>
          <div class="icon-description">
            GFA + odgi layout for the HPRC data hosted above, ready to feed to
            <code>pangyplot add</code>.
          </div>
          </div>
      </div>
      <div class="icon-item">
          <i class="fa-brands fa-github"></i>
          <div class="icon-text">
          <div class="icon-label"><a href="https://github.com/strug-hub/pangyplot">GitHub</a></div>
          <div class="icon-description">
            Repository for source code and issues.
          </div>
          </div>
      </div>
      <div class="icon-item">
          <i class="fa-brands fa-docker"></i>
          <div class="icon-text">
          <div class="icon-label"><a href="https://github.com/strug-hub/pangyplot/pkgs/container/pangyplot">Container</a></div>
          <div class="icon-description">
            Prebuilt image (<code>ghcr.io/strug-hub/pangyplot</code>) with the full
            toolchain &mdash; run or prepare data with no local install.
          </div>
          </div>
      </div>
      <div class="icon-item">
          <i class="fa-solid fa-file-contract"></i>
          <div class="icon-text">
          <div class="icon-label">Paper</div>
          <div class="icon-description">
            <a href="https://doi.org/10.1101/2025.10.31.684064">biorxiv</a>.
          </div>
          </div>
      </div>
    </div>

Documentation
----------------------------------------------

**For pan-curious users:** `Basic usage <basic/index.html>`__.  How to interact with an existing PangyPlot instance.

**For pan-genius users:** `Advanced usage <advanced/index.html>`__. How to use PangyPlot with your own data.


Citation
----------------------------------------------

If you use PangyPlot in your research, please cite:

.. code-block:: text

   Mastromatteo, Scott., *et al.* (2025). Beyond reference bias: Making pangenomes accessible with PangyPlot. *bioRxiv*.
   https://doi.org/10.1101/2025.10.31.684064

.. code-block:: bibtex

   @article{Mastromatteo2025pangyplot,
     title = {Beyond reference bias: Making pangenomes accessible with PangyPlot},
     author = {Mastromatteo, Scott and ...},
     journal = {bioRxiv},
     year = {2025},
     doi = {10.1101/2025.10.31.684064}
   }

----

*The tool is provided as-is and may be updated or withdrawn without notice.
This tool is intended for research and educational purposes only. Outputs are not intended for clinical, diagnostic, or therapeutic use.*

.. toctree::
   :maxdepth: 3
   :caption: Table of Contents
   :hidden:

   basic/index
   advanced/index
   principles
