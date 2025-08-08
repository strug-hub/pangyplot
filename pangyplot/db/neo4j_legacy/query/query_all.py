from db.neo4j.neo4j_db import get_session

def query_all_chromosomes():
    with get_session() as (db, session):
        query = "MATCH (s:Segment) WHERE s.db = $db RETURN DISTINCT s.chrom"
        result = session.run(query, parameters={"db": db})
        chromosomes = [record["s.chrom"] for record in result if record["s.chrom"] is not None]

    return chromosomes

def query_all_db():
    with get_session() as (_, session):
        query = "MATCH (s:Segment) WHERE s.db IS NOT NULL RETURN DISTINCT s.db AS db"
        result = session.run(query)
        dbs = [record["db"] for record in result]
    return dbs

def query_all_genome(all_dbs=False, top_result=False):
    with get_session() as (db, session):

        query = f"""
        MATCH (c:Collection)
        {"" if all_dbs else "WHERE c.db = $db"}
        RETURN c.genome AS genome, COUNT(*) AS count
        ORDER BY count DESC
        """
        results = session.run(query, parameters={"db": db})
        genomes = [record["genome"] for record in results if record["genome"] is not None]
        if top_result: 
            return None if len(genomes) < 1 else genomes[0]
        
        return genomes