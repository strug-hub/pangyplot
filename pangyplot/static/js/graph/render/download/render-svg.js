import { getImageName } from './download-utils.js';
import { getViewport } from '../viewport-utils.js'
import { getFontCss } from './download-utils.js';
import { basicNodePainter } from '../painter/basic-node-painter.js';
import { basicLinkPainter } from '../painter/basic-link-painter.js';

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

export async function exportGraphToSvg(forceGraph) {
    const canvasElement = document.querySelector('#graph-container canvas');
    const ctx = canvasElement.getContext('2d');
    const viewport = getViewport(forceGraph, 1.01);
    const graphData = forceGraph.graphData();
    const { nodes, links } = graphData;
  
    const svg = await getSvgObject();

    // Add nodes to the SVG
    graphData.links.forEach(link => { basicLinkPainter(ctx, link, svg); });
    graphData.nodes.forEach(node => { basicNodePainter(ctx, node, svg); });

    svg.setAttribute("width", canvasElement.width);
    svg.setAttribute("height", canvasElement.height);

    console.log(canvasElement.width, canvasElement.height);

    svg.setAttribute("viewBox", `0 0 ${canvasElement.width} ${canvasElement.height}`);
    
    saveSvg(svg);



    const geneGroup = document.createElementNS(svgNS, "g");

    genes = geneRenderEngineDraw(ctx, graphData, true)
    genes.forEach(item => {
        if (item.type === 'node') {
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", item.element.x);
            circle.setAttribute("cy", item.element.y);
            circle.setAttribute("r", item.width/2);
            circle.setAttribute("fill", item.color);
            geneGroup.appendChild(circle);
        } else if (item.type === 'link') {
            const line = document.createElementNS(svgNS, "line");
            line.setAttribute("x1", item.element.source.x);
            line.setAttribute("y1", item.element.source.y);
            line.setAttribute("x2", item.element.target.x);
            line.setAttribute("y2", item.element.target.y);
            line.setAttribute("stroke", item.color);
            line.setAttribute("stroke-width", item.width);
            geneGroup.appendChild(line);
        }
    });
    
    const linkGroup = document.createElementNS(svgNS, "g");
    const nodeGroup = document.createElementNS(svgNS, "g");
    
    // Add links to the SVG
    links.forEach(link => {
        if (!link.isVisible || !link.isDrawn) return;
        const l = basicRenderPaintLink(ctx, link, true)
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", l.x1);
        line.setAttribute("y1", l.y1);
        line.setAttribute("x2", l.x2);
        line.setAttribute("y2", l.y2);
        line.setAttribute("stroke", l.color);
        line.setAttribute("stroke-width", l.width); 

        linkGroup.appendChild(line);
        updateBoundingBox(l.x1, l.y1);
        updateBoundingBox(l.x2, l.y2);
    });



    const sequenceSearchGroup = document.createElementNS(svgNS, "g");
    sequenceSearch = searchSequenceEngineUpdate(ctx, forceGraph, true);
    sequenceSearch.forEach(element => {
        if (element.type === 'square') {
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", element.x - element.width / 2);
            rect.setAttribute("y", element.y - element.width / 2);
            rect.setAttribute("width", element.width);
            rect.setAttribute("height", element.width);
            rect.setAttribute("fill", element.fill);
            sequenceSearchGroup.appendChild(rect);
        } else if (element.type === 'path') {
            const pathElement = document.createElementNS(svgNS, "path");
            const d = element.path
                .map((point, index) =>
                    index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
                )
                .join(" ");
            pathElement.setAttribute("d", d);
            pathElement.setAttribute("stroke", element.stroke);
            pathElement.setAttribute("stroke-width", element.width);
            pathElement.setAttribute("fill", "none");
            sequenceSearchGroup.appendChild(pathElement);
        }
    });

    const geneLabelGroup = document.createElementNS(svgNS, "g");
    geneLabels = drawGeneName(ctx, graphData, viewport, true);
    geneLabels.forEach(label => {
        const textElement = document.createElementNS(svgNS, "text");
        textElement.setAttribute("x", label.x);
        textElement.setAttribute("y", label.y);
        textElement.setAttribute("font-size", label.fontSize);
        textElement.setAttribute("fill", label.color);
        textElement.setAttribute("stroke", label.stroke);
        textElement.setAttribute("stroke-width", label.strokeWidth);
        textElement.textContent = label.text;

        textElement.setAttribute("text-anchor", "middle");
        textElement.setAttribute("dominant-baseline", "middle"); 

        geneLabelGroup.appendChild(textElement);
    });
    
    const labelGroup = document.createElementNS(svgNS, "g");
    labels = labelEngineUpdate(ctx, forceGraph, true);
    labels.forEach(label => {
        const textElement = document.createElementNS(svgNS, "text");
        textElement.setAttribute("x", label.x);
        textElement.setAttribute("y", label.y);
        textElement.setAttribute("font-size", label.fontSize);
        textElement.setAttribute("fill", label.color);
        textElement.setAttribute("stroke", label.stroke);
        textElement.setAttribute("stroke-width", label.strokeWidth);
        textElement.textContent = label.text;

        labelGroup.appendChild(textElement);
        updateBoundingBox(label.x, label.y);
    });
    
    svg.appendChild(geneGroup);
    svg.appendChild(linkGroup);
    svg.appendChild(nodeGroup);
    svg.appendChild(sequenceSearchGroup);
    svg.appendChild(geneLabelGroup);
    svg.appendChild(labelGroup);
    


}
