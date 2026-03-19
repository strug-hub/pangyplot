/**
 * Global application state — shared across all layers.
 * URL hash takes priority, then server-injected window.__APP_CONFIG.
 */

import eventBus from '@event-bus';

const config = window.__APP_CONFIG || {};

let _debugMode = !!(config.debug);
export function isDebugMode() { return _debugMode; }
export function setDebugMode(enabled) {
    if (_debugMode === enabled) return;
    _debugMode = enabled;
    console.log(`[app-state] debug mode ${_debugMode ? 'ON' : 'OFF'}`);
    eventBus.publish('app:debug-mode-changed', _debugMode);
}

let _canvasMode = window.location.pathname.includes('/simplify') ? 'simplify' : 'core';
export function getCanvasMode() { return _canvasMode; }
export function setCanvasMode(mode) {
    if (_canvasMode === mode) return;
    _canvasMode = mode;
    eventBus.publish('app:canvas-mode-changed', _canvasMode);
}

// Parse and validate URL hash: #chrY:12345-67890
function parseHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    const m = hash.match(/^([^:]+):(\d+)-(\d+)$/);
    if (!m) return null;

    const start = parseInt(m[2], 10);
    const end = parseInt(m[3], 10);

    if (isNaN(start) || isNaN(end)) return null;
    if (start < 0 || end < 0) return null;
    if (start >= end) return null;

    return { chromosome: m[1], start: String(start), end: String(end) };
}

const hashCoords = parseHash();

export function getCurrentLang() {
    const params = new URLSearchParams(window.location.search);
    return params.get("lang") || "en";
}

export function getGenome()     { return config.genome || ""; }
export function getChromosome() { return (hashCoords && hashCoords.chromosome) || config.chromosome || ""; }
export function getStart()      { return (hashCoords && hashCoords.start) || config.start || ""; }
export function getEnd()        { return (hashCoords && hashCoords.end) || config.end || ""; }
export function getVersion()    { return config.version || ""; }
export function getVersionName(){ return config.versionName || ""; }
