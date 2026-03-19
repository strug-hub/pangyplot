import eventBus from '@event-bus';

document.getElementById('navbar-button-example').addEventListener('click', function() {

    //PRSS1-PRSS2
    const data = {
        genome: "GRCh38",
        chromosome: "chr7",
        start: 142746827,
        end: 142776017,
        source:"navbar-example"
    };
    eventBus.publish("ui:coordinates-changed", data);
});

document.getElementById('navbar-button-example2').addEventListener('click', function() {

    //EXOC3
    const data = {
        genome: "GRCh38",
        chromosome: "chr5",
        start: 433522,
        end: 491937,
        source:"navbar-example"
    };

    eventBus.publish("ui:coordinates-changed", data);

});

document.getElementById('navbar-button-example3').addEventListener('click', function() {

    //DAZ1
    const data = {
        genome: "GRCh38",
        chromosome: "chrY",
        start: 23128355,
        end: 23200010,
        source:"navbar-example"
    };

    eventBus.publish("ui:coordinates-changed", data);

});