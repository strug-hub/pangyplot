import { genomeCytobandDimensions } from "./constants.js";
import eventBus from '@event-bus';

// A human-sized genome. Genomes with at least this many chromosomes are unaffected.
const MIN_VIEWBOX_CHROMOSOMES = 24;

var dim = null;

export function drawGenomeCytoband(genomeData, chromOrder) {
    const nChromosomes = Object.keys(genomeData).length

    dim = genomeCytobandDimensions(nChromosomes);
    const svg = createSvgCanvas();
    let annotations = [];

    chromOrder.forEach((chromosome, index) => {
        drawGenomeChromosomeBorder(svg, index, chromosome);
        drawGenomeChromosomeBands(svg, index, chromosome, genomeData);
        annotations.push(createAnnotation(chromosome, index));
    });

    addAnnotations(svg, annotations);

    return svg;
}

function createSvgCanvas() {
    // The SVG is width:100% height:auto, so its rendered height is
    // containerWidth * viewBoxHeight / viewBoxWidth. viewBox width grows with
    // chromosome count while its height is fixed, so a genome with few
    // chromosomes would stretch the SVG vertically -- 17000px for zero. Clamp the
    // viewBox width to a full-size genome; fewer chromosomes just leave slack.
    const viewBoxWidth = Math.max(dim.width, genomeCytobandDimensions(MIN_VIEWBOX_CHROMOSOMES).width);
    const viewBoxValue = `0 0 ${viewBoxWidth} ${dim.height}`;
    return d3.select("#cytoband-genome-canvas-container")
        .append("svg")
        .attr("id", "cytoband-genome-canvas")
        .attr("width", "100%")
        .attr("height", dim.chrFullHeight)
        .attr("viewBox", viewBoxValue);
}

function calculateBorderX(index) {
    return dim.widthPad + (dim.chrFullWidth + dim.widthPad) * index;
}

function drawGenomeChromosomeBorder(svg, index, chromosome) {
    const borderX = calculateBorderX(index);

    svg.append("rect")
        .attr("x", borderX)
        .attr("y", dim.topPad)
        .attr("rx", dim.radius)
        .attr("ry", dim.radius)
        .attr("width", dim.chrFullWidth)
        .attr("height", dim.chrFullHeight)
        .attr("class", "cytoband-genome-chromosome")
        .on('click', function() {
            console.log('[cytoband-genome] clicked chromosome:', chromosome);
            const data = {chromosome, start: null, end: null, source: "cytoband-genome"};
            eventBus.publish("ui:coordinates-changed", data);
        });
}

function getLongestChromosomeSize(genomeData) {
    let longest = -1;
    for (const [key, chr] of Object.entries(genomeData)) {
        for (let j = 0; j < chr.length; j++) {
            if (chr[j]["end"] > longest){
                longest = chr[j]["end"];
            }
        }
    }
    return longest;
}

function drawGenomeChromosomeBands(svg, index, chromosome, genomeData) {
    const chromBands = genomeData[chromosome];
    const borderX = calculateBorderX(index);
    const longestChromSize = getLongestChromosomeSize(genomeData);
    
    function bandClasses(d){
        if (d.type){
            return "cytoband-band cytoband-" + d.type;
        } return "cytoband-band";
    }

    svg.selectAll("x")
        .data(chromBands)
        .enter()
        .append("rect")
        .attr("x", borderX + dim.borderPad)
        .attr("y", d => dim.topPad + dim.borderPad + dim.chrHeight * (d.start / longestChromSize))
        .attr("width", dim.chrWidth)
        .attr("height", d => dim.chrHeight * (d.end - d.start) / longestChromSize)
        .attr("fill", d => d.color)
        .attr("class", d => bandClasses(d))
        .style("pointer-events", "none")
}

function createAnnotation(chromosome, index) {
    const borderX = calculateBorderX(index);

    return {
        note: { label: chromosome, bgPadding: 0 },
        x: borderX + dim.chrFullWidth / 2,
        y: dim.topPad + dim.chrFullHeight,
        dy: dim.annotationHeight * ((index % 2) + 1),
        dx: 0
    };
}

function addAnnotations(svg, annotations) {
    const annotationsGroup = svg.selectAll(".annotation-group")
        .data([annotations])
        .join("g")
        .attr("class", "cytoband-genome-annotation");

    const makeAnnotations = d3.annotation()
        .type(d3.annotationLabel)
        .annotations(annotations);

    annotationsGroup.call(makeAnnotations);

    svg.selectAll('.annotation text')
    .attr('class', 'cytoband-genome-text')
}