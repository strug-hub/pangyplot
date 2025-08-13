function clearHighlightGenomeCytoband(){
    let rectangles = document.getElementsByClassName("cytoband-genome-chromosome");
    for (let i = 0; i < rectangles.length; i++) {
        rectangles[i].classList.remove("cytoband-genome-highlighted");
    }

    let annotations = document.getElementsByClassName("cytoband-genome-annotation")[0].firstElementChild.childNodes;
    for (let i = 0; i < annotations.length; i++) {
        let content = annotations[i].childNodes[2].childNodes[0];
        let bg = content.childNodes[0];

        bg.classList.remove("cytoband-genome-highlighted");
    }
}

export function highlightGenomeCytoband(chromName) {
    clearHighlightGenomeCytoband();

    let rectangles = document.getElementsByClassName("cytoband-genome-chromosome");
    let annotations = document.getElementsByClassName("cytoband-genome-annotation")[0].firstElementChild.childNodes;
    for (let i = 0; i < annotations.length; i++) {
        let content = annotations[i].childNodes[2].childNodes[0];
        let bg = content.childNodes[0];
        let label = content.childNodes[1].childNodes[0];

        if (label.textContent === chromName) {
            bg.classList.add("cytoband-genome-highlighted");
            rectangles[i].classList.add("cytoband-genome-highlighted");
        }
    }
}