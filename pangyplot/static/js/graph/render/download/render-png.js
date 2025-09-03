import { getImageName } from './download-utils.js';

export function exportGraphToPng(forceGraph){
    const canvas = document.querySelector('.force-graph-container canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = getImageName('png');
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
