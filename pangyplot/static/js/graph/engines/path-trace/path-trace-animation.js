// Path trace animation: distance-based cursor along waypoint list.

import {
    waypoints, cursorDist, isPlaying, playForward, speed,
    activeHighlights, chainProgress,
    setCursorDist, setIsPlaying, setPlayForward, setSpeed,
    clearActiveHighlights, addHighlight, setChainProgress,
} from './path-trace-state.js';
import { scheduleFrame } from '../../utils/frame-scheduler.js';

// ---------------------------------------------------------------
// Controls
// ---------------------------------------------------------------

export function playAnimation() {
    setPlayForward(true);
    setIsPlaying(true);
    scheduleFrame();
}

export function pauseAnimation() {
    setIsPlaying(false);
}

export function frameAdvance() {
    if (waypoints.length === 0) return;
    const totalDist = waypoints[waypoints.length - 1].dist;
    const step = Math.max(1, totalDist / waypoints.length);
    const newDist = Math.min(cursorDist < 0 ? step : cursorDist + step, totalDist);
    setCursorDist(newDist);
    _applyWaypointActions(newDist);
    _updateStepDisplay();
    scheduleFrame();
}

export function frameBackward() {
    if (waypoints.length === 0) return;
    const totalDist = waypoints[waypoints.length - 1].dist;
    const step = Math.max(1, totalDist / waypoints.length);
    const newDist = Math.max(cursorDist - step, 0);
    setCursorDist(newDist);
    // Rebuild highlights up to this distance
    _rebuildHighlightsUpTo(newDist);
    _updateStepDisplay();
    scheduleFrame();
}

export function resetAnimation() {
    setIsPlaying(false);
    setCursorDist(-1);
    clearActiveHighlights();
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
    if (waypoints.length === 0) return;
    if (!isPlaying) return;

    scheduleFrame();

    const totalDist = waypoints[waypoints.length - 1].dist;
    const delta = playForward ? speed : -speed;
    let newDist = cursorDist < 0 ? 0 : cursorDist + delta;

    if (newDist >= totalDist) {
        newDist = totalDist;
        pauseAnimation();
    }
    if (newDist <= 0) {
        newDist = 0;
        pauseAnimation();
    }

    setCursorDist(newDist);
    _applyWaypointActions(newDist);
    _updateStepDisplay();
}

// ---------------------------------------------------------------
// Waypoint action processing
// ---------------------------------------------------------------

/**
 * Apply waypoint actions up to the given distance.
 * Adds highlights and updates chain progress incrementally.
 */
function _applyWaypointActions(dist) {
    for (const wp of waypoints) {
        if (wp.dist > dist) break;

        if (wp.action === 'junction' && wp.object) {
            addHighlight(wp.object);
        }
        if (wp.action === 'bubble' && wp.bubble) {
            addHighlight(wp.bubble);
        }
        // Track chain progress for progressive overlay rendering
        if (wp.chainId && wp.t != null) {
            setChainProgress(wp.chainId, wp.t);
        }
    }
}

/**
 * Rebuild all highlights from scratch up to a given distance.
 * Used when going backwards (can't incrementally remove).
 */
function _rebuildHighlightsUpTo(dist) {
    clearActiveHighlights();
    _applyWaypointActions(dist);
}

// ---------------------------------------------------------------
// Cursor position interpolation
// ---------------------------------------------------------------

/**
 * Get the interpolated cursor position at the current distance.
 * @returns {{ x: number, y: number } | null}
 */
export function getCursorPosition() {
    if (cursorDist < 0 || waypoints.length === 0) return null;

    // Binary search for the waypoint just before cursorDist
    let lo = 0, hi = waypoints.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (waypoints[mid].dist <= cursorDist) lo = mid;
        else hi = mid - 1;
    }

    const wp = waypoints[lo];
    const next = waypoints[lo + 1];

    if (!next || wp.dist === next.dist) return wp.pos;

    // Lerp between wp and next
    const frac = (cursorDist - wp.dist) / (next.dist - wp.dist);
    return {
        x: wp.pos.x + frac * (next.pos.x - wp.pos.x),
        y: wp.pos.y + frac * (next.pos.y - wp.pos.y),
    };
}

// ---------------------------------------------------------------
// UI
// ---------------------------------------------------------------

function _updateStepDisplay() {
    const el = document.getElementById('path-current-step');
    if (!el) return;

    if (cursorDist < 0 || waypoints.length === 0) {
        el.textContent = 'N/A';
        return;
    }

    const totalDist = waypoints[waypoints.length - 1].dist;
    const pct = totalDist > 0 ? Math.round(100 * cursorDist / totalDist) : 0;
    el.textContent = `${pct}%`;
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
                const sign = val < 0 ? '-' : '+';
                speedLabel.textContent = `${sign}${Math.pow(2, Math.abs(val))}x`;
            }
        });
    }
}
