export function genomeCytobandDimensions(nChromosomes) {
    const constants = {
        chrHeight: 180,
        chrWidth: 10,
        borderPad: 8,
        widthPad: 4,
        topPad: 4,
        bottomPad: 30,
        annotationHeight: 20,
        radius: 5
    };

    constants.chrFullHeight = constants.chrHeight + constants.borderPad * 2;
    constants.chrFullWidth = constants.chrWidth + constants.borderPad*2;
    constants.width = (constants.chrWidth + constants.borderPad * 2 + constants.widthPad) * nChromosomes + constants.widthPad * 2;
    constants.height = constants.topPad + constants.chrFullHeight + constants.annotationHeight * 2 + constants.bottomPad;

    return constants;
}

export const organismToEmoji = {
    //human: "🧍",
    dog: "🐕",
    mouse: "🐁",
    fruitfly: "🪰",
    zebrafish: "🐠",
    chicken: "🐓",
    rabbit: "🐇"
};