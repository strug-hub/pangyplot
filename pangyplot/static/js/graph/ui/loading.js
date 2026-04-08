// Loading screen: error display.

import { state } from '../state.js';

/** Show loading error and abort. */
export function showLoadingError(msg) {
    state.dom.loading.textContent = `Error loading data: ${msg}`;
}
