import appState from '../../../app-state.js';

const DEFAULT_FIX_STATE = false;

export default function setUpDragFixEngine(forceGraph) {

    appState.fixOnDrag = DEFAULT_FIX_STATE;

    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', event => {
        appState.fixOnDrag = event.target.checked;
    });

    checkbox.checked = DEFAULT_FIX_STATE;

    forceGraph.element.addEventListener('keydown', event => {
        if (event.key === 'f') {
            checkbox.checked = !checkbox.checked;
            appState.fixOnDrag = checkbox.checked;
        }
    });

}
