/**
 * Global application state — shared across all layers.
 * Server-injected config is read from window.__APP_CONFIG.
 * UI sections write to it, utilities read from it.
 */

const config = window.__APP_CONFIG || {};

export const DEBUG_MODE = true;

export function getCurrentLang() {
    const params = new URLSearchParams(window.location.search);
    return params.get("lang") || "en";
}

export function getGenome()     { return config.genome || ""; }
export function getChromosome() { return config.chromosome || ""; }
export function getStart()      { return config.start || ""; }
export function getEnd()        { return config.end || ""; }
export function getVersion()    { return config.version || ""; }
export function getVersionName(){ return config.versionName || ""; }
