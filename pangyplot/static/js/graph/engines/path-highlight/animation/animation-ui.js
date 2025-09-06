import { playAnimation, pauseAnimation, frameAdvance, frameBackward } from './animation-state.js';
import { changeAnimationSpeed } from './animation-state.js';

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

    const speedSlider = document.getElementById("path-speed-slider");
    const speedValue = document.getElementById("path-speed-value");
    speedSlider.addEventListener("input", function() {
        const speed = speedSlider.value;
        speedValue.textContent = speed;
        changeAnimationSpeed(speed);
    });

}
