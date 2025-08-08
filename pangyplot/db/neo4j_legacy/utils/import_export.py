import json
import gzip
from db.neo4j.neo4j_db import db_init, get_session

def import_dataset(input_path, batch_size=1000):
    db_init(None)
    open_func = gzip.open if input_path.endswith(".gz") else open
    print("  Uploading data...")

    def insert_nodes(session, nodes):
        label_groups = {}
        for node in nodes:
            labels = ":".join(node["labels"])
            label_groups.setdefault(labels, []).append(node)

        for labels, group in label_groups.items():
            session.run(
                f"""
                UNWIND $batch AS row
                CREATE (n:{labels} {{uuid: row.uuid}})
                SET n += row.props
                """,
                batch=[{
                    "uuid": n["properties"]["uuid"],
                    "props": n["properties"]
                } for n in group]
            )

    def insert_relationships(session, rels):
        type_groups = {}
        for rel in rels:
            rel_type = rel["rel_type"]
            type_groups.setdefault(rel_type, []).append(rel)

        for rel_type, group in type_groups.items():
            # Group by (source_labels, target_labels)
            label_combos = {}
            for rel in group:
                sl = ":".join(rel.get("source_labels", []))
                tl = ":".join(rel.get("target_labels", []))
                label_combos.setdefault((sl, tl), []).append(rel)

            for (sl, tl), batch_group in label_combos.items():
                cypher = f"""
                    UNWIND $batch AS row
                    MATCH (a:{sl} {{uuid: row.source}}), (b:{tl} {{uuid: row.target}})
                    CREATE (a)-[r:{rel_type}]->(b)
                    SET r += row.props
                """
                session.run(
                    cypher,
                    batch=[{
                        "source": r["source"],
                        "target": r["target"],
                        "props": r["properties"]
                    } for r in batch_group]
                )


    with get_session() as (_, session), open_func(input_path, "rt") as f:
        node_count = rel_count = 0
        batch = []

        for line in f:
            if line.strip():
                batch.append(json.loads(line))
                if len(batch) >= batch_size:
                    nodes = [i for i in batch if i["type"] == "node"]
                    rels = [i for i in batch if i["type"] == "relationship"]
                    insert_nodes(session, nodes)
                    insert_relationships(session, rels)
                    node_count += len(nodes)
                    rel_count += len(rels)
                    print(f"\r  📁 {node_count} nodes | 🗃️ {rel_count} relationships imported...", end="", flush=True)
                    batch = []

        # Final flush
        if batch:
            nodes = [i for i in batch if i["type"] == "node"]
            rels = [i for i in batch if i["type"] == "relationship"]
            insert_nodes(session, nodes)
            insert_relationships(session, rels)
            node_count += len(nodes)
            rel_count += len(rels)

        print(f"\r  📁 {node_count} nodes | 🗃️ {rel_count} relationships imported.       ")
        print(f"\n  ✅ Import complete: {input_path}")


def export_database(db_name, output_prefix, collection=None, batch_size=10000):
    db_init(db_name)
    output_path = f"{output_prefix}.txt.gz"
    collection = int(collection) if collection is not None else None

    def write_node(record, f):
        f.write(json.dumps({
            "type": "node",
            "uuid": record["uuid"],
            "labels": record["labels"],
            "properties": record["props"]
        }) + "\n")

    with get_session() as (db, session), gzip.open(output_path, "wt") as f:

        result = session.run(f"""
            MATCH (n:Sample) WHERE n.db = $db
            RETURN n.uuid as uuid, labels(n) as labels, properties(n) as props
        """, db=db)

        for record in result:
            write_node(record, f)
        print("  👤 Sample nodes exported")

        result = session.run("""
            MATCH (n:Collection) WHERE n.db = $db 
            RETURN n.uuid as uuid, labels(n) as labels, properties(n) as props
            """, db=db)
        for record in result:
            if collection is not None:
                props = record["props"]
                if props.get("id") != collection:
                    continue
            
            if "datetime" in props:
                props["datetime"] = props["datetime"].isoformat()
            write_node({
                "uuid": record["uuid"],
                "labels": record["labels"],
                "props": props
            }, f)

        # Export nodes
        offset = 0
        count = 0
        while True:
            result = session.run("""
                MATCH (n)
                WHERE n.db = $db AND NOT 'Sample' IN labels(n) AND NOT 'Collection' IN labels(n)
                      AND ($collection IS NULL OR n.collection = $collection)
                RETURN n.uuid as uuid, labels(n) as labels, properties(n) as props
                SKIP $offset LIMIT $batch
            """, db=db_name, collection=collection, offset=offset, batch=batch_size)
            nodes = result.data()
            if not nodes:
                break
            count += len(nodes)
            for record in nodes:
                write_node(record, f)

            offset += batch_size
            print(f"\r  📄 {count} nodes exported...", end="", flush=True)
        print(f"\r  📄 {count} nodes exported.       ")

        # Export relationships
        offset = 0
        count = 0
        while True:
            result = session.run("""
                MATCH (a)-[r]->(b)
                WHERE a.db = $db AND ($collection IS NULL OR a.collection = $collection)
                RETURN a.uuid AS source_id, b.uuid AS target_id,
                    labels(a) AS source_labels, labels(b) AS target_labels,
                    type(r) AS type, properties(r) AS props
                SKIP $offset LIMIT $batch
            """, db=db_name, collection=collection, offset=offset, batch=batch_size)
            rels = result.data()
            if not rels:
                break
            for record in rels:
                f.write(json.dumps({
                    "type": "relationship",
                    "source": record["source_id"],
                    "target": record["target_id"],
                    "source_labels": record["source_labels"],
                    "target_labels": record["target_labels"],
                    "rel_type": record["type"],
                    "properties": record["props"]
                }) + "\n")
            count += len(rels)
            offset += batch_size
            print(f"\r  📑 {count} relationships exported...", end="", flush=True)
        print(f"\r  📑 {count} relationships exported.       ")

    print(f"  ✅ Export complete: {output_path}")
