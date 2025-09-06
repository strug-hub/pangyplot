import createSliderSet from "../../../ui/utils/slider-set.js";
import defaults from "./force-defaults.js"
import { setFriction, setCollisionForce, setLinkForce, setLayoutForce, setChargeForce } from "../force-manager.js";

function sliderProperties(forceGraph) {
    return [
        {
            label: "Charge", icon:"atom", min: -1000, max: 0, step: 1, default: defaults.CHARGE_STRENGTH,
            onChange: (value) => {
                const distance = forceGraph.d3Force("charge").distanceMax();
                setChargeForce(forceGraph, value, distance);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            label: "Charge Distance", icon:"arrows-left-right-to-line", min: 0, max: 20000, step: 1, default: defaults.CHARGE_DISTANCE,
            onChange: (value) => {
                const strength = forceGraph.d3Force("charge").strength();
                setChargeForce(forceGraph, strength, value);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            label: "Node Collision", icon:"explosion", min: 0, max: 1, step: 0.05, default: defaults.COLLISION_STRENGTH,
            onChange: (value) => {
                const radius = forceGraph.d3Force("collide").radius();
                setCollisionForce(forceGraph, value, radius);
                forceGraph.d3ReheatSimulation();
            }
        },

        {
            label: "Collision Radius", icon:"ruler-horizontal", min: 0, max: 50, step: 1, default: defaults.COLLISION_RADIUS,
            onChange: (value) => {
                const strength = forceGraph.d3Force("collide").strength();
                setCollisionForce(forceGraph, strength, value);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            label: "Link Size", icon:"arrows-left-right", min: -10, max: 10, step: 1, default: 0,
            onChange: (value) => {
                const transform = Math.pow(1.3, value)*defaults.LINK_STRENGTH;
                console.log("Link Size Transform:", transform);
                setLinkForce(forceGraph, transform);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            label: "Friction", icon:"person-skating", min: 0.02, max: 1, step: 0.01, default: defaults.FRICTION,
            onChange: (value) => {
                setFriction(forceGraph, value);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            label: "Layout Impulse", icon:"circle-nodes", min: 0, max: 5, step: 1, default: defaults.LAYOUT_LEVEL,
            onChange: (value) => {
                setLayoutForce(forceGraph, value);
                forceGraph.d3ReheatSimulation();
            }
        },
    ];
}

export default function setUpForceSettings(forceGraph) {
    const settings = sliderProperties(forceGraph);
    const sliderContainer = document.getElementById("force-settings-container");
    const sliderSet = createSliderSet("force", settings);
    sliderContainer.appendChild(sliderSet);
}
