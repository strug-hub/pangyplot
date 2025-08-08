from db.neo4j.neo4j_db import get_session
import db.utils.create_record as record

def get_bubble_descendants(bubble_uuid):
    node_ids = []

    with get_session() as (db, session):
        parameters = {"bubble_uuid": bubble_uuid, "db": db}

        query = """
        MATCH (root:Bubble {db: $db, uuid: $bubble_uuid})
        CALL (root){
            WITH root
            MATCH (child)-[:INSIDE*]->(root)
            WHERE child:Segment
            RETURN child
        }
        RETURN DISTINCT child
        """

        results = session.run(query, parameters)

        for result in results:
            node_ids.append(record.node_record(result["child"], "Segment")["id"])

    return node_ids

def get_chain_descendants(chain_uuid):
    node_ids = []

    with get_session() as (db, session):
        parameters = {"chain_uuid": chain_uuid, "db": db}

        query = """
        MATCH (root:Chain {db: $db, uuid: $chain_uuid})
        CALL (root) {
            WITH root
            MATCH (child)-[:INSIDE*]->(root)
            WHERE child:Segment
            RETURN child
        }
        RETURN DISTINCT child
        """

        results = session.run(query, parameters)

        for result in results:
            node_ids.append(record.node_record(result["child"], "Segment")["id"])

    return node_ids
