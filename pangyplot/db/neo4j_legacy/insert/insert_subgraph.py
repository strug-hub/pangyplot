from db.neo4j.neo4j_db import get_session
import uuid

def insert_subgraphs(subgraphs, subgraph_type="alt", batch_size=10000):
    with get_session(collection=True) as (db, collection, session):
        # 1. Build and batch-create all Subgraph nodes
        subgraph_rows = []
        for sg in subgraphs:
            subgraph_rows.append({
                "db": db,
                "col": collection,
                "uuid": str(uuid.uuid4()),
                "type": subgraph_type
            })

        for i in range(0, len(subgraph_rows), batch_size):
            chunk = subgraph_rows[i : i + batch_size]
            session.run("""
                UNWIND $chunk AS row
                CREATE (:Subgraph {
                    db: row.db,
                    collection: row.col,
                    uuid: row.uuid,
                    type: row.type
                })
            """, {"chunk": chunk})

        # 2. Flatten out graph‐edges and anchor‐edges separately
        graph_rels  = []
        anchor_rels = []
        for sg_row, sg in zip(subgraph_rows, subgraphs):
            subgraph_uuid = sg_row["uuid"]
            for segment_id in sg["graph"]:
                graph_rels.append({
                    "db": db,
                    "col": collection,
                    "uuid": subgraph_uuid,
                    "sid": segment_id
                })
            for segment_id in sg["anchor"]:
                anchor_rels.append({
                    "db": db,
                    "col": collection,
                    "uuid": subgraph_uuid,
                    "sid": segment_id
                })

        # 3. Batch-create SUBGRAPH relationships
        for i in range(0, len(graph_rels), batch_size):
            chunk = graph_rels[i : i + batch_size]
            session.run("""
                UNWIND $chunk AS row
                MATCH 
                  (s:Subgraph {uuid: row.uuid}),
                  (n:Segment  {db: row.db, collection: row.col, id: row.sid})
                CREATE (n)-[:SUBGRAPH]->(s)
            """, {"chunk": chunk})

        # 4. Batch-create ANCHOR relationships
        for i in range(0, len(anchor_rels), batch_size):
            chunk = anchor_rels[i : i + batch_size]
            session.run("""
                UNWIND $chunk AS row
                MATCH 
                  (s:Subgraph {uuid: row.uuid}),
                  (n:Segment  {db: row.db, collection: row.col, id: row.sid})
                CREATE (s)-[:ANCHOR]->(n)
            """, {"chunk": chunk})
