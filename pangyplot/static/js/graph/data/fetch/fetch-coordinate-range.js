import { fetchData, buildUrl } from '../../../utils/network-utils.js';
import DEBUG_MODE from '../../../debug-mode.js';
import { showLoader, hideLoader } from './fetch-ui.js';

export async function fetchCoordinateRange(coordinates) {
  const url = buildUrl('/select', coordinates);
  let rawGraph = null;
  showLoader();
  try {
    rawGraph = await fetchData(url, 'graph');
    if (DEBUG_MODE) {
      console.log("[fetch-coordinate-range] range:", rawGraph);
    }
  } catch (error) {
    console.warn("[fetch-coordinate-range] Error in coordinate range query:", error);
  } finally {
    hideLoader();
    return rawGraph;
  }
}
