import { setUpDebugInformationEngine } from "./debug/debug-information-engine.js";
import setUpSelectionInformationEngine from './selection/selection-information-engine.js';


export default function setUpInformationEngine(forceGraph) {
    setUpDebugInformationEngine(forceGraph);
    setUpSelectionInformationEngine(forceGraph);
}
