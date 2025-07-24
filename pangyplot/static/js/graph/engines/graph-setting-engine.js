function graphSettingEngineSetup(forceGraph){

    function throttleDebounceSlider(func, throttleInterval) {
        let lastFunc;
        let lastRan;
        return function() {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= throttleInterval) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, throttleInterval - (Date.now() - lastRan));
            }
        };
    }
    
    //document.getElementById('collapse-slider').addEventListener('input', throttleDebounceSlider(function() {
    //    const newValue = parseFloat(this.value);
    //    console.log("collapse", newValue);
    //    forceGraph = simplifyGraph(forceGraph, newValue);        
    //}, 1000)); 
    

    document.getElementById('friction-slider').addEventListener('input', function() {
        const newValue = parseFloat(this.value); 
        forceGraph.d3VelocityDecay(newValue);
        forceGraph.d3ReheatSimulation()
    });

    document.getElementById('alpha-slider').addEventListener('input', function() {
        const newValue = parseFloat(this.value); 
        forceGraph.d3AlphaDecay(newValue);
        forceGraph.d3ReheatSimulation()
    });



    document.getElementById('attraction-slider').addEventListener('input', function() {
                
        const newValue = parseFloat(this.value);
        
        const dist = 1000 - newValue

        forceGraph.d3Force('charge').strength(newValue).distanceMax(dist);
        forceGraph.d3ReheatSimulation()

    });

    document.getElementById('collision-slider').addEventListener('input', function() {
                
        const newValue = parseFloat(this.value);
        forceGraph.d3Force('collide', d3.forceCollide(newValue).radius(newValue));
        forceGraph.d3ReheatSimulation()

    });


    document.getElementById('pull-slider').addEventListener('input', function() {
                
        const newValue = parseFloat(this.value);
        forceGraph.d3Force('link').distance(newValue).strength(0.9)
        forceGraph.d3ReheatSimulation()

    });
}