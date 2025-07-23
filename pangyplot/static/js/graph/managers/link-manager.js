const LINK_LENGTH = 10
const LINK_WIDTH = 10

function decodeHaplotypeMask(hexString) {
    if (!hexString) return [0];
    
    const mask = BigInt("0x" + hexString.replace(/^0x/, ""));
    const bools = [];
    let i = 0n;
    while ((mask >> i) > 0) {
        bools.push((mask >> i) & 1n ? true : false);
        i += 1n;
    }
    return bools;
}

function processLinks(rawLinks) {
    rawLinks = filterBadLinks(rawLinks);

    let links = rawLinks.map(rawLink => ({
        source: rawLink["from_strand"] === "+" ? nodeSourceId(rawLink["source"]) : nodeTargetId(rawLink["source"]),
        target: rawLink["to_strand"] === "+" ? nodeTargetId(rawLink["target"]) : nodeSourceId(rawLink["target"]),
        fromStrand: rawLink["from_strand"],
        toStrand: rawLink["to_strand"],
        sourceid: String(rawLink["source"]),
        targetid: String(rawLink["target"]),
        haplotype: decodeHaplotypeMask(rawLink["haplotype"]),
        isRef: rawLink.ref,
        isDel: rawLink.is_del,
        isVisible: true,
        isDrawn: true,
        class: "edge",
        length: rawLink.is_del ? LINK_LENGTH*2 : LINK_LENGTH,
        width: LINK_WIDTH,
        annotations: []
    }));

    return links

}
