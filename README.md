# PangyPlot - a pangenome reference browser

<p style="flex" align="center">
  <img src="images/readme/pangyplot_pangy.svg" alt="PangyPlot circle" height="144">
  <img src="images/readme/pangyplot_text_outline.svg" alt="PangyPlot header" height="144">
</p>

<p align="center">
  <a href="https://doi.org/10.5281/zenodo.21420029"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.21420029.svg" alt="DOI"></a>
</p>

Mastromatteo et al. 
<b>Beyond reference bias: Making pangenomes accessible with PangyPlot</b>. 
<i>bioRxiv</i>.  2025.10.31.684064.
https://doi.org/10.1101/2025.10.31.684064 

PangyPlot (*ˈpæŋ-ɡi-plɑt*) is a genome graph visualization tool designed to offer intuitive and interactive visualization of genomic data. It enables researchers and biologists to effectively visualize and analyze complex genomic structures and variations.


# For "pan-curious" users interested in public data

Preloaded with HPRC v.1.1:
https://pangyplot.research.sickkids.ca/

SCREENSHOT WILL GO HERE

# For "pan-genious" experts with their own data

## Prerequisites

- Graph in GFA format
- Python 3.11 or higher recommended
- Python packages: flask, flask-babel, numpy, bitarray, matplotlib, pympler, python-dotenv
- [odgi](https://github.com/pangenome/odgi) required to prepare custom data.

## Usage - Quick Start

```
git clone https://github.com/strug-hub/pangyplot.git
cd pangyplot
python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY
```

This should launch a local web server at http://127.0.0.1:5700 with chrY data that is included with the codebase. Please consult this documentation page for further usage information and test datasets: https://pangyplot.readthedocs.io/en/latest/advanced/quickstart.html

## Usage - Docker

Prefer not to install Python and `odgi`? A prebuilt image ships the whole toolchain (`vg`, `odgi`, `pangyplot`, and the GBWT daemon) and serves the bundled chrY demo out of the box:

```
docker run --rm -p 5700:5700 ghcr.io/strug-hub/pangyplot:latest
```

Image: [ghcr.io/strug-hub/pangyplot](https://github.com/strug-hub/pangyplot/pkgs/container/pangyplot). You can also prepare your own data (GFA → server) entirely inside the container — see the [Docker quick start](https://pangyplot.readthedocs.io/en/latest/advanced/quickstart.html).

# Documentation

[![Documentation](https://img.shields.io/badge/docs-pangyplot-blue?logo=readthedocs)](https://pangyplot.readthedocs.io/en/latest/)

# License

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# Acknowledgements

PangyPlot is powered by

[![d3-force-graph](https://img.shields.io/badge/d3--force--graph-FA9C1E?logo=github&logoColor=white)](https://github.com/vasturiano/force-graph)
[![odgi layout](https://img.shields.io/badge/odgi-layout-007ACC?logo=github&logoColor=white)](https://github.com/pangenome/odgi)
[![BubbleGun](https://img.shields.io/badge/BubbleGun-29ABE2?logo=github&logoColor=white)](https://github.com/fawaz-dabbaghieh/bubble_gun)

---

*The tool is provided as-is and may be updated or withdrawn without notice. This tool is intended for research and educational purposes only. Outputs are not intended for clinical, diagnostic, or therapeutic use.*
