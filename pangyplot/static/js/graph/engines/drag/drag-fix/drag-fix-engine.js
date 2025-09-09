const DEFAULT_FIX_STATE = false;

export default function setUpDragFixEngine(forceGraph) {

    forceGraph.fixOnDrag = DEFAULT_FIX_STATE;

    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', event => {
        forceGraph.fixOnDrag = event.target.checked;
    });

    checkbox.checked = DEFAULT_FIX_STATE;

    forceGraph.element.addEventListener('keydown', event => {
        if (event.key === 'f') {
            checkbox.checked = !checkbox.checked;
            forceGraph.fixOnDrag = checkbox.checked;
        }
    });

}