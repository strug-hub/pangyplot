import { rgbStringToHex, stringToColor } from "../render/color/color-utils.js";

const GENE_ANNOTATIONS = {};
const NODE_ANNOTATION_DATA = {};

const GENE_VISIBLE_BY_DEFAULT = true;

function annotationManagerGetGene(geneId) {
    if (GENE_ANNOTATIONS[geneId]) {
        return GENE_ANNOTATIONS[geneId];
    } else{
        return null
    }
}

function annotationManagerGetGeneColor(geneId) {
    if (GENE_ANNOTATIONS[geneId]) {
        return GENE_ANNOTATIONS[geneId].color;
    } else{
        return "#000000"
    }
}

function annotationManagerGetGeneName(geneId) {
    if (GENE_ANNOTATIONS[geneId]) {
        return GENE_ANNOTATIONS[geneId].gene;
    } else{
        return "undefined"
    }
}

function annotationManagerShouldShowExon(geneId) {
    if (GENE_ANNOTATIONS[geneId]) {
        return GENE_ANNOTATIONS[geneId].show_exons;
    } else{
        return false
    }
}

function annotationManagerIsGeneVisible(geneId) {
    if (GENE_ANNOTATIONS[geneId]) {
        return GENE_ANNOTATIONS[geneId].is_visible;
    } else{
        return false;
    }
}

function annotationManagerGetNodeAnnotations(node) {
    const annotations = NODE_ANNOTATION_DATA[node.nodeId];

    if (!annotations) return [];
    const result = [];

    Object.keys(annotations).forEach(geneId => {
        const annotation = annotations[geneId];
        const gene = GENE_ANNOTATIONS[geneId];

        if (!gene.is_visible) {
            return;
        } if (gene.show_exons && !annotation.exon_number) {
            return;
        }            

        result.push({
            id: geneId,
            exon_number: annotation.exon_number,
            color: gene.color
        });
    });

    return result;
}

//todo: speedup by saving link data like we do with node?
function annotationManagerGetLinkAnnotations(link) {
    const sourceAnnotations = NODE_ANNOTATION_DATA[link.source.nodeId];
    const targetAnnotations = NODE_ANNOTATION_DATA[link.target.nodeId];

    if (!sourceAnnotations || !targetAnnotations) return [];
    const result = [];
    const sourceSet = new Set(Object.keys(sourceAnnotations));

    Object.keys(targetAnnotations).forEach(geneId => {
        if (sourceSet.has(geneId)) {
            const gene = GENE_ANNOTATIONS[geneId];
            const targetAnnotation = targetAnnotations[geneId];
            const sourceAnnotation = sourceAnnotations[geneId];

            if (! gene.is_visible) {
                return;
            }
            if (gene.show_exons){
                if(!targetAnnotation.exon_number || !sourceAnnotation.exon_number) {
                    return;
                }
                if(targetAnnotation.exon_number != sourceAnnotation.exon_number) {
                    return;
                }
            }

            result.push({
                id: geneId,
                exon_number: targetAnnotation.exon_number,
                color: gene.color
            });
        }
    });

    return result;
}


function annotationOverlap(annotation, node) {
    if (node.range == null){ return false }

    const annotationStart = annotation.range[0];
    const annotationEnd = annotation.range[1];

    for (const [rangeStart, rangeEnd] of node.range_inclusive) {
        const overlaps = rangeStart <= annotationEnd && rangeEnd >= annotationStart;
        if (overlaps) {
            const point = calculateEffectiveNodeStep(node, rangeStart);
            if (point >= annotationStart && point <= annotationEnd) {
                return true;
            }
        }
    }

    return false;
}

function annotationManagerUpdateGeneTable() {
    
    const tableData = [];
    Object.values(GENE_ANNOTATIONS).forEach(gene => {

        const hasTranscripts = gene.transcripts && gene.transcripts.length > 0;
        const hasExons = hasTranscripts && gene.transcripts[0].exons && gene.transcripts[0].exons.length > 0;        
        
        tableData.push({
            id: gene.id,
            name: gene.gene,
            hasExon: hasExons,
            color: gene.color,
            visible: gene.is_visible });
    });

    populateGeneAnnotationsTable(tableData);
}

function annotationManagerUpdatedSelectionFromTable(geneId, status) {
    if (GENE_ANNOTATIONS[geneId]) {
        GENE_ANNOTATIONS[geneId].is_visible = status;
    }
}

function annotationManagerUpdatedColorFromTable(geneId, newColor) {
    if (GENE_ANNOTATIONS[geneId]) {
        GENE_ANNOTATIONS[geneId].color = newColor;
    }
}

function annotationManagerUpdatedExonFromTable(geneId, status) {
    if (GENE_ANNOTATIONS[geneId]) {
        GENE_ANNOTATIONS[geneId].show_exons = status;
    }
}

//possible todo:
//speed up by sorting nodes?
function annotateTranscript(graphData, gene, transcriptIndex = 0) {
    graphData.nodes.forEach(node => {

        if (!NODE_ANNOTATION_DATA[node.nodeId]){
            NODE_ANNOTATION_DATA[node.nodeId] = {};
        }
        if (NODE_ANNOTATION_DATA[node.nodeId][gene.id]) {
            delete NODE_ANNOTATION_DATA[node.nodeId][gene.id];
        }

        const transcript = gene.transcripts[transcriptIndex];
        if (annotationOverlap(transcript, node)) {
            let exonNumber = null;

            transcript.exons.forEach((exon, index) => {
                if (annotationOverlap(exon, node)) {
                    exonNumber = exon.exon_number;
                }
            });

            NODE_ANNOTATION_DATA[node.nodeId][gene.id] = {
                gene_id: gene.id,
                exon_number: exonNumber
            };
        }
    });
}

export function annotationManagerAnnotateGraph(graphData) {

    Object.values(GENE_ANNOTATIONS).forEach(gene => {

        annotateTranscript(graphData, gene);

    });

    //todo?

    //Object.values(GENE_ANNOTATIONS).forEach(gene => {

    //    const nodes = nodeGroup[gene.id];
    //    if (nodes) {
    //        const bounds = findNodeBounds(nodes);
    //        const rawNode = {
    //            nodeid: gene.id,
    //            type: "gene",
    //            text: gene.gene,
    //            x: bounds.x + bounds.width / 2,
    //            y: bounds.y + bounds.height / 2,
    //        };
    //        geneTextNode = createNewTextNode(rawNode);
    //        graphData.nodes.push(geneTextNode);
    //    }
    //});

    annotationManagerUpdateGeneTable();
};

function annotationManagerClear() {
    Object.keys(GENE_ANNOTATIONS).forEach(key => delete GENE_ANNOTATIONS[key]);
    Object.keys(NODE_ANNOTATION_DATA).forEach(key => delete NODE_ANNOTATION_DATA[key]);
}

export function annotationManagerFetch(genome, chromosome, start, end) {
    const url = buildUrl('/genes', { genome, chromosome, start, end });

    annotationManagerClear();
    fetchData(url, 'genes').then(fetchedData => {
        console.log("Fetched annotations:", fetchedData);
        fetchedData.genes.forEach(gene => {
            
            gene.is_visible = GENE_VISIBLE_BY_DEFAULT;
            gene.show_exons = false;
            gene.color = rgbStringToHex(stringToColor(gene.gene));

            GENE_ANNOTATIONS[gene.id] = gene;
        });
    
    });
}

var ANNOTATION_UPDATE_FRAME=0;

function annotationManagerUpdate(ctx, forceGraph){
    //todo?
    return;
    if (ANNOTATION_UPDATE_FRAME > 0){
        ANNOTATION_UPDATE_FRAME-=1;
        return
    }
    
    ANNOTATION_UPDATE_FRAME=4;

    const geneNodes = {};
    const geneTextNodes = {};

    forceGraph.graphData().nodes.forEach(node => {
        if (node.class === "text" && node.type === "gene"){
            geneTextNodes[node.text] = node;
        }else if (node.isVisible && node.isDrawn) {
            const genes = getNodeAnnotations(node); 
            
            genes.forEach(geneId => {                
                if (!geneNodes[geneId]) {
                    geneNodes[geneId] = [];
                }
                geneNodes[geneId].push(node);
            });
        }
    });

    Object.keys(geneNodes).forEach(geneId => {
        const nodes = geneNodes[geneId];
        const bounds = findNodeBounds(nodes);
            
        geneTextNodes[geneId].anchorX = bounds.x + bounds.width / 2;
        geneTextNodes[geneId].anchorY = bounds.y + bounds.height / 2;

    });

}