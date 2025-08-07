
def get_bubble_graph(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubble_chains = bubbleidx.get_top_level_bubbles(start_step, end_step, gfaidx, as_chains=True)
    
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
    if nodeid.startswith("s"):
        return {"nodes": [], "links": [], "end_data": dict()}

    nodeid = int(nodeid.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    subgraph = bubbleidx.get_subgraph(nodeid, gfaidx, stepidx)

    serialized_subgraph = dict()
    serialized_subgraph["nodes"] = [node.serialize() for node in subgraph["nodes"]]
    serialized_subgraph["links"] = [link.serialize() for link in subgraph["links"]]
    serialized_subgraph["end_data"] = dict()
    for bid, end_data in subgraph["end_data"].items():
        serialized_subgraph["end_data"][bid] = {
            "nodes": [node.serialize() for node in end_data["nodes"]],
            "links": [link.serialize() for link in end_data["links"]]
        }

    return serialized_subgraph
