import eventBus from "../utils/event-bus.js";

const EMPTY = "⬜";
const EMPTY_FLANKING = "flankingregion";

document.getElementById("go-button").addEventListener("click", function () {
  const goBox = document.getElementById("go-chrom-start-end");
  let chromosome = document.getElementById("go-chrom").textContent;
  let start = document.getElementById("go-start").textContent;
  let end = document.getElementById("go-end").textContent;

  if (
    chromosome == null || chromosome == EMPTY ||
    start == null || start == EMPTY ||
    end == null || end == EMPTY
  ) {
    errorAnimationBadInput(goBox);
  } else {

    const flanking = getFlankingInput();
    const minusFlanking = document.getElementById('go-flanking-minus-button');
    const plusFlanking = document.getElementById('go-flanking-plus-button');
        
    if(minusFlanking.classList.contains("button-selected")){
      const startInt = parseInt(start);
      start = String(Math.max(0, startInt-flanking));
    } if(plusFlanking.classList.contains("button-selected")){
      const endInt = parseInt(end);
      end = String(endInt+flanking);
    }

    const data = {
      genome: document.getElementById('go-genome').textContent,
      chromosome,
      start,
      end
    };
    eventBus.publish("ui:construct-graph", data);
  }
});

function updateGoValues(chromValue = null, startValue = null, endValue = null) {
  if (chromValue !== null) {
    document.getElementById("go-chrom").textContent = chromValue;
  } else {
    document.getElementById("go-chrom").textContent = EMPTY;
  }
  if (startValue !== null) {
    document.getElementById("go-start").textContent = startValue;
  } else {
    document.getElementById("go-start").textContent = EMPTY;
  }
  if (endValue !== null) {
    document.getElementById("go-end").textContent = endValue;
  } else {
    document.getElementById("go-end").textContent = EMPTY;
  }
}

function errorAnimationBadInput(textBox) {
  textBox.classList.add("shake", "error-input");
  textBox.addEventListener(
    "animationend",
    function () {
      textBox.classList.remove("shake");
      textBox.classList.remove("error-input");
    },
    { once: true },
  );
}

eventBus.subscribe("ui:coordinates-changed", function (data) {
    updateGoValues(data.chromosome, data.start, data.end);
});

function updateGenomicCoordinates(rawText) {
  if (rawText == null || rawText == "") {
    return;
  }
  const textBox = document.getElementById("go-chrom-start-end");
  let input = rawText.replace(/\s+/g, "");

  const pattern = /^(chr)?[^:]+:\d+-\d+$/;

  if (!pattern.test(input)) {
    errorAnimationBadInput(textBox);
    return;
  }

  let [chromosome, range] = input.split(":");
  let [start, end] = range.split("-").map((s) => parseInt(s, 10));

  if (end < 0 || start < 0) {
    errorAnimationBadInput(textBox);
    return;
  }

  if (end < start) {
    errorAnimationBadInput(textBox);
    return;
  }

  textBox.value = "";

  const data = {chromosome: chromosome, start: start, end: end, source: "coordinate-text"};
  eventBus.publish("ui:coordinates-changed", data);
}

function getFlankingInput() {
  const textBox = document.getElementById("go-flanking");
  const rawText = textBox.innerHTML; 
  let input = rawText.replace(/\s+/g, "").toLowerCase();

  const pattern = /^(\d+)(kb|mb)?$/;

  if (!pattern.test(input)) {
    return 0;
  }

  const match = input.match(pattern);

  const numberPart = parseInt(match[1]);
  let suffix = match[2] ? match[2] : "1";
  if (suffix === "mb"){
    suffix = "1000000";
  } if (suffix === "kb"){
    suffix = "1000";
  }

  suffix = parseInt(suffix);
  return numberPart * suffix;
}

function updateFlanking(rawText) {
  if (rawText == null || rawText == "") {
    return;
  }
  const textBox = document.getElementById("go-flanking");
  let input = rawText.replace(/\s+/g, "").toLowerCase();

  const pattern = /^(\d+)(kb|mb)?$/;

  if (!pattern.test(input)) {
    errorAnimationBadInput(textBox);
    return;
  }

  const match = input.match(pattern);
  const numberPart = match[1];
  const suffix = match[2] ? " " + match[2] : "";

  textBox.innerHTML = numberPart + suffix;
}


function transformToTextbox(elementId) {
  const container = document.getElementById(elementId);

  let input = container.querySelector("input");
  if (!input) {
    const currentInside = container.innerHTML;
    const currentText = container.textContent.replace(/\s+/g, "");

    input = document.createElement("input");
    input.type = "text";
    input.classList.add("editable-textbox");
    if (currentText == `${EMPTY}:${EMPTY}-${EMPTY}`) {
      input.value = "";
    } else if (currentText == EMPTY_FLANKING) {
      input.value = "";
    } else {
      input.value = currentText;
    }

    container.innerHTML = "";
    container.appendChild(input);

    input.focus();
    input.select();

    function revertToText() {
      const container = document.getElementById(elementId);
      const userInput = input.value;
      container.innerHTML = currentInside;
      if (elementId === "go-chrom-start-end"){
        updateGenomicCoordinates(userInput);
      } else if(elementId === "go-flanking"){
        updateFlanking(userInput);
      }
    }

    // Modify the transformToTextbox function to include this:
    input.addEventListener("blur", revertToText);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        revertToText();
      }
    });
  }
}

document.getElementById("go-chrom-start-end").addEventListener("click", function () {
  transformToTextbox("go-chrom-start-end")});
document.getElementById("go-flanking").addEventListener("click", function () {
  transformToTextbox("go-flanking")});
  
function copyToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

document.getElementById("coordinate-copy-button").addEventListener("click", function () {
  const chrom = document.getElementById("go-chrom").textContent;
  const start = document.getElementById("go-start").textContent;
  const end = document.getElementById("go-end").textContent;
  const textToCopy = chrom + ":" + start + "-" + end;

  copyToClipboard(textToCopy);
  showCopySuccess("go-chrom-start-end");
});

const goCopyEffectWaitTime = 400;
let showGoCopyEffect = true;
function showCopySuccess(elementId) {
  if (showGoCopyEffect) {
    const div = document.getElementById(elementId);
    div.style.backgroundColor = "var(--highlight)";

    showCopyPopup(elementId);

    showGoCopyEffect = false;
    setTimeout(() => {
      showGoCopyEffect = true;
    }, goCopyEffectWaitTime);

    setTimeout(() => {
      div.style.backgroundColor = "";
      div.style.color = "";
    }, 200);
  }
}

function showCopyPopup(elementId) {
  const popup = document.createElement("div");
  popup.textContent = "Copied!";
  popup.id = "copyPopup";
  document.body.appendChild(popup);

  const area = document.getElementById(elementId);
  const areaRect = area.getBoundingClientRect();
  popup.style.position = "absolute";
  popup.style.left = `${areaRect.left}px`;
  popup.style.top = `${window.scrollY + areaRect.top - 30}px`;

  setTimeout(() => {
    popup.style.opacity = "0";
    setTimeout(() => document.body.removeChild(popup), 500);
  }, 800);
}


  document.addEventListener('DOMContentLoaded', function () {
      var plusButton = document.getElementById('go-flanking-plus-button');
      var minusButton = document.getElementById('go-flanking-minus-button');

      plusButton.addEventListener('click', function() {
          this.classList.toggle('highlighted');
          this.classList.toggle('button-selected');
      });

      minusButton.addEventListener('click', function() {
          this.classList.toggle('highlighted');
          this.classList.toggle('button-selected');
      });
  });
