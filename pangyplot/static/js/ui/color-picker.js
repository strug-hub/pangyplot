const bgColorPicker = document.getElementById('color-picker-bg');
const linkColorPicker = document.getElementById('color-picker-link');

function applyGradient(color1, color2, color3) {
    let gradient;
    let useMiddle = true;
    if (color1 == color2 || color3 == color2){
        useMiddle = false;
    }
    if (useMiddle) {
        gradient = `linear-gradient(to right, ${color1}, ${color2}, ${color3})`;
    } else {
        gradient = `linear-gradient(to right, ${color1}, ${color3})`;
    }
    document.getElementById('color-picker-gradient-display').style.background = gradient;
}

document.querySelectorAll('.color-picker-node').forEach(picker => {
    picker.addEventListener('change', () => {
        const color1 = document.getElementById('color-picker-node-1').value;
        const color2 = document.getElementById('color-picker-node-2').value;
        const color3 = document.getElementById('color-picker-node-3').value;
        unselectAllButtons("color-preset")
        applyGradient(color1, color2, color3);
    });
});

function updateColorPickers(color1, color2, color3) {
    document.getElementById('color-picker-node-1').value = color1;
    document.getElementById('color-picker-node-2').value = color2;
    document.getElementById('color-picker-node-3').value = color3;

    const colorData = { type: "node", color1: color1, color2: color2, color3: color3 };
    document.dispatchEvent(new CustomEvent("updateColor", { detail: colorData }));
}

document.querySelectorAll('.color-preset-option').forEach(elem => {
    elem.addEventListener('click', () => {
        const color1 = elem.getAttribute('data-color1');
        const color2 = elem.getAttribute('data-color2');
        const color3 = elem.getAttribute('data-color3');
        updateColorPickers(color1, color2, color3);
        applyGradient(color1, color2, color3);
    });
});

document.querySelectorAll('.color-style-option').forEach(elem => {
    elem.addEventListener('click', () => {
        const colorData = { type: "style", style: elem.getAttribute('data-style') };
        document.dispatchEvent(new CustomEvent("updateColor", { detail: colorData }));
    });
});

bgColorPicker.addEventListener('change', function(event) {
    const colorData = { type: "background", color: bgColorPicker.value };
    document.dispatchEvent(new CustomEvent("updateColor", { detail: colorData }));
});
linkColorPicker.addEventListener('change', function(event) {
    const colorData = { type: "link", color: bgColorPicker.value };
    document.dispatchEvent(new CustomEvent("updateColor", { detail: colorData }));
});


// default colors below

let defaultChoice = document.getElementsByClassName('color-preset-option button-group-selected')[0];
if (defaultChoice) {
    let color1 = defaultChoice.getAttribute('data-color1');
    let color2 = defaultChoice.getAttribute('data-color2');
    let color3 = defaultChoice.getAttribute('data-color3');

    applyGradient(color1, color2, color3);
    updateColorPickers(color1, color2, color3);
}

bgColorPicker.value = "#101020";
linkColorPicker.value = "#969696";

