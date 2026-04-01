// Custom annotation state for the simplify viewer.
// Stores named, colored annotation records that target chains by ID.
// Integrates with the shared gene annotation table via gene-data.js.

import { rgbStringToHex, stringToColor } from '@color-utils';
import { scheduleFrame } from '../utils/frame-scheduler.js';

const annotations = new Map();   // id → annotation object
let nextId = 0;

export function createCustomAnnotation(name, chainIds) {
    const id = `custom-${++nextId}`;
    const annotation = {
        id,
        name,
        color: rgbStringToHex(stringToColor(name)),
        isVisible: true,
        chainIds: new Set(chainIds),
    };
    annotations.set(id, annotation);
    refreshTable();
    scheduleFrame();
    return annotation;
}

export function deleteCustomAnnotation(id) {
    annotations.delete(id);
    refreshTable();
    scheduleFrame();
}

export function getAllAnnotations() {
    return [...annotations.values()];
}

export function getCustomAnnotationEntries() {
    const entries = [];
    for (const ann of annotations.values()) {
        entries.push({
            id: ann.id,
            name: ann.name,
            color: ann.color,
            visible: ann.isVisible,
            onToggle: (visible) => { ann.isVisible = visible; scheduleFrame(); },
            onColor: (color) => { ann.color = color; scheduleFrame(); },
            onDelete: () => deleteCustomAnnotation(ann.id),
        });
    }
    return entries;
}

export function clearCustomAnnotations() {
    annotations.clear();
    nextId = 0;
}

// Lazy-bound table refresh to avoid circular import with gene-data.js.
let _refreshFn = null;

export function setTableRefreshFn(fn) {
    _refreshFn = fn;
}

function refreshTable() {
    if (_refreshFn) _refreshFn();
}
