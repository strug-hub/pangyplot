import DEBUG_MODE from '../../../../debug-mode.js';
import { fetchData, buildUrl } from '../../../../utils/network-utils.js';
import { deserializeGenes } from '../deserializer/deserializer.js';

export async function fetchGeneAnnotations(coords) {
    let geneRecords = null;

    try {
        const params = { ...coords };
        const url = buildUrl("/genes", params);
        const rawGenes = await fetchData(url, 'subgraph');
        geneRecords = deserializeGenes(rawGenes.genes);

        if (DEBUG_MODE) {
            console.log("[fetch-gene-annotations]", "raw:", rawGenes, "deserialized:", geneRecords);
        }

    } catch (error) {
        console.warn("[fetch-gene-annotations] error:", error);
    } finally {
        return geneRecords;
    }
}