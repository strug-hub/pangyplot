from db.neo4j.neo4j_db import get_session
from collections import defaultdict
import sys

import db.modify.preprocess_modifications as modify

def insert_aggregate_nodes(aggregates, type, batch_size):
    total = len(aggregates)
    
    with get_session(collection=True) as (db, collection, session):

        prefix = "b" if type.lower() == "bubble" else "c"
        
        for i in range(0, total, batch_size):
            batch = aggregates[i:i + batch_size]
            if sys.stdout.isatty():
                sys.stdout.write(f"\r      Inserting {type}s: {min(i + batch_size, total)}/{total}.")

            query = f"""
                UNWIND $aggregates AS agg
                CREATE (:{type} {{
                    uuid: $db + ':' + $col + ':' + '{prefix}' + toString(agg.id),
                    db: $db,
                    collection: $col,
                    id: toString(agg.id),
                    subtype: agg.subtype,
                    nesting_level: agg.nesting_level,
                    depth: agg.depth,
                    start: agg.start,
                    end: agg.end,
                    chrom: agg.chrom,
                    genome: agg.genome,
                    length: agg.length,
                    largest_child: agg.largest_child,
                    children: agg.children,
                    gc_count: agg.gc_count,
                    ref: agg.ref
                }})
            """
            session.run(query, {"aggregates": batch, "col": collection, "db": db})

        print(f"\r      Inserting {type}s: {total}/{total}.")

def insert_aggregate_links(bubbles, chains, batch_size):
    linkmap = defaultdict(list)

    with get_session(collection=True) as (db, collection, session):

        print(f"\r      Inserting Bubble & Chain links...")

        def insert_link(links, label_a, label_b, rel):
            query = f"""
                UNWIND $links AS link
                MATCH (a:{label_a} {{db: $db, collection: $col, id: toString(link.id_a)}}),
                    (b:{label_b} {{db: $db, collection: $col, id: toString(link.id_b)}})
                CREATE (a)-[:{rel}]->(b)
            """
            session.run(query, {"links": links, "col": collection,  "db": db})

        for bubble in bubbles:
            bid = bubble["id"]
            start_id, end_id = bubble["ends"]

            linkmap["Segment.END.Bubble"].append({"id_a": start_id, "id_b": bid})
            linkmap["Bubble.END.Segment"].append({"id_a": bid, "id_b": end_id})

            if bubble["sb"]:
                linkmap["Bubble.INSIDE.Bubble"].append({"id_a": bid, "id_b": bubble["sb"]})
            for sid in bubble["inside"]:
                linkmap["Segment.INSIDE.Bubble"].append({"id_a": sid, "id_b": bid})

        for chain in chains:
            cid = chain["id"]
            start_id, end_id = chain["ends"]

            linkmap["Segment.CHAIN_END.Chain"].append({"id_a": start_id, "id_b": cid})
            linkmap["Chain.CHAIN_END.Segment"].append({"id_a": cid, "id_b": end_id})

            if chain["sb"]:
                linkmap["Chain.PARENT_SB.Bubble"].append({"id_a": cid, "id_b": chain["sb"]})
            for bid_inside in chain["inside"]:
                linkmap["Bubble.CHAINED.Chain"].append({"id_a": bid_inside, "id_b": cid})

        for key, batch in linkmap.items():
            if not batch: continue
            label_a, rel, label_b = key.split('.')
            for i in range(0, len(batch), batch_size):
                insert_link(batch[i:i + batch_size], label_a, label_b, rel)

def get_ids_at_depth(atype, session, params):
    id_query = """
        MATCH (a:"""+atype+""")
        WHERE a.db = $db AND a.collection = $col AND a.depth = $depth
        RETURN a.id AS id
    """
    return [r["id"] for r in session.run(id_query, params)]


def add_child_information(max_depth, batch_size=50000):
    with get_session(collection=True) as (db, collection, session):
        
        queries = [
            "WITH a, MIN(n.start) AS start SET a.start = start",
            "WITH a, MAX(n.end) AS end SET a.end = end",
            "WITH a, SUM(n.length) AS length SET a.length = length",
            "WITH a, MAX(n.length) AS largest SET a.largest_child = largest",
            "WITH a, COUNT(*) AS children SET a.children = children",
            "WITH a, head(collect(n.genome)) AS genome SET a.genome = genome",
            "WITH a, head(collect(n.chrom)) AS chrom SET a.chrom = chrom",
            "WITH a, SUM(CASE WHEN n.ref THEN 1 ELSE 0 END) > 0 AS has_ref SET a.ref = has_ref",
            "WITH a, SUM(n.gc_count) AS count SET a.gc_count = count",
        ]

        match_bubble = f"UNWIND $batch AS aid MATCH (n)-[:INSIDE]->(a:Bubble) WHERE a.db = $db AND a.collection = $col AND a.id = aid"
        match_chain = f"UNWIND $batch AS aid MATCH (n)-[:CHAINED]->(a:Chain) WHERE a.db = $db AND a.collection = $col AND a.id = aid"

        print("   👶 Adding child information to aggregate nodes...")

        for d in range(max_depth + 1):
            params = {"db": db, "col": collection, "depth": d}
            bubble_ids = get_ids_at_depth("Bubble", session, params)
            for i in range(0, len(bubble_ids), batch_size):
                params["batch"] = bubble_ids[i:i + batch_size]
                for query in queries:
                    session.run(f"{match_bubble} {query}", params)

            chain_ids = get_ids_at_depth("Chain", session, params)
            for i in range(0, len(chain_ids), batch_size):
                params["batch"] = chain_ids[i:i + batch_size]
                for query in queries:
                    session.run(f"{match_chain} {query}", params)


def add_position_information(max_depth, batch_size=50000):
    with get_session(collection=True) as (db, collection, session):

        match_bubble = "UNWIND $batch AS aid MATCH (n)-[:INSIDE]->(a:Bubble)"
        match_chain = "UNWIND $batch AS aid MATCH (n)-[:CHAINED]->(a:Chain)"

        query = """
                WHERE a.db = $db AND a.collection = $col AND a.id = aid

                WITH a,
                    avg(n.x1) AS avgX1,
                    avg(n.x2) AS avgX2,
                    min(n.x1) AS minX1,
                    max(n.x1) AS maxX1,
                    min(n.x2) AS minX2,
                    max(n.x2) AS maxX2,
                    avg(n.y1) AS avgY1,
                    avg(n.y2) AS avgY2,
                    min(n.y1) AS minY1,
                    max(n.y1) AS maxY1,
                    min(n.y2) AS minY2,
                    max(n.y2) AS maxY2

                SET a.x1 = CASE WHEN avgX1 < avgX2 THEN minX1 ELSE maxX1 END,
                    a.x2 = CASE WHEN avgX1 < avgX2 THEN maxX2 ELSE minX2 END,
                    a.y1 = CASE WHEN avgY1 < avgY2 THEN minY1 ELSE maxY1 END,
                    a.y2 = CASE WHEN avgY1 < avgY2 THEN maxY2 ELSE minY2 END                
                """
        
        print("   📍Adding position information to aggregate nodes...")

        for d in range(max_depth + 1):
            params = {"db": db, "col": collection, "depth": d}

            bubble_ids = get_ids_at_depth("Bubble", session, params)
            for i in range(0, len(bubble_ids), batch_size):
                params["batch"] = bubble_ids[i:i + batch_size]
                session.run(f"{match_bubble} {query}", params)

            chain_ids = get_ids_at_depth("Chain", session, params)
            for i in range(0, len(chain_ids), batch_size):
                params["batch"] = chain_ids[i:i + batch_size]
                session.run(f"{match_chain} {query}", params)

def add_haplotype_information(max_depth, batch_size=50000):
    with get_session(collection=True) as (db, collection, session):

        hap_query_bubble_links_to = """
            UNWIND $batch AS id
            MATCH (s:Segment)-[l:LINKS_TO]-(s2), 
                  (s)-[:INSIDE]->(a:Bubble)
            WHERE a.db = $db AND a.collection = $col AND a.id = id
              AND l.haplotype IS NOT NULL
            RETURN a.id AS aid, l.haplotype AS hap
        """

        hap_query_bubble_end = """
            UNWIND $batch AS id
            MATCH (n)-[e:END]-(b:Bubble)-[:INSIDE]->(a:Bubble)
            WHERE a.db = $db AND a.collection = $col AND a.id = id
              AND e.haplotype IS NOT NULL
            RETURN a.id AS aid, e.haplotype AS hap
        """

        hap_write_bubble = """
            UNWIND $batch AS item
            MATCH (a:Bubble)
            WHERE a.db = $db AND a.collection = $col AND a.id = item.id
            MATCH (s:Segment)-[e:END]-(a)
            SET e.haplotype = item.hap
        """

        hap_query_chain = """
            UNWIND $batch AS id
            MATCH (n)-[e:END]-(b:Bubble)-[:CHAINED]->(a:Chain)
            WHERE a.db = $db AND a.collection = $col AND a.id = id
              AND e.haplotype IS NOT NULL
            RETURN a.id AS aid, e.haplotype AS hap
        """

        hap_write_chain = """
            UNWIND $batch AS item
            MATCH (a:Chain)
            WHERE a.db = $db AND a.collection = $col AND a.id = item.id
            MATCH (s:Segment)-[e:CHAIN_END]-(a)
            SET e.haplotype = item.hap
        """

        def calculate_haplotypes(results):
            hap_map = defaultdict(int)
            for result in results:
                for record in result:
                    aid = record["aid"]
                    hap_hex = record["hap"]
                    hap_map[aid] |= int(hap_hex, 16)

                haps = []
                for aid in hap_map:
                    hmap = {"id": aid, "hap": hex(hap_map[aid])[2:]}
                    haps.append(hmap)
            return haps

        print("   🪢Adding haplotype information to aggregate nodes...")

        for d in range(max_depth + 1):
            params = {"db": db, "col": collection, "depth": d}

            bubble_ids = get_ids_at_depth("Bubble", session, params)
            for i in range(0, len(bubble_ids), batch_size):
                params["batch"] = bubble_ids[i:i + batch_size]

                result1 = session.run(hap_query_bubble_links_to, params)
                result2 = session.run(hap_query_bubble_end, params)
                params["batch"] = calculate_haplotypes([result1, result2])
                session.run(hap_write_bubble, params)

            chain_ids = get_ids_at_depth("Chain", session, params)
            for i in range(0, len(chain_ids), batch_size):
                params["batch"] = chain_ids[i:i + batch_size]
                result1 = session.run(hap_query_chain, params)
                params["batch"] = calculate_haplotypes([result1])
                session.run(hap_write_chain, params)

def insert_bubbles_and_chains(bubbles, chains, batch_size=10000):
    
    if len(bubbles) == 0: return
    insert_aggregate_nodes(bubbles, "Bubble", batch_size)
    insert_aggregate_nodes(chains, "Chain", batch_size)
    insert_aggregate_links(bubbles, chains, batch_size)
    
    modify.adjust_compacted_nodes()

    max_depth = max([x["depth"] for x in chains + bubbles])

    print("      Calculating aggregate properties...")

    #add_child_information(max_depth)
    add_position_information(max_depth)
    add_haplotype_information(max_depth)
