def export_subgraph_to_gfa(gfa_index, start_id, save_path, search_distance=10):

    visited = gfa_index.bfs(start_id, search_distance)
    visited = set(visited)

    with open(save_path, 'w') as f:
        f.write("H\tVN:Z:1.0\n")
        segments = gfa_index.get_segments(visited)
        seg_ids = {seg.id for seg in segments}

        links = set()
        for segment in segments:
            sid = segment.id
            f.write(f"S\t{sid}\t{segment.seq}\n")

            seg_links = gfa_index.get_links(sid)

            for link in seg_links:
                if link.from_id not in seg_ids or link.to_id not in seg_ids:
                    continue
                key = (link.from_id, link.from_strand, link.to_id, link.to_strand)
                links.add(key)

        for (fr, fs, to, ts) in links:
            f.write(f"L\t{fr}\t{fs}\t{to}\t{ts}\t0M\n")

    print(f"✅ Exported GFA subgraph to: {save_path}")
