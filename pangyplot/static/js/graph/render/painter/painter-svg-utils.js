const svgNS = "http://www.w3.org/2000/svg";

export function drawLineSvg(target, x1, y1, x2, y2, width, color) {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", width);
    line.setAttribute("stroke-linecap", "round");
    target.appendChild(line);
    return line;
}

export function drawCircleSvg(target, x, y, size, color) {
    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", size / 2);
    circle.setAttribute("fill", color);
    target.appendChild(circle);
    return circle;
}

export function drawRotatedCrossSvg(svg, x, y, size, width, color, angle) {
    const g = document.createElementNS(svgNS, "g");
    const line1 = document.createElementNS(svgNS, "line");
    line1.setAttribute("x1", -size);
    line1.setAttribute("y1", -size);
    line1.setAttribute("x2", size);
    line1.setAttribute("y2", size);
    line1.setAttribute("stroke", color);
    line1.setAttribute("stroke-width", width);
    g.appendChild(line1);

    const line2 = document.createElementNS(svgNS, "line");
    line2.setAttribute("x1", size);
    line2.setAttribute("y1", -size);
    line2.setAttribute("x2", -size);
    line2.setAttribute("y2", size);
    line2.setAttribute("stroke", color);
    line2.setAttribute("stroke-width", width);
    g.appendChild(line2);

    const angleDegrees = angle * (180 / Math.PI);
    g.setAttribute("transform", `translate(${x}, ${y}) rotate(${angleDegrees})`);

    svg.appendChild(g);
}

export function drawTextSvg(svg, text, x, y, size, color, outlineWidth, outlineColor) {
    const textElement = document.createElementNS(svgNS, "text");
    textElement.setAttribute("x", x);
    textElement.setAttribute("y", y);
    textElement.setAttribute("font-size", size);
    textElement.setAttribute("font-family", "Rubik");
    textElement.setAttribute("text-anchor", "middle");
    textElement.setAttribute("dominant-baseline", "middle");

    textElement.setAttribute("fill", color);
    textElement.textContent = text;

    if (outlineColor) {
        textElement.setAttribute("stroke", outlineColor);
        textElement.setAttribute("stroke-width", `${outlineWidth}px`);
    }
    textElement.setAttribute("paint-order", "stroke fill");

    svg.appendChild(textElement);
}