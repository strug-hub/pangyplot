import eventBus from '@event-bus';
import { isDebugMode, setDebugMode } from '@app-state';
import { setupModal } from "@ui/elements/modal.js";

// --- Modals ---

setupModal({
    modalId: "citation-modal",
    openButtonId: "navbar-button-citation",
    closeButtonId: "citation-modal-close-button"
});

setupModal({
    modalId: "info-modal",
    openButtonId: "navbar-button-information",
    closeButtonId: "info-modal-close-button",
    startOpen: !isDebugMode()
});

// --- Debug mode toggle (Ctrl+click on version overlay) ---

const versionOverlay = document.getElementById('version-overlay');

function updateDebugIndicator(enabled) {
    versionOverlay.style.backgroundColor = enabled ? 'var(--highlight)' : '';
}

updateDebugIndicator(isDebugMode());

versionOverlay.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setDebugMode(!isDebugMode());
    }
});

eventBus.subscribe('app:debug-mode-changed', updateDebugIndicator);

// --- Example buttons ---

document.getElementById('navbar-button-example').addEventListener('click', function() {

    //PRSS1-PRSS2
    const data = {
        genome: "GRCh38",
        chromosome: "chr7",
        start: 142746827,
        end: 142776017,
        source:"navbar-example"
    };
    eventBus.publish("ui:coordinates-changed", data);
});

document.getElementById('navbar-button-example2').addEventListener('click', function() {

    //EXOC3
    const data = {
        genome: "GRCh38",
        chromosome: "chr5",
        start: 433522,
        end: 491937,
        source:"navbar-example"
    };

    eventBus.publish("ui:coordinates-changed", data);

});

document.getElementById('navbar-button-example3').addEventListener('click', function() {

    //DAZ1
    const data = {
        genome: "GRCh38",
        chromosome: "chrY",
        start: 23128355,
        end: 23200010,
        source:"navbar-example"
    };

    eventBus.publish("ui:coordinates-changed", data);

});
