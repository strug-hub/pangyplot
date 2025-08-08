from db.neo4j.neo4j_db import get_session
import db.utils.create_record as record
import db.utils.integrity_check as integrity

#def get_node_type(nodeid):
#    with get_session() as (db, session):
#        node_type_query = """
#        MATCH (n) WHERE n.db = $db AND ID(n) = $i
#        RETURN labels(n) AS labels
#        """
#        result = session.run(node_type_query, {"db": db, "i": nodeid,})
#        labels = result.single()["labels"]
#        if not labels:
#            return None
#        return labels[0]
    
def get_node_type(uuid):
    parts = uuid.split(":")
    if parts[-1][0] == "c":
        return "Chain"
    elif parts[-1][0] == "b":
        return "Bubble"
    
    return "Segment"


def get_segments_in_range(genome, chrom, start, end):
    nodes,links = [],[]

    with get_session() as (db, session):

        parameters = {"start": int(start), "end": int(end), "db": db, "genome": genome, "chrom": chrom}

        segment_query = """
                // 1. Match all segments in range
                MATCH (n:Segment)
                WHERE n.db = $db AND n.genome = $genome AND n.chrom = $chrom 
                    AND n.start <= $end AND n.end >= $start

                // 2. Collect any segments anchored to them (optionally)
                OPTIONAL MATCH (n)<-[:ANCHOR]-(sg:Subgraph)<-[:SUBGRAPH]-(a:Segment)
                WITH collect(DISTINCT n) + collect(DISTINCT a) AS nodes

                // 3. Find all LINKS_TO relationships involving these nodes
                UNWIND nodes AS s
                OPTIONAL MATCH (s)-[r:LINKS_TO]-(:Segment)

                // 4. Return all relevant nodes and links
                RETURN collect(DISTINCT s) AS segments, 
                    collect(DISTINCT r) AS links
                """

        results = session.run(segment_query, parameters)

        for result in results:
            nodes.extend([record.segment_record(n) for n in result["segments"]])
            links.extend([record.link_record_gfa(r) for r in result["links"]])
    
    links = integrity.remove_invalid_links(nodes, links, nodeids={node["id"] for node in nodes})

    return nodes, links


def get_subgraph_nodes(uuid, genome, chrom, start, end):
    nodes, links = [], []
    node_type = get_node_type(uuid)

    if node_type is None or node_type == "Segment":
        return nodes, links

    with get_session() as (db, session):

        
        parameters = {"db": db, "uuid": uuid, "start": start, "end": end, "genome": genome, "chrom": chrom}

        if node_type == "Bubble":
            query = """
                    MATCH (n)-[i:INSIDE]->(t:Bubble)
                    WHERE t.uuid = $uuid

                    OPTIONAL MATCH (n)-[l1:LINKS_TO]-(:Segment)
                    OPTIONAL MATCH (n)-[r:END]-(e:Segment)
                    OPTIONAL MATCH (e)-[l2:LINKS_TO]-(:Segment)
                    OPTIONAL MATCH (e)-[:COMPACT]-(c:Segment)
                    OPTIONAL MATCH (c)-[l3:LINKS_TO]->(:Segment)

                    RETURN n, i, 
                        labels(n) AS type,
                        collect(DISTINCT l1) + collect(DISTINCT l2) + collect(DISTINCT l3) AS links,
                        collect(DISTINCT r) AS endlinks
                    """
            results = session.run(query, parameters)
            for result in results:
                node = record.node_record(result["n"], result["type"][0])

                node["bubble"] = uuid
                nodes.append(node)

                for r in result["endlinks"] + result["links"]:
                    link = record.link_record(r)
                    if link:
                        links.append(link)

        elif node_type == "Chain":
            query = """
                    MATCH (b:Bubble)-[:CHAINED]->(t:Chain)
                    WHERE t.uuid = $uuid
                    WITH b, t
                    OPTIONAL MATCH (b)-[r1:END]-(e:Segment)
                    OPTIONAL MATCH (t)-[r2:CHAIN_END]-(s1:Segment)
                    OPTIONAL MATCH (e)-[:COMPACT]-(c:Segment)
                    OPTIONAL MATCH (e)-[l1:LINKS_TO]->(target1:Segment)
                    OPTIONAL MATCH (c)-[l2:LINKS_TO]->(target2:Segment)

                    RETURN b, e, collect(DISTINCT c) AS compacted_segments,
                        collect(DISTINCT r1) AS endlinks, collect(DISTINCT r2) AS chainlinks,
                        collect(DISTINCT l1) + collect(DISTINCT l2) AS compactlinks
                    """

            results = session.run(query, parameters)

            for result in results:
                bubble = record.bubble_record(result["b"])
                bubble["chain"] = uuid
                nodes.append(bubble)

                node = record.segment_record(result["e"])
                node["chain"] = uuid
                nodes.append(node)

                compacted_segments = result["compacted_segments"] or []
                for seg in compacted_segments:
                    cnode = record.segment_record(seg)
                    cnode["chain"] = uuid
                    nodes.append(cnode)

                for r in result["endlinks"]:
                    link = record.link_record(r)
                    if link:
                        links.append(link)

                for r in result["chainlinks"]:
                    link = record.link_record(r)
                    if link:
                        links.append(link)

                compact_links = result["compactlinks"] or []
                links.extend([record.link_record(link) for link in compact_links])

    nodes = integrity.deduplicate_nodes(nodes)
    links = integrity.deduplicate_links(links)
    #links = integrity.remove_invalid_links(nodes, links)

    return nodes, links

   

def get_subgraph(uuid, genome, chrom, start, end):
    nodes,links = get_subgraph_nodes(uuid, genome, chrom, start, end)

    print(f"SUBGRAPH QUERY: ")#{chrom}:{start}-{end}")
    print(f"   Nodes: {len(nodes)}")
    print(f"   Links: {len(links)}")

    return {"nodes": nodes, "links": links}

