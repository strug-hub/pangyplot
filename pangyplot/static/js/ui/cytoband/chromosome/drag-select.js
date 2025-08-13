import { chromosomeCytobandDimensions } from './constants.js';
import eventBus from '../../../utils/event-bus.js';

export function addDragSelect(svg, chromSize, chromosome, chromStart, chromEnd) {
  const dim = chromosomeCytobandDimensions();
  const w = dim.widthPad;

  const svgElement = svg.node();
  const svgRect = svgElement.getBoundingClientRect();
  const scaleX = svgRect.width / dim.width;

  let IS_DRAGGING = false;
  let DRAG_STARTX = null;
  let DRAG_ENDX = null;
  let CHROM_DRAG_RECT = null;
  let CHROM_DRAG_RECTX = null;

  function normalizePosition(x) {
    let pos = (x - w) * scaleX / (svgElement.clientWidth - w * 2 * scaleX);
    return Math.max(0, Math.min(1, pos));
  }

  function updateStartEndCoordinates(start, end) {
    if (start != null && end != null && start !== end) {
      if (end < start) [start, end] = [end, start];

      const startPos = Math.max(1, Math.round(start * chromSize));
      const endPos = Math.round(end * chromSize);

      const data = { chromosome, start: startPos, end: endPos , source: "cytoband-chromosome" };
      eventBus.publish("ui:coordinates-changed", data);
    }
  }

  function drawChromosomeSelectionBox(start, end) {
    if (start == null || end == null || start === end) return;

    const startPos = start / chromSize;
    const endPos = end / chromSize;
    const x1 = startPos * (svgElement.clientWidth - w * 2 * scaleX) / scaleX + w;
    const x2 = endPos * (svgElement.clientWidth - w * 2 * scaleX) / scaleX + w;

    if (CHROM_DRAG_RECT != null) CHROM_DRAG_RECT.remove();

    CHROM_DRAG_RECT = svg.append('rect')
      .attr('x', x1)
      .attr('y', dim.heightBuffer + dim.annotationHeight * 3 / 4)
      .attr('width', x2 - x1)
      .attr('height', dim.chrHeight + dim.annotationHeight / 2)
      .attr('fill', 'none')
      .attr('class', 'cytoband-chromosome-selection-box');
  }

  svg.on('mousedown', function (event) {
    const [x] = d3.pointer(event, svgElement);
    DRAG_STARTX = normalizePosition(x);
    DRAG_ENDX = null;
    IS_DRAGGING = true;
    CHROM_DRAG_RECTX = x;

    if (CHROM_DRAG_RECT != null) CHROM_DRAG_RECT.remove();

    CHROM_DRAG_RECT = svg.append('rect')
      .attr('x', CHROM_DRAG_RECTX)
      .attr('y', dim.heightBuffer + dim.annotationHeight * 3 / 4)
      .attr('width', 0)
      .attr('height', dim.chrHeight + dim.annotationHeight / 2)
      .attr('fill', 'none')
      .attr('class', 'cytoband-chromosome-selection-box');
  });

  svg.on('mousemove', function (event) {
    if (!IS_DRAGGING) return;
    const [x] = d3.pointer(event, svgElement);
    DRAG_ENDX = normalizePosition(x);

    let rectX = Math.min(x, CHROM_DRAG_RECTX);
    let width = Math.abs(x - CHROM_DRAG_RECTX);

    if (rectX < w) {
      let diff = w - rectX;
      rectX = w;
      width -= diff;
    }

    if (rectX + width > dim.chrWidth + w) {
      let diff = rectX + width - dim.chrWidth - w;
      width -= diff;
    }

    CHROM_DRAG_RECT.attr('x', rectX).attr('width', width);
  });

  svg.on('mouseup', function () {
    if (!IS_DRAGGING) return;
    IS_DRAGGING = false;

    if (DRAG_STARTX === DRAG_ENDX) {
      if (CHROM_DRAG_RECT != null) CHROM_DRAG_RECT.remove();
      return;
    }

    updateStartEndCoordinates(DRAG_STARTX, DRAG_ENDX);
  });

  svg.on('mouseleave', function () {
    if (!IS_DRAGGING) return;
    IS_DRAGGING = false;
    updateStartEndCoordinates(DRAG_STARTX, DRAG_ENDX);
  });

  if (chromStart != null && chromEnd != null) {
    drawChromosomeSelectionBox(chromStart, chromEnd);
  }
}
