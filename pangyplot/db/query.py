
def get_top_level_data(indexes, genome, chrom, start, end):
    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    
    start_step, end_step = stepidx.query_coordinates(start, end, debug=False)
    top_bubbles = bubbleidx.get_top_level_bubbles(start_step, end_step, as_chains=False)
    print(f"Found {len(top_bubbles)} bubbles in range {start_step}-{end_step}")

    nodes = [bubble.serialize() for bubble in top_bubbles]
    graph = {"nodes": nodes, "links": []}
    return graph