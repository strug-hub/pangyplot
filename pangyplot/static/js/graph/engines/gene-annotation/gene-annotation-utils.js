function calculateEffectiveNodeStep(node, step){
    if (node.element.ranges.length === 0) {
        return null;
    }
   
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of node.element.ranges) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) {
        return null;  // No matching range found
    }

    const [start, end] = matchedRange;
    
    if (node.nodeIdx === 0) {
        return start;
    }
    if (node.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.nodeIdx === node.kinks - 1) {
        return end;
    }

    return start + (node.nodeIdx * (end - start)) / (node.kinks - 1);
}

export function annotationOverlap(annotation, node) {
    if (!node.element.ranges) return false;

    const [annotationStart, annotationEnd] = annotation.range;

    for (const [rangeStart, rangeEnd] of node.element.ranges) {
        if (rangeStart <= annotationEnd && rangeEnd >= annotationStart) {
            const point = calculateEffectiveNodeStep(node, rangeStart);
            if (point >= annotationStart && point <= annotationEnd) return true;
        }
    }
    return false;
}

