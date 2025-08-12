
def get_bubble_graph(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubble_chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)

    serialized_chains = [chain.serialize() for chain in bubble_chains]
    graph = {
        "nodes": [node for chain in serialized_chains for node in chain["nodes"]],
        "links": [link for chain in serialized_chains for link in chain["links"]],
    }
    return graph

def pop_bubble(indexes, nodeid, genome, chrom):
    if nodeid.startswith("s"):
        return {"nodes": [], "links": []}

    nodeid = int(nodeid.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    subgraph = bubbleidx.get_popped_subgraph(nodeid, gfaidx, stepidx)

    serialized_subgraph = dict()
    serialized_subgraph["nodes"] = [node.serialize() for node in subgraph["nodes"]]
    serialized_subgraph["links"] = [link.serialize() for link in subgraph["links"]]
    
    return serialized_subgraph

def get_bubble_end(indexes, nodeid, genome, chrom):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    nodeid = nodeid.replace("c", "").split("#")[0]
    chain_id, chain_step, side = [int(x) for x in nodeid.split(":")]
    # side = 0 if source and 1 if sink
    if side == 0: chain_step += 1

    bubble = bubbleidx.get_bubble_by_chain(chain_id, chain_step)
    inside_segments = bubble.source_segments if side == 0 else bubble.sink_segments

    serialized_subgraph = dict()
    segments, links = gfaidx.get_subgraph(inside_segments, stepidx)
    serialized_subgraph["nodes"] = [node.serialize() for node in segments]
    serialized_subgraph["links"] = [link.serialize() for link in links]

    return serialized_subgraph