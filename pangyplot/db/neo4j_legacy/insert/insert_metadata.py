from db.neo4j.neo4j_db import get_session

def insert_samples(samples):
    if len(samples) == 0: return
    with get_session() as (db, session):
        query = """
            UNWIND $samples AS sample
            CREATE (:Sample {
                db: $db,
                id: sample.id,
                uuid: $db + ":" + sample.id,
                index: sample.idx
            })
        """
        session.run(query, parameters={"samples": samples, "db": db})

def insert_collection(collection_id, filename, genome):
    with get_session() as (db, session):
        query = """
            CREATE (:Collection {
                db: $db,
                id: $id,
                uuid: $db + ":" + $id,
                genome: $genome,
                file: $file,
                datetime: datetime()
            })
        """
        session.run(query, parameters={"db": db, "id": collection_id, "genome": genome, "file": filename})

def insert_new_collection(filename, genome, collection_id=None):

    with get_session() as (db, session):
        if collection_id is None:

            query_max_id = """
                MATCH (c:Collection {db: $db})
                RETURN max(toInteger(c.id)) AS max_id
            """
            result = session.run(query_max_id, parameters={"db": db})
            record = result.single()
            max_id = record["max_id"] if record["max_id"] is not None else 0

            collection_id = max_id + 1
        else:
            collection_id = int(collection_id)
            # Check if ID already exists
            query_exists = """
                MATCH (c:Collection {db: $db, id: $id})
                RETURN c LIMIT 1
            """
            result = session.run(query_exists, parameters={"db": db, "id": str(collection_id)})
            if result.single() is not None:
                return None

    insert_collection(collection_id, filename, genome)
    return collection_id