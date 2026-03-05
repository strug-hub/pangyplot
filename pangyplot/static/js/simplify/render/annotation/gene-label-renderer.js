// Gene landmarks (real chrY genes, GRCh38) and screen-space label rendering.

import { bpToX, xToY } from '../../data/spine.js';
import { state } from '../../simplify-state.js';

const GENES = [
    { name: 'SRY',     startBp: 2786855,  endBp: 2787682 },
    { name: 'ZFY',     startBp: 2935281,  endBp: 2982506 },
    { name: 'PCDH11Y', startBp: 5000226,  endBp: 5742224 },
    { name: 'AMELY',   startBp: 6865918,  endBp: 6911752 },
    { name: 'USP9Y',   startBp: 12537650, endBp: 12860839 },
    { name: 'UTY',     startBp: 13234577, endBp: 13480673 },
    { name: 'NLGN4Y',  startBp: 14522573, endBp: 14845654 },
    { name: 'KDM5D',   startBp: 19703865, endBp: 19744939 },
    { name: 'EIF1AY',  startBp: 20575776, endBp: 20593154 },
    { name: 'RBMY1A1', startBp: 21534879, endBp: 21549326 },
    { name: 'DAZ1',    startBp: 23129355, endBp: 23199010 },
];

let genePins = [];

export function getGenePins() { return genePins; }

export function placeGenes() {
    genePins = [];
    for (const gene of GENES) {
        const startX = bpToX(gene.startBp);
        const endX = bpToX(gene.endBp);
        if (startX === null || endX === null) continue;
        const midX = (startX + endX) / 2;
        const yStart = xToY(startX);
        const yEnd = xToY(endX);
        const yMid = xToY(midX);
        const refY = yMid;
        const minY = Math.min(yStart, yMid, yEnd);
        const maxY = Math.max(yStart, yMid, yEnd);
        genePins.push({ name: gene.name, startX, endX, midX, refY, minY, maxY });
    }
}

/**
 * Draw gene labels in screen coordinates.
 * Called after ctx.restore() (screen space, not data space).
 */
export function drawGeneLabels(ctx, cw) {
    if (genePins.length === 0) return;

    const fontSize = 11;
    ctx.font = `600 ${fontSize}px 'SF Mono', Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const gene of genePins) {
        const sxStart = gene.startX * state.zoom + state.panX;
        const sxEnd = gene.endX * state.zoom + state.panX;
        const sxMid = (sxStart + sxEnd) / 2;
        const syRef = gene.refY * state.zoom + state.panY;
        if (sxEnd < -60 || sxStart > cw + 60) continue;

        const geneW = sxEnd - sxStart;
        const bracketY = syRef - 16;

        ctx.strokeStyle = '#e8a735';
        ctx.lineWidth = 1.5;
        if (geneW > 6) {
            ctx.beginPath();
            ctx.moveTo(sxStart, syRef + 4);
            ctx.lineTo(sxStart, bracketY);
            ctx.lineTo(sxEnd, bracketY);
            ctx.lineTo(sxEnd, syRef + 4);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(sxMid, syRef + 4);
            ctx.lineTo(sxMid, bracketY);
            ctx.stroke();
        }

        const label = gene.name;
        const tw = ctx.measureText(label).width;
        const px = 5, py = 2;
        const ly = bracketY - 4;

        ctx.fillStyle = 'rgba(40, 32, 10, 0.85)';
        const rr = 3;
        const rx = sxMid - tw / 2 - px;
        const ry = ly - fontSize - py;
        const rw = tw + px * 2;
        const rh = fontSize + py * 2;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, rr);
        ctx.fill();

        ctx.fillStyle = '#e8a735';
        ctx.fillText(label, sxMid, ly);
    }
}
