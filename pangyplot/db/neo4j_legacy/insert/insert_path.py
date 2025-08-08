import uuid
from db.neo4j.neo4j_db import get_session

def chunk_path(path, chunk_size=99):
    chunks = []
    for i in range(0, len(path), chunk_size):
        segment_chunk = path[i:i + chunk_size]
        if not segment_chunk:
            continue
        base_id_str, base_strand = segment_chunk[0][:-1], segment_chunk[0][-1]
        base_id = int(base_id_str)
        chunk_strs = [f"{'>' if base_strand == '+' else '<'}0"]
        for seg in segment_chunk[1:]:
            seg_id, strand = seg[:-1], seg[-1]
            offset = int(seg_id) - base_id
            direction = '>' if strand == '+' else '<'
            chunk_strs.append(f"{direction}{offset}")
        chunks.append([''.join(chunk_strs), base_id])
    return chunks

def insert_path(path, batch_size=1000):
    if not path["path"]:
        return

    with get_session(collection=True) as (db, collection, session):

        chunks = chunk_path(path["path"], chunk_size=50)
        path_uuid = str(uuid.uuid4())

        chunk_data = []
        for i, (chunk_str,offset) in enumerate(chunk_path(path["path"], chunk_size=50)):
            chunk_data.append({
                "uuid": f"{path_uuid}:{str(i)}",
                "chunk": chunk_str,
                "sample": path["sample"],
                "contig": path["contig"],
                "hap": path["hap"],
                "offset": offset,
                "collection": collection,
                "db": db
            })

        # Insert nodes
        for i in range(0, len(chunk_data), batch_size):
            run_batch_insert(session, chunk_data[i:i + batch_size])

        # Prepare relationship data
        rels = [{
            "from": chunk_data[i]["uuid"],
            "to": chunk_data[i + 1]["uuid"]
        } for i in range(len(chunk_data) - 1)]

        # Insert relationships in batches
        for i in range(0, len(rels), batch_size):
            run_batch_link_insert(session, rels[i:i + batch_size])

def run_batch_insert(session, batch):
    query = """
        UNWIND $rows AS row
        CREATE (:PathChunk {
            uuid: row.uuid,
            chunk: row.chunk,
            sample: row.sample,
            contig: row.contig,
            haplotype: row.hap,
            offset: row.offset,
            collection: row.collection,
            db: row.db
        })
    """
    session.run(query, parameters={"rows": batch})

def run_batch_link_insert(session, links):
    query = """
        UNWIND $links AS link
        MATCH (a:PathChunk {uuid: link.from})
        MATCH (b:PathChunk {uuid: link.to})
        MERGE (a)-[:NEXT_CHUNK]->(b)
    """
    session.run(query, parameters={"links": links})

