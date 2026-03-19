const searchTableBody = document.querySelector("#search-table tbody");
const predefinedColors = [
    "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff",
    "#00ffff", "#800000", "#808000", "#008080", "#800080"
];
let colorIndex = 0;

const inputField = document.getElementById("search-tab-bar");
const table = document.getElementById("search-table");

// Prevent illegal characters and convert input to uppercase
inputField.addEventListener("input", (event) => {
    const value = event.target.value;
    event.target.value = value.replace(/[^ATCGNatcgn]/g, "").toUpperCase();
});

inputField.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        addSequence();
    }
});

document.getElementById("add-search-button").onclick = addSequence;

function addSequence() {
    const value = inputField.value.trim();

    if (!value) return;

    // Ensure at least 4 non-N characters are present
    const nonNCount = (value.match(/[ATCG]/g) || []).length;
    if (nonNCount < 4) {
        alert(`Sequence "${value}" must contain at least 4 non-'N' characters.`);
        return;
    }

    if (value.length > 999) {
        alert(`Sequence must not be longer than 999bp.`);
        return;
    }

    const reverseComplement = getReverseComplement(value);
    const duplicateCheck = isDuplicateOrReverse(value, reverseComplement);

    if (duplicateCheck) {
        inputField.value = ""; 
        if (duplicateCheck === "exact") {
            alert(`Sequence "${value}" is already in the table.`);
        } else if (duplicateCheck === "reverse") {
            alert(`Reverse complement "${reverseComplement}" matches an existing sequence.`);
        }
        return;
    }

    inputField.value = "";

    // Generate color
    const color = predefinedColors[colorIndex] || getRandomColor();
    colorIndex = (colorIndex + 1) % predefinedColors.length;

    addSearchRow(value, reverseComplement, color);
    updateTableVisibility();
    searchSequenceEngineRun(value);
    searchSequenceEngineSetColor(value, color);
}


function addSearchRow(sequence, reverseComplement, color) {
    const row = document.createElement("tr");

    // Color picker
    const colorCell = document.createElement("td");
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = color;
    colorPicker.classList.add("color-picker");
    colorCell.appendChild(colorPicker);
    row.appendChild(colorCell);

    colorPicker.addEventListener("input", () => {
        searchSequenceEngineSetColor(sequence, colorPicker.value);
    });


    // Search string with hover showing reverse complement
    const searchCell = document.createElement("td");
    searchCell.textContent = truncateSequence(sequence); // Truncate sequence for display
    searchCell.classList.add("tooltip"); // Add tooltip class
    searchCell.setAttribute("data-tooltip", `→${sequence}\n←${reverseComplement}`); // Custom tooltip content
    row.appendChild(searchCell);

    // Remove button
    const removeCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    removeButton.classList.add("remove-row-button", "button-style");
    removeButton.onclick = () => {
        row.remove();
        updateTableVisibility();
        searchSequenceEngineRemove(sequence);
    };
    removeCell.appendChild(removeButton);
    row.appendChild(removeCell);

    searchTableBody.appendChild(row);
}

function isDuplicateOrReverse(sequence, reverseComplement) {
    const rows = searchTableBody.querySelectorAll("tr td:nth-child(2)");
    for (const row of rows) {
        const storedSequence = row.getAttribute("data-tooltip").split("\n")[0].replace("Sequence: ", "");
        if (storedSequence === sequence) {
            return "exact"; // Exact match
        } else if (storedSequence === reverseComplement) {
            return "reverse"; // Reverse complement match
        }
    }
    return false; // No duplicate or reverse complement
}


function getReverseComplement(sequence) {
    const complement = {
        A: "T",
        T: "A",
        C: "G",
        G: "C",
        N: "N"
    };
    return sequence
        .split("")
        .reverse()
        .map((char) => complement[char] || char)
        .join("");
}

function truncateSequence(sequence) {
    return sequence.length > 8 ? sequence.slice(0, 8) + "..." : sequence;
}

function getRandomColor() {
    return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;
}

function updateTableVisibility() {
    const rows = searchTableBody.querySelectorAll("tr").length;
    table.style.display = rows > 0 ? "table" : "none";
}

// Initially hide the table
updateTableVisibility();
