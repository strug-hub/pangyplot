// Pause force simulation during pan/zoom for smooth 60fps interaction.
// Resume after a short debounce when the interaction ends.

import { isSimulating, pauseSim, resumeSim } from '../detail/engines/force-engine.js';

let resumeTimer = null;
const RESUME_DELAY = 150;  // ms after last interaction event

export function pauseForInteraction() {
    if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
    }
    if (isSimulating()) pauseSim();
}

export function resumeAfterInteraction() {
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
        resumeTimer = null;
        resumeSim();
    }, RESUME_DELAY);
}
