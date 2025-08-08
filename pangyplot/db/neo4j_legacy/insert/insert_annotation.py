from db.neo4j.neo4j_db import get_session

GENE="Gene"
EXON="Exon"
TRANSCRIPT="Transcript"


def add_annotations_by_type(session, annotations, type, batchSize):
    if len(annotations) == 0: return
    for i in range(0, len(annotations), batchSize):
        batch = annotations[i:i + batchSize]
        query = f"""
                UNWIND $batch AS ann
                MERGE (a:{type} {{id: ann.id}})
                SET a += ann
                """
        session.run(query, {"batch": batch})

def add_annotation_links(session, annotations, type, parentType, batchSize):
    if len(annotations) == 0: return
    for i in range(0, len(annotations), batchSize):
        batch = annotations[i:i + batchSize]
        query = """
                UNWIND $batch AS ann
                MATCH (child:{type} {{id: ann.id, genome: ann.genome}})
                MATCH (parent:{parentType} {{id: ann.parent, genome: ann.genome}})
                MERGE (child)-[:INSIDE]->(parent)
                """.format(type=type, parentType=parentType)
        session.run(query, {"batch": batch})

    
def add_annotations(refGenome, annotationDict, batchSize=10000):

    with get_session() as (db, session):

        add_annotations_by_type(session, annotationDict[GENE], GENE, batchSize)
        print(f"   🧬 Genes: {len(annotationDict[GENE])}")
        #del annotationDict[GENE]

        add_annotations_by_type(session, annotationDict[TRANSCRIPT], TRANSCRIPT, batchSize)
        print(f"   📜 Transcripts: {len(annotationDict[GENE])}")
        add_annotation_links(session, annotationDict[TRANSCRIPT], TRANSCRIPT, GENE, batchSize)

        add_annotations_by_type(session, annotationDict[EXON], EXON, batchSize)
        print(f"   🧩 Exons: {len(annotationDict[GENE])}")
        add_annotation_links(session, annotationDict[EXON], EXON, TRANSCRIPT, batchSize)

