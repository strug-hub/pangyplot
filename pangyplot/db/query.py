
def get_bubble_graph(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]

    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    bubble_nodes, bubble_links = bubbleidx.to_bubble_graph(start_step, end_step)

    nodes = [bubble.serialize() for bubble in bubble_nodes]
    links = [link.serialize() for link in bubble_links]

    print(f"Found {len(nodes)} nodes and {len(links)} links in range {start_step}-{end_step}")

    graph = {"nodes": nodes, "links": links}
    return graph