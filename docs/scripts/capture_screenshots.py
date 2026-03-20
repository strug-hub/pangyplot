"""Capture UI screenshots from a running PangyPlot instance for documentation.

Usage:
    # Start PangyPlot first:
    #   python pangyplot.py run --db hprc.clip --ref GRCh38 --annotations gencode48.chrY
    #
    # Then run this script:
    python docs/scripts/capture_screenshots.py [--url http://127.0.0.1:5700]

Saves PNG screenshots to docs/source/_images/ui/.
"""

import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

DOCS_IMAGES = Path(__file__).resolve().parent.parent / "source" / "_images" / "ui"

# selector → output filename (without extension)
CAPTURES = {
    "#navbar": "navbar",
    "#cytoband > .container.flex-1": "chromosome_selector",
    "#cytoband > .container.flex-2": "locus_selector",
    "#gene-search": "gene_selector",
    "#coordinate-go": "coordinate_selector",
}


def screenshot_element(page, selector, name):
    """Screenshot a single element. Returns True on success."""
    el = page.query_selector(selector)
    if el is None:
        print(f"  SKIP {name}: selector '{selector}' not found")
        return False
    out = DOCS_IMAGES / f"{name}.png"
    el.screenshot(path=str(out))
    print(f"  saved {out.relative_to(Path.cwd())}")
    return True


def search_gene(page, gene_name):
    """Type a gene name, select the first result from the dropdown."""
    search_bar = page.query_selector("#gene-search-bar")
    if search_bar is None:
        return

    search_bar.fill("")
    search_bar.type(gene_name, delay=50)
    page.wait_for_selector("#gene-search-suggestions.active .search-dropdown-item",
                           state="visible", timeout=5_000)

    # Arrow down to focus first result, then click it
    search_bar.press("ArrowDown")
    page.evaluate("document.activeElement.click()")

    # Wait for a result slot to update
    page.wait_for_timeout(300)

    # Close dropdown by clicking elsewhere
    page.click("#gene-search .container-title")


def setup_gene_search(page):
    """Search for example genes so the gene selector has content."""
    search_gene(page, "SRY")
    search_gene(page, "DAZ1")


def capture(url: str):
    DOCS_IMAGES.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900},
                                device_scale_factor=2)
        page.goto(url, wait_until="networkidle")

        # Wait for UI to render
        page.wait_for_selector("#navbar", state="visible", timeout=10_000)
        page.wait_for_selector("#cytoband", state="visible", timeout=10_000)

        # Capture static elements first
        for selector, name in CAPTURES.items():
            if name == "gene_selector":
                continue
            screenshot_element(page, selector, name)

        # Set up gene search with example, then capture
        setup_gene_search(page)
        screenshot_element(page, "#gene-search", "gene_selector")

        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:5700",
                        help="URL of running PangyPlot instance")
    args = parser.parse_args()
    capture(args.url)
