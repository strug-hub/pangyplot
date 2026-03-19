import { createButton } from "@ui/elements/button.js";
import { GeneRecord, CustomAnnotationRecord } from "../../data/records/objects/annotation-record.js";

/**
 * Build generic entries from a forceGraph's render records (core viewer convenience).
 */
export function buildEntriesFromForceGraph(forceGraph) {
    const entries = [];
    for (const record of forceGraph.getRenderRecords()) {
        entries.push({
            id: record.id,
            name: record.name,
            color: record.color,
            visible: record.isVisible,
            hasExon: record instanceof GeneRecord && record.hasExons(),
            onToggle: (visible) => record.setVisibility(visible),
            onExonToggle: (visible) => record.setShowExons(visible),
            onColor: (color) => record.setColor(color),
            onDelete: record instanceof CustomAnnotationRecord
                ? () => forceGraph.deleteCustomAnnotation(record.id) : null,
        });
    }
    return entries;
}

/**
 * Populate the gene annotations table.
 *
 * @param {Array<Object>} entries — each entry:
 *   { id, name, color, visible, hasExon?,
 *     onToggle(visible), onColor(color), onExonToggle?(visible), onDelete?() }
 * @param {Object} [opts]
 * @param {boolean} [opts.showExonColumn=true]
 */

let allEntries = [];

export function populateGeneAnnotationsTable(entries, opts = {}) {
    const { showExonColumn = true } = opts;
    allEntries = entries;

    const tableBody = document.getElementById("gene-annotations-body");
    tableBody.innerHTML = "";

    // Exon column header visibility
    const exonHeader = document.getElementById("gene-annotations-exon-header");
    if (exonHeader) exonHeader.classList.toggle("hidden", !showExonColumn);

    if (entries.length === 0) {
        document.getElementById("no-annotations-text").classList.remove("hidden");
        document.getElementById("gene-annotations-table-container").classList.add("hidden");
        document.getElementById("gene-annotations-control-container").classList.add("hidden");
        return;
    }

    document.getElementById("no-annotations-text").classList.add("hidden");
    document.getElementById("gene-annotations-table-container").classList.remove("hidden");
    document.getElementById("gene-annotations-control-container").classList.remove("hidden");

    entries.forEach(entry => {
        const row = document.createElement("tr");

        // Gene Name button
        const geneNameCell = document.createElement("td");
        const geneButton = createButton({
            text: entry.name,
            classList: ["gene-toggle-annotation-row"],
            selected: entry.visible,
            onClick: () => {
                geneButton.classList.toggle("button-selected");
                const isSelected = geneButton.classList.contains("button-selected");
                entry.onToggle(isSelected);
            }
        });
        geneButton.setAttribute("data-id", entry.id);
        geneNameCell.appendChild(geneButton);
        row.appendChild(geneNameCell);

        // Exon toggle button (only if column is shown)
        if (showExonColumn) {
            const exonCell = document.createElement("td");
            const exonButton = createButton({
                icon: "eye",
                classList: ["exon-toggle-annotation-row"],
                disabled: !entry.hasExon,
                onClick: () => {
                    exonButton.classList.toggle("button-selected");
                    const isSelected = exonButton.classList.contains("button-selected");
                    if (entry.onExonToggle) entry.onExonToggle(isSelected);
                }
            });
            exonCell.appendChild(exonButton);
            row.appendChild(exonCell);
        }

        // Delete row button
        if (entry.onDelete) {
            const deleteCell = document.createElement("td");
            const deleteButton = createButton({
                icon: "trash",
                classList: ["delete-annotation-row"],
                onClick: () => entry.onDelete()
            });
            deleteCell.appendChild(deleteButton);
            row.appendChild(deleteCell);
        } else {
            const spacer = document.createElement("td");
            row.appendChild(spacer);
        }

        // Color picker
        const colorCell = document.createElement("td");
        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.value = entry.color;
        colorPicker.setAttribute("data-id", entry.id);
        colorPicker.classList.add("color-picker-annotation-row", "color-picker");
        colorPicker.onchange = () => entry.onColor(colorPicker.value);

        colorCell.appendChild(colorPicker);
        row.appendChild(colorCell);

        tableBody.appendChild(row);
    });
}

function selectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.add("button-selected");
    });
    for (const entry of allEntries) entry.onToggle(true);
}

function deselectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.remove("button-selected");
    });
    for (const entry of allEntries) entry.onToggle(false);
}

function setAllColors() {
    const color = document.getElementById("set-color-picker-gene-annotations").value;
    document.querySelectorAll(".color-picker-annotation-row").forEach(picker => {
        picker.value = color;
    });
    for (const entry of allEntries) entry.onColor(color);
}

// Initialize event listeners
document.getElementById("select-all-gene-annotations").onclick = selectAllGenes;
document.getElementById("deselect-all-gene-annotations").onclick = deselectAllGenes;
document.getElementById("set-all-colors-gene-annotations").onclick = setAllColors;
