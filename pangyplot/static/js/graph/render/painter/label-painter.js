import { colorState } from "../color/color-state.js";
import { drawText } from "./painter-utils.js";
import { drawTextSvg } from "./painter-svg-utils.js";
import { getTextScaleFactor } from "../render-scaling.js";

const outlineWidth = 2;
const smallFontSize = 10;
const mediumFontSize = 16;
const largeFontSize = 24;

export function labelPainter(ctx, text, x, y, size, color, outlineColor, svg = null) {
  const scaleFactor = getTextScaleFactor(ctx);
  var fontSize;
  if (size == "small") {
    fontSize = smallFontSize * scaleFactor;
  } else if (size == "medium") {
    fontSize = mediumFontSize * scaleFactor;
  } else {
    fontSize = largeFontSize * scaleFactor;
  }

  if (color == null) color = colorState.textFill;
  if (outlineColor == null) outlineColor = colorState.textOutline;

  if (svg) {
    drawTextSvg(svg, text, x, y, fontSize, color, outlineWidth * scaleFactor, outlineColor);
  } else {
    drawText(ctx, text, x, y, fontSize, color, outlineWidth * scaleFactor, outlineColor);
  }
}

