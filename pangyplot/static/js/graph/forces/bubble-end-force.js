import eventBus from '../../utils/event-bus.js';
import { isNodeActive } from "../data/data-manager.js";

const bubbleEndPairs = []
var initialized = false;

export default function bubbleEndForce(strength = 0.1, distance = 50) {
    function force(alpha) {

        bubbleEndPairs.forEach(([source, target]) => {
            if (!isNodeActive(source.id) || !isNodeActive(target.id)) return;

            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const maxForce = 10; // adjust for your graph scale
            let forceMag = (dist - distance) * strength * alpha;
            forceMag = Math.max(-maxForce, Math.min(maxForce, forceMag));

            const fx = (dx / dist) * forceMag;
            const fy = (dy / dist) * forceMag;

            source.vx += fx;
            source.vy += fy;
            target.vx -= fx;
            target.vy -= fy;
        });
    }

    force.initialize = function (_) {

        if (initialized) return;
        eventBus.subscribe("graph:bubble-popped", (bubbleId) => {

            const source = null; //getSourceNodeElements(bubbleId);
            const sink = null; //getSinkNodeElements(bubbleId);
            if (source.length > 0 || sink.length > 0) {
                bubbleEndPairs.push([source[0], sink[0]]);
            }


            console.log("popped:data", bubbleEndPairs);
        });

        initialized = true;

    };

    return force;
}
