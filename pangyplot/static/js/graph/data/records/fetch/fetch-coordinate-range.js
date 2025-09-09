import DEBUG_MODE from '../../../../debug-mode.js';
import { fetchData, buildUrl } from '../../../../utils/network-utils.js';
import { showLoader, hideLoader } from './fetch-ui.js';
import { deserializeGraph } from '../deserializer/deserializer.js';

export async function fetchCoordinateRange(coords) {
  const url = buildUrl('/select', coords);
  let graphRecords = null;
  showLoader();

  try {
    const rawGraph = await fetchData(url, 'coords-fetch');

    if (DEBUG_MODE) {
      console.log("[fetch-coordinate-range] raw:", rawGraph);
    }

    graphRecords = deserializeGraph(rawGraph);
    
    if (DEBUG_MODE) {
      console.log("[fetch-coordinate-range] deserialized:", graphRecords);
    }

  } catch (error) {
    console.warn("[fetch-coordinate-range] error:", error);
  } finally {
    hideLoader();
    return graphRecords;
  }
}
