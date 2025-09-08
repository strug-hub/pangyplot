function calculateEffectiveNodeStep(node, step){
    if (node.data.ranges.length === 0) {
        return null;
    }
   
    let matchedRange = null;
    for (const [rangeStart, rangeEnd] of node.data.ranges) {
        if (step >= rangeStart && step <= rangeEnd) {
            matchedRange = [rangeStart, rangeEnd];
            break;
        }
    }

    if (!matchedRange) {
        return null;  // No matching range found
    }

    const [start, end] = matchedRange;
    
    if (node.idx === 0) {
        return start;
    }
    if (node.kinks === 1) {
        return (start + end) / 2;
    }
    if (node.idx === node.kinks - 1) {
        return end;
    }

    return start + (node.idx * (end - start)) / (node.kinks - 1);
}

export function annotationOverlap(annotation, node) {
    if (!node.data || !node.data.ranges) return false;

    const [annotationStart, annotationEnd] = annotation.range;

    for (const [rangeStart, rangeEnd] of node.data.ranges) {
        if (rangeStart <= annotationEnd && rangeEnd >= annotationStart) {
            const point = calculateEffectiveNodeStep(node, rangeStart);
            if (point >= annotationStart && point <= annotationEnd) return true;
        }
    }
    return false;
}

