
def chain_record(record):
    chain = {k: record[k] for k in record.keys()}
    chain["type"] = "chain"
    # NOTE: r.id is the neo4j node id and r["id"] is the chain id
    chain["nodeid"] = record.id
    return chain

def bubble_record(record):
    bubble = {k: record[k] for k in record.keys()}
    bubble["type"] = "bubble"
    # NOTE: r.id is the neo4j node id and r["id"] is the bubble id
    bubble["nodeid"] = record.id
    return bubble

def segment_record(record):
    segment = {k: record[k] for k in record.keys()}
    segment["type"] = "segment"
    if segment["length"] == 0: 
        segment["type"] = "null" 
    # NOTE: r.id is the neo4j node id and r["id"] is the gfa id
    segment["nodeid"] = record.id
    return segment

def cluster_record(record):
    cluster = {k: record[k] for k in record.keys()}
    cluster["type"] = "cluster"
    return cluster

def node_record(record, nodeType):
    if nodeType == "Segment":
        return segment_record(record) 
    if  nodeType == "Chain":
        return chain_record(record) 
    if nodeType == "Bubble":
        return bubble_record(record)
    return None

def link_record_simple(record):
    link = {"source": record.start_node.id,
            "target": record.end_node.id,
            "class": "edge"}
    return link

def link_record(record):
    link = {"source": record.start_node.id,
            "target": record.end_node.id,
            "from_strand": record["from_strand"],
            "to_strand": record["to_strand"],
            "frequency": record["frequency"],
            "haplotype": record["haplotype"],
            "reverse": record["reverse"],
            "ref": record["ref"],
            "is_del": record["is_del"],
            "class": "edge"}
    if link["haplotype"] is None:
        link["haplotype"] = "0"
    return link

def link_record_gfa(record):
    link = {"source": record.start_node["id"],
            "target": record.end_node["id"],
            "from_strand": record["from_strand"],
            "to_strand": record["to_strand"],
            "ref": record["ref"]}
    return link

def gene_annotation_record(record):
    data = {k: record[k] for k in record.keys()}
    return data

def gene_record(record):
    gene = {k: record[k] for k in record.keys()}
    return gene
def transcript_record(record):
    transcript = {k: record[k] for k in record.keys()}
    return transcript
def exon_record(record):
    exon = {k: record[k] for k in record.keys()}
    return exon


def annotation_record(record, nodeType):
    if nodeType == "Gene":
        return gene_record(record)
    if nodeType == "Exon":
        return gene_annotation_record(record)
    if  nodeType == "Transcript":
        return transcript_record(record) 
    if nodeType == "CDS":
        return gene_annotation_record(record)
    if nodeType == "Codon":
        return gene_annotation_record(record)
    if nodeType == "UTR":
        return gene_annotation_record(record)
    return None
