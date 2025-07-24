//TODO: draw on canvas or move to ui

export function createLegendContainer() {
  let legend = document.getElementById('graph-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'graph-legend';
    legend.style.display = 'none'; // hidden until used
    document.getElementById('graph-container').appendChild(legend);
  }

  if (!document.getElementById('graph-legend-title')) {
    const title = document.createElement('div');
    title.id = 'graph-legend-title';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '6px';
    legend.appendChild(title);
  }
}

export function setLegendTitle(title) {
  createLegendContainer();
  const titleDiv = document.getElementById('graph-legend-title');
  if (title) {
    titleDiv.textContent = title;
    titleDiv.style.display = 'block';
  } else {
    titleDiv.style.display = 'none';
  }
}

export function setLegendItems(items) {
  createLegendContainer();
  const legend = document.getElementById('graph-legend');

  while (legend.children.length > 1) {
    legend.removeChild(legend.lastChild);
  }

  if (items.length === 0) {
    legend.style.display = 'none';
    return;
  }

  legend.style.display = 'block';

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'legend-item';

    const colorBox = document.createElement('span');
    colorBox.className = 'legend-color';
    colorBox.style.backgroundColor = item.color;

    const label = document.createElement('span');
    label.textContent = item.label;

    div.appendChild(colorBox);
    div.appendChild(label);
    legend.appendChild(div);
  });
}

export function clearLegend() {
  const legend = document.getElementById('graph-legend');
  if (legend) {
    legend.style.display = 'none';
    while (legend.children.length > 1) {
      legend.removeChild(legend.lastChild);
    }
  }
}
