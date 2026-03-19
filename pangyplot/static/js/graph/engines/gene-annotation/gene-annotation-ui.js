import { GeneRecord, CustomAnnotationRecord } from "../../data/records/objects/annotation-record.js";
import { createButton } from "@ui/elements/button.js";

var allRecords = [];

function getTableData(forceGraph) {
    const tableData = [];
    for (const record of forceGraph.getRenderRecords()) {
        tableData.push({
            id: record.id,
            name: record.name,
            hasExon: record instanceof GeneRecord && record.hasExons(),
            isCustom: record instanceof CustomAnnotationRecord,
            color: record.color,
            visible: record.isVisible,
            record: record
        });
    }
    return tableData;
}

export function populateGeneAnnotationsTable(forceGraph) {

    const annotations = getTableData(forceGraph);
    allRecords = annotations.map(a => a.record);

    const tableBody = document.getElementById("gene-annotations-body");
    tableBody.innerHTML = ""; // Clear previous content

    if (annotations.length === 0) {
        document.getElementById("no-annotations-text").classList.remove("hidden");
        document.getElementById("gene-annotations-table-container").classList.add("hidden");
        document.getElementById("gene-annotations-control-container").classList.add("hidden");
        return;
    }

    document.getElementById("no-annotations-text").classList.add("hidden");
    document.getElementById("gene-annotations-table-container").classList.remove("hidden");
    document.getElementById("gene-annotations-control-container").classList.remove("hidden");

    annotations.forEach(annotation => {
        const row = document.createElement("tr");

        // Gene Name button
        const geneNameCell = document.createElement("td");
        const geneButton = createButton({
            text: annotation.name,
            classList: ["gene-toggle-annotation-row"],
            selected: annotation.visible,
            onClick: () => toggleGeneSelection(annotation.record, geneButton)
        });
        geneButton.setAttribute("data-id", annotation.id);
        geneNameCell.appendChild(geneButton);
        row.appendChild(geneNameCell);

        // Exon toggle button
        const exonCell = document.createElement("td");
        const exonButton = createButton({
            icon: "eye",
            classList: ["exon-toggle-annotation-row"],
            disabled: !annotation.hasExon,
            onClick: () => toggleExonSelection(annotation.record, exonButton)
        });
        exonCell.appendChild(exonButton);
        row.appendChild(exonCell);

        // Delete row button
        if (annotation.isCustom) {
            const deleteCell = document.createElement("td");
            const deleteButton = createButton({
                icon: "trash",
                classList: ["delete-annotation-row"],
                onClick: () => forceGraph.deleteCustomAnnotation(annotation.id)
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
        colorPicker.value = annotation.color;
        colorPicker.setAttribute("data-id", annotation.id);
        colorPicker.classList.add("color-picker-annotation-row", "color-picker");
        colorPicker.onchange = () => handleColorChange(annotation.record, colorPicker.value);

        colorCell.appendChild(colorPicker);
        row.appendChild(colorCell);

        tableBody.appendChild(row);
    });
}
function toggleGeneSelection(record, button) {
    button.classList.toggle("button-selected");
    const isSelected = button.classList.contains("button-selected");
    record.setVisibility(isSelected);
}

function toggleExonSelection(record, button) {
    button.classList.toggle("button-selected");
    const isSelected = button.classList.contains("button-selected");
    record.setShowExons(isSelected);
}

function handleColorChange(record, color) {
    record.setColor(color);
}

function selectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.add("button-selected");
        for (const record of allRecords) {
            record.setVisibility(true);
        }
    });
}

function deselectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.remove("button-selected");
        for (const record of allRecords) {
            record.setVisibility(false);
        }
    });
}

function setAllColors() {
    const color = document.getElementById("set-color-picker-gene-annotations").value;
    document.querySelectorAll(".color-picker-annotation-row").forEach(picker => {
        picker.value = color;
        for (const record of allRecords) {
            record.setColor(color);
        }
    });
}

// Initialize event listeners
document.getElementById("select-all-gene-annotations").onclick = selectAllGenes;
document.getElementById("deselect-all-gene-annotations").onclick = deselectAllGenes;
document.getElementById("set-all-colors-gene-annotations").onclick = setAllColors;

