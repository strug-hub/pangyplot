
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