export default function createSelectableTable(prefix, data, header) {

    // Create table + header
    const table = document.createElement("table");
    table.id = `${prefix}-selectable-table`;
    table.classList.add("selectable-table");

    const headerElement = document.createElement("div");
    headerElement.id = `${prefix}-selectable-table-header`;
    headerElement.classList.add("selectable-table-header");
    headerElement.textContent = header;
    table.appendChild(headerElement);

    // Body with rows
    const tbody = document.createElement("tbody");
    data.forEach((d, idx) => {
        const row = document.createElement("tr");
        row.tabIndex = 0; // focusable
        row.dataset.index = idx;

        const cell = document.createElement("td");
        cell.textContent = d.label;
        row.appendChild(cell);

        // Click to select
        row.addEventListener("click", () => {
            tbody.querySelectorAll(".selected").forEach(r => r.classList.remove("selected"));
            row.classList.add("selected");

            // emit event with selected path
            table.dispatchEvent(new CustomEvent(`${prefix}-row-select`, {
                detail: { index: idx, item: d.item },
                bubbles: true
            }));
        });

        tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table;
}