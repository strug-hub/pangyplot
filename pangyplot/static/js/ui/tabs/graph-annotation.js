import { getTableData, setGeneVisibility, setGeneExonVisibility, setGeneColor } from "../../graph/engines/gene-annotation/gene-annotation-state.js";

//example
//const geneAnnotations = [
//    { id: 1, name: "Gene 1", hasExon: true, color: "#ff0000", visible: true },
//    { id: 2, name: "Gene 2", hasExon: false, color: "#00ff00", visible: false },
//    { id: 3, name: "Gene 3", hasExon: true, color: "#0000ff", visible: true },
//];

export function populateGeneAnnotationsTable() {

    const annotations = getTableData();

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
        const geneButton = document.createElement("button");
        geneButton.textContent = annotation.name;
        geneButton.setAttribute("data-id", annotation.id);
        geneButton.classList.add("button-style", "gene-toggle-annotation-row");
        if (annotation.visible) {
            geneButton.classList.add("button-selected"); // Mark as selected if visible
        }
        geneButton.onclick = () => toggleGeneSelection(annotation.id, geneButton);
        geneNameCell.appendChild(geneButton);
        row.appendChild(geneNameCell);

        // Exon toggle button
        const exonCell = document.createElement("td");
        const exonButton = document.createElement("button");
        exonButton.innerHTML = '<i class="fa-solid fa-eye"></i>';
        exonButton.classList.add("button-style", "exon-toggle-annotation-row");
        if (!annotation.hasExon) {
            exonButton.disabled = true;
        }
        exonButton.onclick = () => toggleExonSelection(annotation.id, exonButton);
        exonCell.appendChild(exonButton);
        row.appendChild(exonCell);

        // Color picker
        const colorCell = document.createElement("td");
        const colorPicker = document.createElement("input");
        colorPicker.type = "color";
        colorPicker.value = annotation.color;
        colorPicker.setAttribute("data-id", annotation.id);
        colorPicker.classList.add("color-picker-annotation-row", "color-picker");
        colorPicker.onchange = () => handleColorChange(annotation.id, colorPicker.value);

        colorCell.appendChild(colorPicker);
        row.appendChild(colorCell);

        tableBody.appendChild(row);
    });
}

function toggleGeneSelection(id, button) {
    button.classList.toggle("button-selected");
    const isSelected = button.classList.contains("button-selected");
    setGeneVisibility(id, isSelected);
}

function toggleExonSelection(id, button) {
    button.classList.toggle("button-selected");
    const isSelected = button.classList.contains("button-selected");
    setGeneExonVisibility(id, isSelected);
}

function handleColorChange(id, color) {
    setGeneColor(id, color);
}

function selectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.add("button-selected");
        const id = button.dataset.id;
        setGeneVisibility(id, true);
    });
}

function deselectAllGenes() {
    document.querySelectorAll(".gene-toggle-annotation-row").forEach(button => {
        button.classList.remove("button-selected");
        const id = button.dataset.id;
        setGeneVisibility(id, false);
    });
}

// Set all colors to the same value
function setAllColors() {
    const color = document.getElementById("set-color-picker-gene-annotations").value;
    document.querySelectorAll(".color-picker-annotation-row").forEach(picker => {
        picker.value = color;
        const id = picker.dataset.id;
        handleColorChange(id, color);
    });
}

// Initialize event listeners
document.getElementById("select-all-gene-annotations").onclick = selectAllGenes;
document.getElementById("deselect-all-gene-annotations").onclick = deselectAllGenes;
document.getElementById("set-all-colors-gene-annotations").onclick = setAllColors;

