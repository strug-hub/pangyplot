from db.neo4j.neo4j_db import get_session
import sys, time

def all_segment_summary():
    batch_size=100000
    nodes = []
    startTime = time.time()
    rate = 0

    with get_session(collection=True) as (db, collection, session):
        skip = 0
        while True:
            query = """
                    MATCH (s:Segment)
                    WHERE s.db = $db AND s.collection = $col
                    RETURN s
                    SKIP $skip
                    LIMIT $limit
                    """
            results = session.run(query, parameters={"db": db, "col": collection}, skip=skip, limit=batch_size)
            batch = []
            for record in results:
                result = record["s"]
                node = {"id": result['id'],
                        "genome": result['genome'],
                        "chrom": result['chrom'],
                        "start": result['start'],
                        "end": result['end'],
                        "length": result['length'],
                        "ref": result['ref'],
                        "gc_count": result['gc_count']}
                batch.append(node)

            if not batch:
                break
            nodes.extend(batch)
            skip += batch_size
            
            elapsed = time.time() - startTime
            rate = len(nodes) / elapsed if elapsed > 0 else 0
            if sys.stdout.isatty():
                sys.stdout.write(f"\r      Read {len(nodes):,} segments at {rate:,.1f}/sec.")
                sys.stdout.flush()

    sys.stdout.write(f"\r      Read {len(nodes):,} segments at {rate:,.1f}/sec.")
    print()
    return nodes

def all_link_summary():
    batch_size=100000
    links = []
    startTime = time.time()
    rate = 0

    with get_session(collection=True) as (db, collection, session):
        skip = 0
        while True:
            query = """
                    MATCH (s1:Segment)-[l:LINKS_TO]->(s2:Segment)
                    WHERE s1.db = $db AND s1.collection = $col
                    RETURN l.from_strand, l.to_strand, s1.id, s2.id
                    SKIP $skip
                    LIMIT $limit
                    """
            results = session.run(query, parameters={"db": db, "col": collection}, skip=skip, limit=batch_size)
            batch = [(result['l.from_strand'], result['s1.id'], result['l.to_strand'], result['s2.id']) for result in results]
    
            if not batch:
                break 
            
            links.extend(batch)
            skip += batch_size
    
            elapsed = time.time() - startTime
            rate = len(links) / elapsed if elapsed > 0 else 0
            if sys.stdout.isatty():
                sys.stdout.write(f"\r      Read {len(links):,} segments at {rate:,.1f}/sec.")
                sys.stdout.flush()

    sys.stdout.write(f"\r      Read {len(links):,} segments at {rate:,.1f}/sec.")
    print()
    return links
