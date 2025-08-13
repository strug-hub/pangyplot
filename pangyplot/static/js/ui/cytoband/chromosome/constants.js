export function chromosomeCytobandDimensions() {
    const constants = {
        widthPad: 15,
        chrWidth: 800,
        chrHeight: 40,
        radius: 5,
        annotationHeight: 30,
        heightBuffer: 30
    }
    constants.width = constants.chrWidth + constants.widthPad * 2,
    constants.height = constants.chrHeight + constants.annotationHeight * 2 + constants.heightBuffer * 2

  return constants;
}