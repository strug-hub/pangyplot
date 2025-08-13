import eventBus from "../utils/event-bus.js";

document.getElementById('navbar-button-example').addEventListener('click', function() {

    const data = {
        genome: "GRCh38",
        chromosome: "chr18",
        start: 47506000,
        end: 47600000,
        source:"navbar-example"
    };
    eventBus.publish("ui:coordinates-changed", data);
});

document.getElementById('navbar-button-example2').addEventListener('click', function() {

    //SERPINB5
    const data = {
        genome: "GRCh38",
        chromosome: "chr18",
        start: 63476958-10000,
        end: 63505085+10000,
        source:"navbar-example"
    };

    //const data = {
    //    genome: "CHM13",
    //    chrom: "chrM",
    //    start: 1000,
    //    end: 10000,
    //    source:"navbar-example"
    //};

    eventBus.publish("ui:coordinates-changed", data);

});

document.getElementById('navbar-button-example3').addEventListener('click', function() {

    //const data = {
    //    genome: "CHM13",
    //    chromosome: "XXX",
    //    start: -1000,
    //    end: 999999999999,
    //    source:"navbar-example"
    //};
    
    //SMAD4
    const data = {
        genome: "GRCh38",
        chromosome: "chr18",
        start: 51028528-10000,
        end: 51085045+10000,
        source:"navbar-example"
    };
    
    eventBus.publish("ui:coordinates-changed", data);

});