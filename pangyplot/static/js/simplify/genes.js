// Gene landmarks (real chrY genes, GRCh38).

import { bpToX, xToY } from './spine.js';

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
