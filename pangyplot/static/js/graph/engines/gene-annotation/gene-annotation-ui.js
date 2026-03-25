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
 *   { id, name, color, visible, starred?, hasExon?,
 *     onToggle(visible), onColor(color), onStar?(), onExonToggle?(visible), onDelete?() }
 * @param {Object} [opts]
 * @param {boolean} [opts.showExonColumn=true]
 * @param {boolean} [opts.showStarColumn=false]
 */

let allEntries = [];
let filterText = '';

export function populateGeneAnnotationsTable(entries, opts = {}) {
    const { showExonColumn = true, showStarColumn = false } = opts;
    allEntries = entries;

    const tableBody = document.getElementById("gene-annotations-body");
    tableBody.innerHTML = "";

    // Exon column header visibility
    const exonHeader = document.getElementById("gene-annotations-exon-header");
    if (exonHeader) exonHeader.classList.toggle("hidden", !showExonColumn);

    // Star column header
    const starHeader = document.getElementById("gene-annotations-star-header");
    if (starHeader) starHeader.classList.toggle("hidden", !showStarColumn);

    // Filter search bar
    let filterInput = document.getElementById("gene-filter-input");
    if (!filterInput && showStarColumn) {
        // Create filter bar (once) before the table container
        const container = document.getElementById("gene-annotations-table-container");
        if (container) {
            filterInput = document.createElement("input");
            filterInput.type = "text";
            filterInput.id = "gene-filter-input";
            filterInput.placeholder = "Filter genes...";
            filterInput.classList.add("gene-filter-input");
            filterInput.value = filterText;
            container.parentNode.insertBefore(filterInput, container);
            filterInput.addEventListener("input", () => {
                filterText = filterInput.value;
                renderRows(tableBody, allEntries, showExonColumn, showStarColumn);
            });
        }
    }
    if (filterInput) {
        filterInput.classList.toggle("hidden", !showStarColumn || entries.length === 0);
        filterInput.value = filterText;
    }

    if (entries.length === 0) {
        document.getElementById("no-annotations-text").classList.remove("hidden");
        document.getElementById("gene-annotations-table-container").classList.add("hidden");
        document.getElementById("gene-annotations-control-container").classList.add("hidden");
        return;
    }

    document.getElementById("no-annotations-text").classList.add("hidden");
    document.getElementById("gene-annotations-table-container").classList.remove("hidden");
    document.getElementById("gene-annotations-control-container").classList.remove("hidden");

    renderRows(tableBody, entries, showExonColumn, showStarColumn);
}

function renderRows(tableBody, entries, showExonColumn, showStarColumn) {
    tableBody.innerHTML = "";

    const filter = filterText.toLowerCase();

    // Separate starred and unstarred; starred always shown regardless of filter
    const starred = [];
    const unstarred = [];
    for (const entry of entries) {
        if (entry.starred) {
            starred.push(entry);
        } else {
            if (filter && !entry.name.toLowerCase().includes(filter)) continue;
            unstarred.push(entry);
        }
    }

    // Render starred section first
    if (showStarColumn && starred.length > 0) {
        const dividerRow = document.createElement("tr");
        dividerRow.classList.add("gene-starred-divider");
        const dividerCell = document.createElement("td");
        dividerCell.colSpan = showExonColumn ? 5 : 4;
        dividerCell.innerHTML = '<i class="fa-solid fa-star"></i> Starred';
        dividerCell.classList.add("gene-starred-label");
        dividerRow.appendChild(dividerCell);
        tableBody.appendChild(dividerRow);

        for (const entry of starred) {
            tableBody.appendChild(buildRow(entry, showExonColumn, showStarColumn));
        }

        // Divider between starred and unstarred
        if (unstarred.length > 0) {
            const sep = document.createElement("tr");
            sep.classList.add("gene-section-separator");
            const sepCell = document.createElement("td");
            sepCell.colSpan = showExonColumn ? 5 : 4;
            sep.appendChild(sepCell);
            tableBody.appendChild(sep);
        }
    }

    for (const entry of unstarred) {
        tableBody.appendChild(buildRow(entry, showExonColumn, showStarColumn));
    }
}

function buildRow(entry, showExonColumn, showStarColumn) {
    const row = document.createElement("tr");

    // Star button (first column)
    if (showStarColumn) {
        const starCell = document.createElement("td");
        const starBtn = createButton({
            icon: "star",
            classList: ["gene-star-btn"],
            selected: entry.starred,
            onClick: () => {
                starBtn.classList.toggle("button-selected");
                if (entry.onStar) entry.onStar();
            }
        });
        starCell.appendChild(starBtn);
        row.appendChild(starCell);
    }

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

    return row;
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
