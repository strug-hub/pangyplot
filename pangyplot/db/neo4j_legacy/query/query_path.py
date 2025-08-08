from db.neo4j.neo4j_db import get_session
import re

def decompress_chunk(chunk_str, base_offset):
    pattern = r'[><]-?[0-9]+' 
    tokens = re.findall(pattern, chunk_str)

    segments = []
    for token in tokens:
        strand = '+' if token[0] == '>' else '-'
        offset = int(token[1:])
        seg_id = base_offset + offset
        segments.append(f"{seg_id}{strand}")
    return segments


def reconstruct_paths(records):
    if not records:
        return []
    
    sorted_records = sorted(records, key=lambda x: (x["sample"], x["uuid"]))

    paths = []
    segments = []
    prev_record = None

    def path_id(record):
        return record["uuid"].split(":")[0]
    def path_idx(record):
        return int(record["uuid"].split(":")[-1])

    def path_info(record):
        return {
            "sample": record["sample"],
            "contig": record["contig"],
            "hap": record.get("haplotype"),
            "start": record["start"]
        }

    for record in sorted_records:
        chunk_str = record["chunk"]
        offset = record["offset"]

        info = path_info(record)
        if info["sample"] == "HG00438" and info["contig"] == "JAHBCB010000097.1" and info["hap"] == "1":
            decompressed = decompress_chunk(chunk_str, offset)
            print(f"DEBUG: {record['uuid']} {chunk_str} {offset} -> {decompressed}")

        if prev_record is None:
            segments = decompress_chunk(chunk_str, offset)
            prev_record = record
            continue

        sequential = path_idx(record) == path_idx(prev_record)+1
        same_path = path_id(record) == path_id(prev_record)

        if sequential and same_path:
            segments.extend(decompress_chunk(chunk_str, offset))
        else:
            paths.append({ **path_info(prev_record),  "path": segments })
            segments = decompress_chunk(chunk_str, offset)

        prev_record = record

    if len(segments) > 0:
        paths.append({ **path_info(prev_record),  "path": segments })

    return paths
    
def remove_invalid_path_segments(paths, valid_ids):
    clean_paths = []
    valid_set = set(str(nid) for nid in valid_ids)

    for path in paths:
        sample = path["sample"]
        hap = path["hap"]
        key = f"{sample}#{hap}"

        parsed = [(seg[:-1], seg[-1]) for seg in path["path"]]
        current = []
        buffer = []

        for i, (seg_id, strand) in enumerate(parsed):
            if seg_id in valid_set:
                buffer = []
                current.append(f"{seg_id}{strand}")
            else:
                if current:
                    clean_paths.append({ **path, "path": current})
                    current = []
                buffer.append(f"{seg_id}{strand}")

        if current:
            clean_paths.append({ **path, "path": current })

    return clean_paths


def query_paths(seg_ids, collection):

    sids = sorted(set(int(nid) for nid in seg_ids))

    with get_session() as (db, session):

        max_gap=200
        clusters = []
        current = [sids[0]]
        for nid in sids[1:]:
            if nid - current[-1] <= max_gap:
                current.append(nid)
            else:
                clusters.append(current)
                current = [nid]
        clusters.append(current)

        buffer=100
        ranges = []
        for cluster in clusters:
            min_id = cluster[0] - buffer
            max_id = cluster[-1] + buffer
            ranges.append((min_id, max_id))

        query = """
            MATCH (p:PathChunk)
            WHERE p.db = $db AND p.collection = $collection
            AND p.offset >= $start AND p.offset <= $end
            WITH p

            OPTIONAL MATCH (prev:PathChunk)-[:NEXT_CHUNK]->(p)
            WITH p, prev
            OPTIONAL MATCH (p)-[:NEXT_CHUNK]->(next:PathChunk)

            WITH COLLECT(p) + COLLECT(prev) + COLLECT(next) AS all_chunks
            UNWIND all_chunks AS chunk
            WITH DISTINCT chunk
            RETURN chunk
        """

        raw_paths = []
        for start,end in ranges:

            result = session.run(query, parameters={
                "db": db,
                "collection": collection,
                "start": start,
                "end": end
            })
    
            for record in result:
                raw_paths.append(record["chunk"])

        paths = reconstruct_paths(raw_paths)
        paths = remove_invalid_path_segments(paths, seg_ids)

    return paths
    