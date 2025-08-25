export function faLabel(id) {
    if (id.length < 1) return '';

    const firstChar = id.charAt(0);
    var fa = "";

    if (firstChar == "b") {
        if (id.endsWith(":0")) {
            fa = `<i class="fa-solid fa-right-to-bracket"></i>`;
        } else if (id.endsWith(":1")) {
            fa = `<i class="fa-solid fa-right-from-bracket"></i>`;
        } else {
            fa = `<i class="fa-regular fa-circle"></i>`;
        }
    }
    if (firstChar == "s") {
        fa = `<i class="fa-regular fa-square"></i>`;
    }

    var trimmed = id.slice(1);
    trimmed = trimmed.split(':')[0];
    return `${fa} ${trimmed}`;
}
