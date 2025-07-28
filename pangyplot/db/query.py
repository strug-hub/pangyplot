
def get_bubble_graph(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubble_chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)
    
    graph = {"nodes": [], "links": []}
    for chain in bubble_chains:
        chain_data = chain.serialize()
        graph["nodes"].extend(chain_data["nodes"])
        graph["links"].extend(chain_data["links"])

        source_links = chain.source_bubble().get_source_links(gfaidx)
        sink_links = chain.sink_bubble().get_sink_links(gfaidx)
        graph["links"].extend([link.serialize() for link in source_links])
        graph["links"].extend([link.serialize() for link in sink_links])

    return graph


def pop_bubble(indexes, nodeid, genome, chrom):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    all_nodes = []
    all_links = []
    if nodeid.startswith("s"):
        return {"nodes": all_nodes, "links": all_links}
    nodeid = int(nodeid.replace("b", ""))

    bubble, bubble_nodes, bubble_links, segment_ids = bubbleidx.get_subgraph(nodeid, gfaidx)
    #todo: get node -> bubble links
    
    all_nodes.extend(bubble_nodes)
    all_links.extend(bubble_links)

    segments, segment_links = gfaidx.get_subgraph(segment_ids, stepidx)


    siblings = [bubbleidx[sid] for sid in bubble.get_siblings()]

    for link in segment_links:
        for sibling in siblings:
            if link.from_id in sibling.inside:
                link.from_id = sibling.id
                link.make_bubble_to_segment()
                print(f"Link {link.from_id} -> {link.to_id} adjusted to bubble {sibling.id}")
                print(link.serialize())
            elif link.to_id in sibling.inside:
                link.to_id = sibling.id
                link.make_segment_to_bubble()
                print(f"Link {link.from_id} -> {link.to_id} adjusted to bubble {sibling.id}")
                print(link.serialize())

            break

    all_nodes.extend(segments)
    all_links.extend(segment_links)

    nodes = [node.serialize() for node in all_nodes]
    links = [link.serialize() for link in all_links]

    return {"nodes": nodes, "links": links}
