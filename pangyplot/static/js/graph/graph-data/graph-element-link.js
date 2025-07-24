class GraphElementLink {
    constructor(rawLink, sourceElement, targetElement) {
        this.id = rawLink.id;
        this.type = "link";
        this.source = sourceElement;
        this.target = targetElement;
        this.fromStrand = rawLink.to_strand;
        this.toStrand = rawLink.from_strand;
        this.haplotype = rawLink.haplotype;

        //TODO
        this.isDel = false;
    }

    get isChainLink() {
        return this.source.id.startsWith("b") && this.target.id.startsWith("b");
    }

    decodeHaplotypeMask() {
        if (!this.haplotype) return [0];

        const mask = BigInt("0x" + this.haplotype.replace(/^0x/, ""));
        const bools = [];
        let i = 0n;
        while ((mask >> i) > 0) {
            bools.push((mask >> i) & 1n ? true : false);
            i += 1n;
        }
        return bools;
    }

}

export default function deserializeLinks(rawLinks, nodeElementDict) {

    const elements = [];
    for (const rawLink of rawLinks) {
        const sourceElement = nodeElementDict[rawLink.source];
        const targetElement = nodeElementDict[rawLink.target];
        elements.push(new GraphElementLink(rawLink, sourceElement, targetElement));
    }
    return elements;
}