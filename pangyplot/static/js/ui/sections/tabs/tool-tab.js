import eventBus from '@event-bus';

document.addEventListener('DOMContentLoaded', () => {
    const checkbox = document.getElementById('anchorToggle');
    checkbox.addEventListener('change', e => {
        eventBus.publish('ui:anchor-node-changed', e.target.checked);
    });
});