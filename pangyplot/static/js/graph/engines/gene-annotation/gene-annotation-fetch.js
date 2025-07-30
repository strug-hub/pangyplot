import { fetchData, buildUrl } from "../../utils/network-utils.js";
import { addGene, clearAllGenes } from "./gene-annotation-state.js";

export function fetchAnnotations(coordinates) {
    const url = buildUrl("/genes", coordinates);

    return fetchData(url, "genes").then(fetchedData => {

        clearAllGenes();

        if (fetchedData) {
            fetchedData.genes.forEach(gene => addGene(gene));
        }

        return true;
    }).catch(err => console.error("Failed to fetch annotations:", err));
}   
