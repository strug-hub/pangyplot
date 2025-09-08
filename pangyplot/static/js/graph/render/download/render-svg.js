import { getImageName } from './download-utils.js';
import { getCenterGraphCoordinates } from '../viewport-utils.js'
import { getFontCss } from './download-utils.js';
import { renderFullFrame } from '../render-manager.js'

const svgNS = "http://www.w3.org/2000/svg";

async function getSvgObject() {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);

    const fontCss = await getFontCss();
    const fontStyle = document.createElementNS(svgNS, "style");
    fontStyle.textContent = fontCss;
    svg.appendChild(fontStyle);

    return svg;
}

function saveSvg(svg) {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);

    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(svgBlob);
    link.download = getImageName('svg');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function normalizeSvgCoords(svg, centerX, centerY) {
  const adjust = (val, delta) =>
    val != null ? (parseFloat(val) || 0) - delta : null;

  const xAttrs = ["x", "cx", "x1", "x2"];
  const yAttrs = ["y", "cy", "y1", "y2"];

  const allElements = svg.querySelectorAll("*");

  allElements.forEach((el) => {
    xAttrs.forEach((attr) => {
      if (el.hasAttribute(attr)) {
        el.setAttribute(attr, adjust(el.getAttribute(attr), centerX));
      }
    });

    yAttrs.forEach((attr) => {
      if (el.hasAttribute(attr)) {
        el.setAttribute(attr, adjust(el.getAttribute(attr), centerY));
      }
    });
  });
}

function scaleSvg(svg, ctx) {
  const zoomFactor = ctx.canvas.__zoom.k;

    const g = document.createElementNS(svgNS, "g");
    while (svg.firstChild) {
    g.appendChild(svg.firstChild);
    }
    g.setAttribute("transform", `scale(${zoomFactor})`);

    svg.appendChild(g);
}

export async function exportGraphToSvg(forceGraph) {
    const ctx = forceGraph.canvas.ctx;

    const center = getCenterGraphCoordinates(forceGraph);

    const svg = await getSvgObject();

    const w = forceGraph.canvas.width;
    const h = forceGraph.canvas.height;

    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `${-w/2} ${-h/2} ${w} ${h}`);

    renderFullFrame(ctx, forceGraph, svg);

    normalizeSvgCoords(svg, center.x, center.y);
    scaleSvg(svg, ctx);

    saveSvg(svg);

}
