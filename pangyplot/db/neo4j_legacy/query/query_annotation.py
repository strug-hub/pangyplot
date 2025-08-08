from operator import ge
from db.neo4j.neo4j_db import get_session, GENE_TEXT_INDEX
import db.utils.create_record as record

def query_gene_range(genome, chrom, start, end):
    with get_session() as (_, session):
        geneData = dict()

        query = """
                MATCH (g:Gene)<-[:INSIDE]-(t:Transcript)<-[:INSIDE]-(e:Exon)
                WHERE g.genome = $genome AND g.chrom = $chrom AND g.start <= $end AND g.end >= $start
                RETURN g, t, e
                """
        results = session.run(query, {"genome": genome, "chrom": chrom, "start": start, "end": end})

        current_gene_id = None
        gene_info = []
        for result in results:

            gene = record.gene_record(result["g"])
            transcript = record.transcript_record(result["t"])
            exon = record.exon_record(result["e"])

            gene_id = gene["id"]
            transcript_id = transcript["id"]

            if gene_id not in geneData:
                gene["transcripts"] = dict()
                geneData[gene_id] = gene
            if transcript_id not in geneData[gene_id]["transcripts"]:
                transcript["exons"] = []
                geneData[gene_id]["transcripts"][transcript_id] = transcript

            geneData[gene_id]["transcripts"][transcript_id]["exons"].append(exon)
        
        for gene_id in geneData:
            geneData[gene_id]["transcripts"] = list(geneData[gene_id]["transcripts"].values())
            geneData[gene_id]["transcripts"].sort(key=lambda x: (not x.get('mane_select', False),
                                                                 not x.get('ensembl_canonical', False)))
    return list(geneData.values())

def text_search_gene_query(session, searchTerm, before, after, maxResults=20):
    genes = []

    queryTerm = ("*" if before else "") + searchTerm +  ("*" if after else "")
    query = f"""
        CALL db.index.fulltext.queryNodes("{GENE_TEXT_INDEX}", "{queryTerm}")
        YIELD node, score
        RETURN node, score LIMIT {maxResults}
        """

    results = session.run(query)

    for result in results:
        gene = record.gene_record(result["node"])
        genes.append(gene)
    return genes

def text_search_gene(searchTerm, maxResults=20):
    with get_session() as (_, session):

        genes1 = text_search_gene_query(session, searchTerm, False, True, maxResults)
        
        if len(genes1) >= maxResults:
            return genes1

        genes2 = text_search_gene_query(session, searchTerm, True, True, maxResults)

    genes, geneSet = [], set()
    for gene in genes1+genes2:
        if gene["id"] not in geneSet:
            geneSet.add(gene["id"]) 
            genes.append(gene)

    return genes

