
def get_bubble_graph(indexes, genome, chrom, start, end):

    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index.get(chrom, None)
    #gfaidx = indexes.gfa_index.get(chrom, None)

    if stepidx is None or bubbleidx is None:
        raise ValueError(f"Genome '{genome}' or chromosome '{chrom}' not found in indexes.")

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubble_chains = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=True)

    serialized_chains = [chain.serialize() for chain in bubble_chains]
    graph = {
        "nodes": [node for chain in serialized_chains for node in chain["nodes"]],
        "links": [link for chain in serialized_chains for link in chain["links"]],
    }
    return graph

def pop_bubble(indexes, id, genome, chrom):
    if id.startswith("s"):
        return {"nodes": [], "links": []}

    id = int(id.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]

    subgraph = bubbleidx.get_popped_subgraph(id, stepidx)

    serialized_subgraph = dict()
    serialized_subgraph["nodes"] = [node.serialize() for node in subgraph["nodes"]]
    serialized_subgraph["links"] = [link.serialize() for link in subgraph["links"]]
    
    return serialized_subgraph

def get_bubble_end(indexes, id, genome, chrom):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    id = id.replace("b", "").split("#")[0]
    bid = int(id.split(":")[0])
    side = int(id.split(":")[1])

    #print(f"Getting bubble end for {bid} on side {side}...")

    bubble = bubbleidx[bid]

    inside_segments = bubble.source_segments if side == 0 else bubble.sink_segments

    serialized_subgraph = dict()
    segments, links = gfaidx.get_subgraph(inside_segments, stepidx)
    serialized_subgraph["nodes"] = [node.serialize() for node in segments]
    serialized_subgraph["links"] = [link.serialize() for link in links]

    return serialized_subgraph

def get_path(indexes, genome, chrom, start, end, sample):
    stepidx = indexes.step_index.get((chrom, genome), None)
    bubbleidx = indexes.bubble_index[chrom]

    start_segment, end_segment = stepidx.query_segment_id_from_coordinates(start, end)

    gfaidx = indexes.gfa_index[chrom]
    paths = gfaidx.get_paths(sample)

    all_subpaths = []
    for path in paths:
        subpaths = path.subset_path(start_segment, end_segment, gfaidx=gfaidx)
        all_subpaths.extend(subpaths)

    return [p.serialize(bubbleidx) for p in all_subpaths]

def get_path_order(indexes, genome, chrom):
    gfaidx = indexes.gfa_index[chrom]
    print(gfaidx.get_sample_idx())
    return gfaidx.get_sample_idx()
