import eventBus from '../../utils/event-bus.js';

document.addEventListener('DOMContentLoaded', () => {
    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', e => {
        eventBus.publish('ui:anchor-node-changed', e.target.checked);
    });
});