from db.neo4j.neo4j_db import get_session
import db.utils.create_record as record
import db.utils.integrity_check as integrity

def get_top_level_data( genome, chrom, start, end):
    nodes,links = [],[]

    with get_session() as (db, session):

        parameters = {"start": start, "end": end, "db": db, "genome": genome, "chrom": chrom}

        count_query = """
            MATCH (n:Segment)
            WHERE n.db = $db AND n.genome = $genome AND n.chrom = $chrom 
                AND n.start <= $end AND n.end >= $start
            RETURN count(n) AS count
        """
        node_count = session.run(count_query, parameters).single()["count"]
        #print("TOTAL SEGMENTS IN RANGE:", node_count)

        bubble_query = """
                MATCH (n:Segment|Bubble)
                WHERE n.db = $db AND n.genome = $genome AND n.chrom = $chrom 
                    AND n.start >= $start AND n.end <= $end AND NOT EXISTS {
                        MATCH (n)-[:INSIDE|CHAINED]->(m)
                        WHERE m.chrom = $chrom AND m.start >= $start AND m.end <= $end
                }
                OPTIONAL MATCH (n)-[r1:END]-(e:Segment)
                OPTIONAL MATCH (n:Segment)-[r2:LINKS_TO]-(s:Segment)

                RETURN n, labels(n) AS type,
                    [r IN collect(r1) WHERE r IS NOT NULL] AS endlinks,
                    [r IN collect(r2) WHERE r IS NOT NULL] AS links
                """

        results = session.run(bubble_query, parameters)

        for result in results:
            nodes.append( record.node_record(result["n"], result["type"][0]) )
            links.extend( [record.link_record(r) for r in result["endlinks"]] )
            links.extend( [record.link_record(r) for r in result["links"]] )

        chain_query = """
            MATCH (n:Chain)-[:CHAINED]-(b:Bubble)
            WHERE n.db = $db AND n.genome = $genome AND n.chrom = $chrom 
            AND n.start >= $start AND n.end <= $end 
            AND NOT EXISTS {
                MATCH (n)-[:PARENT_SB]->(m)
                WHERE m.chrom = $chrom AND m.start >= $start AND m.end <= $end
            }

            OPTIONAL MATCH (n)-[r:CHAIN_END]-(e:Segment)
            OPTIONAL MATCH (e)-[:COMPACT]-(c1:Segment)
            OPTIONAL MATCH (e)-[l1:LINKS_TO]->(target1:Segment)
            OPTIONAL MATCH (c1)-[l2:LINKS_TO]->(target2:Segment)

            RETURN n, b, e, 
                collect(DISTINCT c1) AS compacted_segments,
                collect(DISTINCT l1) + collect(DISTINCT l2) AS compactlinks,
                collect(DISTINCT r) AS endlinks
        """

        results = session.run(chain_query, parameters)

        for result in results:
            nodes.append(record.chain_record(result["n"]))
            nodes.append(record.segment_record(result["e"]))
            compacted_segments = result["compacted_segments"] or []
            nodes.extend([record.segment_record(seg) for seg in compacted_segments])

            compact_links = result["compactlinks"] or []
            links.extend([record.link_record(link) for link in compact_links])

            end_links = result["endlinks"] or []
            links.extend([record.link_record(link) for link in end_links])


        alt_query = """
                MATCH (n:Segment)
                WHERE n.db = $db AND n.genome = $genome AND n.chrom = $chrom 
                    AND n.start <= $end AND n.end >= $start 
                MATCH (n)<-[:ANCHOR]-(a)
                WHERE NOT EXISTS {
                        MATCH (a)-[:INSIDE*]->(m)
                        WHERE m.start IS NOT NULL
                }
                OPTIONAL MATCH (a)-[r1:END]-(e:Segment)
                OPTIONAL MATCH (a:Segment)-[r2:LINKS_TO]-(s:Segment)

                RETURN a,s, labels(a) AS type,
                collect(DISTINCT r1) AS endlinks,
                collect(DISTINCT r2) AS links
                """

        results = session.run(alt_query, parameters)

        for result in results:
            nodes.append( record.node_record(result["a"], result["type"][0]) )
            links.extend( [record.link_record_simple(r) for r in result["endlinks"]] )
            links.extend( [record.link_record_simple(r) for r in result["links"]] )

        return nodes, links

def get_top_level(genome, chrom, start, end):

    nodes,links = get_top_level_data(genome, chrom, start, end)
    print(len(nodes))

    nodes = integrity.deduplicate_nodes(nodes)
    links = integrity.deduplicate_links(links)
    links = integrity.remove_invalid_links(nodes, links)

    print(f"🔎 TOP LEVEL QUERY: {chrom}:{start}-{end}")
    print(f"   Nodes:{len(nodes)}")
    print(f"   Links:{len(links)}")
    
    graph = {"nodes": nodes, "links": links}

    return graph