// Path trace animation: tick-based walk through the resolved path.

import {
    resolvedPath, animationCursor, isPlaying, playForward, stepsPerFrame,
    setAnimationCursor, setIsPlaying, setPlayForward, setStepsPerFrame,
} from './path-trace-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

let _frameCount = 0;
let _pauseIn = null;
let _resetState = true;

// ---------------------------------------------------------------
// Controls
// ---------------------------------------------------------------

export function playAnimation() {
    setPlayForward(true);
    _pauseIn = null;
    setIsPlaying(true);
    _resetState = false;
    scheduleFrame();
}

export function pauseAnimation() {
    setIsPlaying(false);
}

export function frameAdvance() {
    _pauseIn = 1;
    setPlayForward(true);
    setIsPlaying(true);
    _resetState = false;
    scheduleFrame();
}

export function frameBackward() {
    _pauseIn = 1;
    setPlayForward(false);
    setIsPlaying(true);
    _resetState = false;
    scheduleFrame();
}

export function resetAnimation() {
    setIsPlaying(false);
    _pauseIn = null;
    setPlayForward(true);
    _resetState = true;
    setAnimationCursor(-1);
    _updateStepDisplay(null);
    scheduleFrame();
}

export function changeAnimationSpeed(speed) {
    setStepsPerFrame(speed);
}

// ---------------------------------------------------------------
// Tick (called each frame from render loop)
// ---------------------------------------------------------------

/**
 * Advance animation state. Call each frame before drawPathTrace().
 * Mutates animationCursor in path-trace-state.
 */
export function tickPathAnimation() {
    if (resolvedPath.length === 0) return;
    if (_resetState && !isPlaying) return;
    if (!isPlaying) return;

    // Keep the render loop alive while animation is playing
    scheduleFrame();

    _frameCount++;
    let stepAdvance = 0;

    if (stepsPerFrame >= 1) {
        _frameCount = 0;
        stepAdvance = playForward ? stepsPerFrame : -stepsPerFrame;
    } else if (_frameCount >= 1 / stepsPerFrame) {
        _frameCount = 0;
        stepAdvance = playForward ? 1 : -1;
    }

    if (stepAdvance === 0) return;

    // Clamp to path bounds
    let newCursor = animationCursor + stepAdvance;
    if (newCursor >= resolvedPath.length) {
        newCursor = resolvedPath.length - 1;
        pauseAnimation();
    }
    if (newCursor < 0) {
        newCursor = 0;
        pauseAnimation();
    }

    setAnimationCursor(Math.round(newCursor));
    _updateStepDisplay(animationCursor);

    // Handle single-step pause
    if (_pauseIn !== null) {
        _pauseIn -= 1;
        if (_pauseIn <= 0) pauseAnimation();
    }
}

// ---------------------------------------------------------------
// UI
// ---------------------------------------------------------------

function _updateStepDisplay(step) {
    const el = document.getElementById('path-current-step');
    if (el) el.textContent = step != null ? step : 'N/A';
}

/**
 * Wire animation controls to the existing HTML buttons.
 */
export function setupAnimationUi() {
    const play = document.getElementById('path-play-button');
    const pause = document.getElementById('path-pause-button');
    const fwd = document.getElementById('path-frame-forward-button');
    const rev = document.getElementById('path-frame-reverse-button');
    const reset = document.getElementById('path-reset-button');
    const slider = document.getElementById('path-speed-slider');
    const speedLabel = document.getElementById('path-speed-value');

    if (play) play.addEventListener('click', playAnimation);
    if (pause) pause.addEventListener('click', pauseAnimation);
    if (fwd) fwd.addEventListener('click', frameAdvance);
    if (rev) rev.addEventListener('click', frameBackward);
    if (reset) reset.addEventListener('click', resetAnimation);

    if (slider) {
        slider.addEventListener('input', () => {
            const val = Number(slider.value);
            const speed = Math.pow(2, val);
            changeAnimationSpeed(speed);
            if (speedLabel) {
                const sign = val < 0 ? '-' : '+';
                speedLabel.textContent = `${sign}${Math.pow(2, Math.abs(val))}x`;
            }
        });
    }
}
