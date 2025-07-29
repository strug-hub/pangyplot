const FONT_SIZE = 180;
const LIGHTNESS_SCALE=0.0;
const LABEL_POSITION_CACHE = {};
const LABEL_SPEED = 0.05;

function geneRenderEngineDraw(ctx, graphData, svg=false){
    const zoomFactor = ctx.canvas.__zoom["k"];
    ctx.save();

    let renderQueue = [];

    
    //todo: don't loop if no genes are visible
    graphData.nodes.forEach(node => {
        if (node.isVisible && node.isDrawn) {
            let hsize = Math.max(100,node.width) + 10/zoomFactor;

            const annotations = annotationManagerGetNodeAnnotations(node); 
            let n = 1; 
            
            annotations.forEach(annotation => {
                renderQueue.push({
                    type: 'node', 
                    element: node, 
                    color: annotation.color,
                    size: hsize * n, 
                    zIndex: n
                });
                n += 1;
            });
        }
    });

    graphData.links.forEach(link => {
        if (link.isVisible && link.isDrawn) {
            const annotations = annotationManagerGetLinkAnnotations(link);
            let n = 1;
            let hsize = Math.max(100,link.width) + 10/zoomFactor;

            annotations.forEach(annotation => {
                renderQueue.push({
                    type: 'link', 
                    element: link, 
                    color: annotation.color, 
                    width: hsize * n, 
                    zIndex: n
                });
                n += 1;
            });
        }
    });
    
    renderQueue.sort((a, b) => b.zIndex - a.zIndex);

    if (svg){
        return renderQueue;
    } else; {
        renderQueue.forEach(item => {
            if (item.type === 'node') {
                outlineNode(item.element, ctx, 0, item.width, item.color);
            } else if (item.type === 'link') {
                outlineLink(item.element, ctx, 0, item.width, item.color);
            }
        });
    }

    ctx.restore();
}

function splitScreenIntoGrid(viewport, N) {
    const grid = [];
    const sectionWidth = (viewport.x2 - viewport.x1) / N;
    const sectionHeight = (viewport.y2 - viewport.y1) / N;

    // Initialize NxN grid
    for (let i = 0; i < N; i++) {
        grid[i] = [];
        for (let j = 0; j < N; j++) {
            grid[i][j] = {
                nodes: [], // Will hold nodes in this section
                x1: viewport.x1 + i * sectionWidth,
                y1: viewport.y1 + j * sectionHeight,
                x2: viewport.x1 + (i + 1) * sectionWidth,
                y2: viewport.y1 + (j + 1) * sectionHeight,
                centerX: viewport.x1 + (i + 0.5) * sectionWidth,
                centerY: viewport.y1 + (j + 0.5) * sectionHeight
            };
        }
    }

    return grid;
}

function findGroupCentroid(groupNodes) {
    let sumX = 0, sumY = 0;

    groupNodes.forEach(node => {
        sumX += node.x;
        sumY += node.y;
    });

    return {
        x: sumX / groupNodes.length,
        y: sumY / groupNodes.length
    };
}

function placeNodesInGrid(nodes, grid, N) {
    const sectionWidth = (grid[0][0].x2 - grid[0][0].x1);
    const sectionHeight = (grid[0][0].y2 - grid[0][0].y1);

    nodes.forEach(node => {
        const gridX = Math.floor((node.x - grid[0][0].x1) / sectionWidth);
        const gridY = Math.floor((node.y - grid[0][0].y1) / sectionHeight);

        if (gridX >= 0 && gridX < N && gridY >= 0 && gridY < N) {
            grid[gridX][gridY].nodes.push(node);
        }
    });
}

function findBestLabelPosition(grid, centroid, hintPosition) {
    let minCombinedDist = Infinity;
    let bestSection = null;

    if (!hintPosition) {
        hintPosition = centroid;
    }

    const { x: hintX, y: hintY } = hintPosition;
    const { x: centroidX, y: centroidY } = centroid;

    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            const section = grid[i][j];

            if (section.nodes.length === 0) {
                const dxCentroid = centroidX - section.centerX;
                const dyCentroid = centroidY - section.centerY;
                const distToCentroid = Math.sqrt(dxCentroid * dxCentroid + dyCentroid * dyCentroid);

                const dxHint = hintX - section.centerX;
                const dyHint = hintY - section.centerY;
                const distToHint = Math.sqrt(dxHint * dxHint + dyHint * dyHint);

                // Minimize the sum of both distances
                const combinedDist = distToCentroid + distToHint;

                if (combinedDist < minCombinedDist) {
                    minCombinedDist = combinedDist;
                    bestSection = section;
                }
            }
        }
    }

    if (bestSection) {
        return { x: bestSection.centerX, y: bestSection.centerY };
    }

    return centroid;
}

function interpolate(current, target, speed) {
    return current + (target - current) * speed;
}

//potential speedup: skip frames
function drawGeneName(ctx, graphData, viewport, svg=false) {
    const zoomFactor = ctx.canvas.__zoom["k"];
    const annotationNodes = {};
    const visibleNodes = [];
    const gridN = 30;

    graphData.nodes.forEach(node => {
        if (node.isVisible && node.isDrawn) {
            visibleNodes.push(node);
            const annotations = annotationManagerGetNodeAnnotations(node); 
            
            annotations.forEach(annotation => {                
                if (!annotationNodes[annotation.id]) {
                    annotationNodes[annotation.id] = [];
                }
                annotationNodes[annotation.id].push({
                    node: node,
                    exon_number: annotation.exon_number
                });
            });
        }
    });

    const grid = splitScreenIntoGrid(viewport, gridN);
    placeNodesInGrid(visibleNodes, grid, gridN);

    const size = Math.max(FONT_SIZE, FONT_SIZE * (1 / zoomFactor / 10));

    const labels = [];
    
    Object.keys(annotationNodes).forEach(id => {
        const nodes = annotationNodes[id];

        if (annotationManagerShouldShowExon(id)) {
            const exonGroups = {};
            nodes.forEach(({ node, exon_number }) => {
                if (exon_number) {
                    if (!exonGroups[exon_number]) {
                        exonGroups[exon_number] = [];
                    }
                    exonGroups[exon_number].push(node);
                }
            });
            
            Object.keys(exonGroups).forEach(exon => {

                let cachedPosition = LABEL_POSITION_CACHE[id + "#" + exon] || null;
                const exonNodes = exonGroups[exon];
                
                const centroid = findGroupCentroid(exonNodes);
                //let {x, y} = findBestLabelPosition(grid, centroid, cachedPosition);

                if (!cachedPosition){
                    cachedPosition = {x : centroid.x, y : centroid.y};
                } else{
                    cachedPosition.x = interpolate(cachedPosition.x, centroid.x, LABEL_SPEED); 
                    cachedPosition.y = interpolate(cachedPosition.y, centroid.y, LABEL_SPEED);
                }

                labels.push({
                    id: id,
                    exon_number: exon,
                    x: cachedPosition.x,
                    y: cachedPosition.y,
                    size: size/2
                });

                LABEL_POSITION_CACHE[id + "#" + exon] = cachedPosition;
            });
        } else {
            let cachedPosition = LABEL_POSITION_CACHE[id] || null;
            const nodesOnly = nodes.map(({ node }) => node);
            const centroid = findGroupCentroid(nodesOnly);
            let {x, y} = findBestLabelPosition(grid, centroid, cachedPosition);

            if (!cachedPosition){
                cachedPosition = {x:x, y:y};
            } else{
                cachedPosition.x = interpolate(cachedPosition.x, x, LABEL_SPEED); 
                cachedPosition.y = interpolate(cachedPosition.y, y, LABEL_SPEED);
            }

            labels.push({
                id: id,
                exon_number: null,
                x: cachedPosition.x,
                y: cachedPosition.y,
                size: size
            });

            LABEL_POSITION_CACHE[id] = cachedPosition;

        }
    });
    
    const bgColor = colorManagerBackgroundColor();

    const properties = [];

    labels.forEach(position => {
        const { id, x, y, size, exon_number } = position;
        const geneName = annotationManagerGetGeneName(id);
        const displayName = exon_number ? `${geneName}:exon${exon_number}` : geneName;
        const color = annotationManagerGetGeneColor(id);
       
        if (svg){
            properties.push(
            {
                id: id,
                text: displayName,
                x: x,
                y: y,
                fontSize: size,
                strokeWidth: size/20,
                stroke: bgColor,
                color: color
            });
        } else{
            drawText(displayName, ctx, x, y, size, color, bgColor, size/8);
        }
    });
    
    return properties;
}
