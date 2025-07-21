
def get_bubble_graph(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    graph_parts = bubbleidx.to_bubble_graph(start_step, end_step, gfaidx)
    bubble_nodes, bubble_links, segment_ids = graph_parts

    all_nodes = bubble_nodes
    all_links = bubble_links

    segments, segment_links = gfaidx.get_subgraph(segment_ids, stepidx)
    all_nodes.extend(segments)
    all_links.extend(segment_links)

    graph = {"nodes": [node.serialize() for node in all_nodes], 
             "links": [link.serialize() for link in all_links]}
    
    
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

    bubble_nodes, bubble_links, segment_ids = bubbleidx.get_subgraph(nodeid, gfaidx)
    all_nodes.extend(bubble_nodes)
    all_links.extend(bubble_links)

    segments, segment_links = gfaidx.get_subgraph(segment_ids, stepidx)
    all_nodes.extend(segments)
    all_links.extend(segment_links)

    nodes = [node.serialize() for node in all_nodes]
    links = [link.serialize() for link in all_links]

    return {"nodes": nodes, "links": links}
