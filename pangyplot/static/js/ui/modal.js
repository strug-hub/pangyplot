import { setupModal } from "@ui/elements/modal.js";

setupModal({
    modalId: "citation-modal",
    openButtonId: "navbar-button-citation",
    closeButtonId: "citation-modal-close-button"
});

setupModal({
    modalId: "info-modal",
    openButtonId: "navbar-button-information",
    closeButtonId: "info-modal-close-button",
    startOpen: true
});
