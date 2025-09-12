import { playAnimation, pauseAnimation, frameAdvance, frameBackward, } from './animation-state.js';
import { changeAnimationSpeed, resetAnimation} from './animation-state.js';

export default function setupAnimationUi(){

    document.getElementById("path-play-button").addEventListener("click", function () {
        playAnimation();
        //todo "hold down"
    });
    document.getElementById("path-pause-button").addEventListener("click", function () {
        pauseAnimation();
    });
    document.getElementById("path-frame-forward-button").addEventListener("click", function () {
        frameAdvance();
    });
    document.getElementById("path-frame-reverse-button").addEventListener("click", function () {
        frameBackward();
    });
    document.getElementById("path-reset-button").addEventListener("click", function () {
        resetAnimation();
    });
    const speedSlider = document.getElementById("path-speed-slider");
    const speedValue = document.getElementById("path-speed-value");

    speedSlider.addEventListener("input", function() {
        const unscaledSpeed = Number(speedSlider.value);
        // Equation: speed = 2 ^ unscaledSpeed
        const speed = Math.pow(2, unscaledSpeed);
        const num = Math.pow(2, Math.abs(unscaledSpeed));
        const sign = unscaledSpeed < 0 ? "-" : "+";
        speedValue.textContent = `${sign}${num}x`;
        changeAnimationSpeed(speed);
    });

}
