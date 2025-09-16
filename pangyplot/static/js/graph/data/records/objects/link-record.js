import GraphObjectRecord from './graph-object-record.js';

export class LinkRecord extends GraphObjectRecord {
    constructor(rawLink, sourceRecord, targetRecord) {

        super();

        this.sourceRecord = sourceRecord || null;
        this.targetRecord = targetRecord || null;
        this.isIncomplete = function() {
            return this.sourceRecord === null || this.targetRecord === null;
        }

        // -----

        this.id = rawLink.id;
        this.sourceId = rawLink.source;
        this.targetId = rawLink.target;
        this.type = rawLink.type || "link";
        this.fromStrand = rawLink.from_strand;
        this.toStrand = rawLink.to_strand;
        this.haplotype = rawLink.haplotype;
        this.isDel = rawLink.is_deletion || false;
        this.bubbleId = rawLink.bubble_id || null;
        

        // chain link properties
        this.seqLength = rawLink.length;
        this.contained = rawLink.contained;
        this.gcCount = rawLink.gc_count;
        this.nCount = rawLink.n_count;


        this.isSelfDestructLink = rawLink.type == "self-destruct";
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
