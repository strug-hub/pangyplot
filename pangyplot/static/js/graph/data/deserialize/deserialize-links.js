import { getNodeRecord } from '../records/records-manager.js';

class LinkRecord {
    constructor(rawLink, sourceRecord, targetRecord) {

        this.sourceRecord = sourceRecord;
        this.targetRecord = targetRecord;
        this.linkElement = null;
        this.active = true;
        
        // -----

        this.id = rawLink.id;
        this.sourceId = rawLink.source;
        this.targetId = rawLink.target;
        this.type = rawLink.type || "link";
        this.fromStrand = rawLink.from_strand;
        this.toStrand = rawLink.to_strand;
        this.haplotype = rawLink.haplotype;
        this.seqLength = rawLink.length;
        this.contained = rawLink.contained;
        this.isDel = rawLink.is_deletion || false;
        this.bubbleId = rawLink.bubble_id || null;

        this.isSelfDestructLink = rawLink.type == "self-destruct";
    }

    isIncomplete() {
        return !this.sourceRecord || !this.targetRecord;
    }

    get isChainLink() {
        return this.type === "chain";
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

export default function deserializeLinks(rawLinks) {
    const linkRecords = [];

    for (const rawLink of rawLinks) {
        const sourceRecord = getNodeRecord(rawLink.source);
        const targetRecord = getNodeRecord(rawLink.target);

        linkRecords.push(new LinkRecord(rawLink, sourceRecord, targetRecord));
    }

    return linkRecords;
}