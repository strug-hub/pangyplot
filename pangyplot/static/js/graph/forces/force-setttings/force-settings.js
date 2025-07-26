export default function setUpForceSettings(forceGraph) {
    const settings = [
        {
            id: "friction-slider",
            onChange: (value) => {
                forceGraph.d3VelocityDecay(value);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            id: "alpha-slider",
            onChange: (value) => {
                forceGraph.d3AlphaDecay(value);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            id: "attraction-slider",
            onChange: (value) => {
                const distance = 1000 - value;
                forceGraph.d3Force("charge")
                    .strength(value)
                    .distanceMax(distance);
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            id: "collision-slider",
            onChange: (value) => {
                forceGraph.d3Force("collide", d3.forceCollide(value).radius(value));
                forceGraph.d3ReheatSimulation();
            }
        },
        {
            id: "pull-slider",
            onChange: (value) => {
                forceGraph.d3Force("link")
                    .distance(value)
                    .strength(0.9);
                forceGraph.d3ReheatSimulation();
            }
        }
    ];

    // Attach listeners dynamically
    settings.forEach(({ id, onChange }) => {
        const slider = document.getElementById(id);
        if (!slider) {
            console.warn(`Slider with ID "${id}" not found.`);
            return;
        }
        slider.addEventListener("input", () => {
            const newValue = parseFloat(slider.value);
            onChange(newValue);
        });
    });
}
