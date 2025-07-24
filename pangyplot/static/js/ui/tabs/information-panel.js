var fullSequence ="";

function updateGraphInfo(nodeData) {

  const typeEmoji = {
    segment: '⚪',
    bubble: '🫧',
    chain: '🔗'
  };

  const emoji = typeEmoji[nodeData.type] || '🔹';
  const typeDisplay = nodeData.type ? `${emoji} ${nodeData.type.charAt(0).toUpperCase()}${nodeData.type.slice(1)}` : '';
  document.getElementById('info-node-id').textContent = nodeData.id || '';
  document.getElementById('info-node-type').textContent = typeDisplay;
  document.getElementById('info-node-section').style.display = (nodeData.id || nodeData.type) ? 'block' : 'none';

  // Position
  const hasPosition = nodeData.chrom && nodeData.start != null && nodeData.end != null;
  const positionText = hasPosition ? `${nodeData.chrom}:${nodeData.start}-${nodeData.end}` : '';
  document.getElementById('info-position').textContent = positionText;
  document.getElementById('info-position-section').style.display = hasPosition ? 'block' : 'none';

  // Length
  const showLength = nodeData.length != null && nodeData.type === "segment";
  document.getElementById('info-length').textContent = showLength ? `${nodeData.length} bp` : '';
  document.getElementById('info-sequence-section').style.display = showLength ? 'block' : 'none';

  // Neo4j link
  goToNeo4jBrowser(nodeData.type, nodeData.id);

  // Sequence or Nodes Inside
  const type = nodeData.type;
  if (type === "segment") {
    fullSequence = nodeData.sequence || '';
    const formattedSequence = fullSequence.match(/.{1,40}/g)?.join('\n') || '';
    document.getElementById('info-sequence-full').textContent = formattedSequence;
    document.getElementById('info-full-sequence-container').style.display = fullSequence ? "block" : "none";
    document.getElementById('info-n-inside-container').style.display = "none";
  } else if (type === "bubble" || type === "chain") {
    const children = nodeData.children != null ? nodeData.children : '';
    document.getElementById('info-number-inside').textContent = children;
    document.getElementById('info-n-inside-container').style.display = children ? "block" : "none";
    document.getElementById('info-full-sequence-container').style.display = "none";
  } else {
    document.getElementById('info-full-sequence-container').style.display = "none";
    document.getElementById('info-n-inside-container').style.display = "none";
  }
}

document.getElementById('info-copy-id').addEventListener('click', function () {
  const text = `${document.getElementById('info-node-id').textContent}`;
  navigator.clipboard.writeText(text);
});

document.getElementById('info-copy-position').addEventListener('click', function () {
  const text = `${document.getElementById('info-position').textContent}`;
  navigator.clipboard.writeText(text);
});

document.getElementById('info-copy-sequence').addEventListener('click', function () {
  const text = `${fullSequence}`;
  navigator.clipboard.writeText(text);
});


let frameTimes = [];
//average across last [maxFrames] frames
const maxFrames = 10;

function calculateFPS(){
  const elementFPS = document.getElementById('info-fps');

  const now = Date.now();
  frameTimes.push(now);

  if (frameTimes.length > maxFrames) {
      frameTimes.shift();
  }

  if (frameTimes.length > 1) {
      const timeDiff = frameTimes[frameTimes.length - 1] - frameTimes[0];
      const frameRate = 1000 * frameTimes.length / timeDiff;

      elementFPS.textContent = `${frameRate.toFixed(2)}`;
  }
}

function showGraphInfo(graphData){
  const elementNodes = document.getElementById('info-graph-nodes');
  const elementLinks = document.getElementById('info-graph-links');
 
  elementNodes.textContent = `${graphData.nodes.length}`;
  elementLinks.textContent = `${graphData.links.length}`;

}

function goToNeo4jBrowser(nodetype, id) {
  if (!nodetype || !id) {
    console.warn('nodetype and id are required to generate the Neo4j query.');
    return;
  }

  const type = nodetype.charAt(0).toUpperCase() + nodetype.slice(1);
  const query = `MATCH (n:${type}) WHERE n.id = "${id}" RETURN n`;
  const encodedQuery = encodeURIComponent(query);
  const neo4jUrl = `http://localhost:7474/browser/?cmd=edit&arg=${encodedQuery}`;

  button.onclick = () => {
    window.open(neo4jUrl, '_blank');
  };
}


function debugInformationUpdate(graphData){
  calculateFPS();
  showGraphInfo(graphData);
}

function showCoordinates(coordinates){
  const elementCanvasCoord = document.getElementById('info-canvas-coordinates');
  const elementScreenCoord = document.getElementById('info-screen-coordinates');
  const ndigits = 0;

  const x = Math.round(coordinates.x*(10**ndigits))/(10**ndigits);
  const y = Math.round(coordinates.y*(10**ndigits))/(10**ndigits);

  elementCanvasCoord.textContent = `(${x}, ${y})`;

  const mx = Math.round(coordinates.screen.x*100)/100
  const my = Math.round(coordinates.screen.y*100)/100

  elementScreenCoord.textContent = `(${mx}, ${my})`;  
}
