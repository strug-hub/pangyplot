// Path trace animation: timer-based frame stepping through resolved objects.

import {
    frames, currentFrame, isPlaying, playForward, speed,
    setCurrentFrame, setIsPlaying, setPlayForward, setSpeed,
} from './path-trace-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

const BASE_INTERVAL_MS = 500; // ms per frame at 1x speed
let _elapsed = 0;
let _lastTime = 0;

// ---------------------------------------------------------------
// Controls
// ---------------------------------------------------------------

export function playAnimation() {
    setPlayForward(true);
    setIsPlaying(true);
    _lastTime = performance.now();
    _elapsed = 0;
    if (currentFrame < 0) setCurrentFrame(0);
    scheduleFrame();
}

export function pauseAnimation() {
    setIsPlaying(false);
}

export function frameAdvance() {
    if (frames.length === 0) return;
    const next = currentFrame < 0 ? 0 : Math.min(currentFrame + 1, frames.length - 1);
    setCurrentFrame(next);
    _updateStepDisplay();
    scheduleFrame();
}

export function frameBackward() {
    if (frames.length === 0) return;
    const prev = Math.max(currentFrame - 1, 0);
    setCurrentFrame(prev);
    _updateStepDisplay();
    scheduleFrame();
}

export function resetAnimation() {
    setIsPlaying(false);
    setCurrentFrame(-1);
    _elapsed = 0;
    _updateStepDisplay();
    scheduleFrame();
}

export function changeAnimationSpeed(speedValue) {
    setSpeed(speedValue);
}

// ---------------------------------------------------------------
// Tick (called each frame from render loop)
// ---------------------------------------------------------------

/**
 * Advance animation state. Call each frame before drawPathTrace().
 */
export function tickPathAnimation() {
    if (frames.length === 0) return;
    if (!isPlaying) return;

    scheduleFrame();

    const now = performance.now();
    const dt = now - _lastTime;
    _lastTime = now;
    _elapsed += dt;

    const interval = BASE_INTERVAL_MS / speed;

    if (_elapsed >= interval) {
        _elapsed -= interval;

        const delta = playForward ? 1 : -1;
        let next = currentFrame + delta;

        if (next >= frames.length) {
            next = frames.length - 1;
            pauseAnimation();
        }
        if (next < 0) {
            next = 0;
            pauseAnimation();
        }

        setCurrentFrame(next);
        _updateStepDisplay();
    }
}

// ---------------------------------------------------------------
// UI
// ---------------------------------------------------------------

function _updateStepDisplay() {
    const stepEl = document.getElementById('path-current-step');
    const objEl = document.getElementById('path-current-object');

    if (currentFrame < 0 || frames.length === 0) {
        if (stepEl) stepEl.textContent = 'N/A';
        if (objEl) objEl.textContent = '—';
        return;
    }

    if (stepEl) stepEl.textContent = `${currentFrame + 1} / ${frames.length}`;

    if (objEl) {
        const frame = frames[currentFrame];
        if (frame.type === 'chain') {
            objEl.textContent = frame.chainId;
        } else if (frame.type === 'junction') {
            objEl.textContent = frame.object?.id || '—';
        } else {
            objEl.textContent = '—';
        }
    }
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
            const newSpeed = Math.pow(2, val);
            changeAnimationSpeed(newSpeed);
            if (speedLabel) {
                speedLabel.textContent = `${newSpeed}x`;
            }
        });
    }
}
