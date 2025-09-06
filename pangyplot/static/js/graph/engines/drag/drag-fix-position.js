import { setDragFix } from "./drag-state.js";

const DEFAULT_ANCHOR_STATE = false;

export default function setUpDragFix(graphElement) {    
    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', e => {
        setDragFix(e.target.checked);
    });

    checkbox.checked = DEFAULT_ANCHOR_STATE;
    setDragFix(DEFAULT_ANCHOR_STATE);

    graphElement.addEventListener('keydown', e => {
        if (e.key === 'f') {
            checkbox.checked = !checkbox.checked;
            setDragFix(checkbox.checked);
        }
    });

}