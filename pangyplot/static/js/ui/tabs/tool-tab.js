import eventBus from '../../input/event-bus.js';

document.addEventListener('DOMContentLoaded', () => {
    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', e => {
        eventBus.publish('anchor-node-changed', e.target.checked);
    });
});