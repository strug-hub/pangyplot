export default function createPathTableElement(paths) {
    const pathContainer = document.getElementById("path-table-container");
    pathContainer.innerHTML = "";

    if (!paths?.length) {
        pathContainer.textContent = "No path data available.";
        pathContainer.classList.add("path-no-data");
        return;
    }

    pathContainer.classList.remove("path-no-data");
    // Create table + header
    const table = document.createElement("table");
    table.className = "path-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = "Path IDs";
    headerRow.appendChild(th);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body with rows
    const tbody = document.createElement("tbody");
    paths.forEach((subpath, idx) => {
        const row = document.createElement("tr");
        row.tabIndex = 0; // focusable
        row.dataset.index = idx;

        const cell = document.createElement("td");
        cell.textContent = `${subpath.contig}:${subpath.start}-${subpath.start + subpath.length}`;
        row.appendChild(cell);

        // Click to select
        row.addEventListener("click", () => {
            tbody.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");

            // emit event with selected path
            table.dispatchEvent(new CustomEvent("pathselect", {
                detail: { index: idx, item: subpath },
                bubbles: true
            }));
        });

        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    pathContainer.appendChild(table);

    return table;
}