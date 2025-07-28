
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

    if nodeid.startswith("s"):
        return {"nodes": [], "links": [], "end_data": dict()}

    nodeid = int(nodeid.replace("b", ""))

    stepidx = indexes.step_index[(chrom, genome)]
    bubbleidx = indexes.bubble_index[chrom]
    gfaidx = indexes.gfa_index[chrom]

    all_nodes = []
    all_links = []
    end_data = dict()

    bubble, bubble_nodes, bubble_links = bubbleidx.get_subgraph(nodeid, gfaidx)    
    segments, segment_links = gfaidx.get_subgraph(bubble.inside, stepidx)

    all_nodes.extend(bubble_nodes)
    all_nodes.extend(segments)
    all_links.extend(bubble_links)
    all_links.extend(segment_links)

    bubble_segs = set(bubble.ends(as_list=True))
    bubble_segs.update(bubble.inside)
    
    for seg_id in bubble.get_source():
        sib_id = bubble.get_source_sibling()
        for link in gfaidx.get_links(seg_id):
            other_id = link.other_id(seg_id)
            if other_id in bubble.inside:
                link_copy = link.clone()
                if link.from_id == seg_id:
                    link_copy.from_id = sib_id
                    link_copy.make_bubble_to_segment()
                    print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                    print(link.serialize())
                elif link.to_id == seg_id:
                    link_copy.to_id = sib_id
                    link_copy.make_segment_to_bubble()
                    print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                    print(link_copy.serialize())
                all_links.append(link_copy)

    for seg_id in bubble.get_sink():
        sib_id = bubble.get_sink_sibling()
        for link in gfaidx.get_links(seg_id):
            other_id = link.other_id(seg_id)
            if other_id in bubble.inside:
                link_copy = link.clone()
                if link.from_id == seg_id:
                    link_copy.from_id = sib_id
                    link_copy.make_bubble_to_segment()
                    print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                    print(link.serialize())
                elif link.to_id == seg_id:
                    link_copy.to_id = sib_id
                    link_copy.make_segment_to_bubble()
                    print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                    print(link_copy.serialize())
                all_links.append(link_copy)




    for sib_id, seg_ids in bubble.get_siblings(with_segments=True):
        for seg_id in seg_ids:
            for link in gfaidx.get_links(seg_id):
                other_id = link.other_id(seg_id)
                if other_id not in bubble_segs:
                    link_copy = link.clone()
                    if link.from_id == other_id:
                        link_copy.from_id = sib_id
                        link_copy.make_bubble_to_segment()
                        print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                        print(link.serialize())
                    elif link.to_id == other_id:
                        link_copy.to_id = sib_id
                        link_copy.make_segment_to_bubble()
                        print(f"Link {link.from_id} -> {link_copy.to_id} adjusted to bubble {sib_id}")
                        print(link_copy.serialize())
                    all_links.append(link_copy)

    siblings = [bubbleidx[sid] for sid in bubble.get_siblings()]

    bubble_ends = set(bubble.ends(as_list=True))

    for sibling in siblings:
        end_data[sibling.get_id()] =  {"nodes": [], "links": []}
        all_sib_ends = bubble.ends(as_list=True)
        end_ids = {seg_id for seg_id in all_sib_ends if seg_id in bubble_ends}

        end_segments, end_links = gfaidx.get_subgraph(end_ids, stepidx)
        end_data[sibling.get_id()]["nodes"] = [node.serialize() for node in end_segments]
        end_data[sibling.get_id()]["links"] = [link.serialize() for link in end_links]

        for link in end_links:
            if link.from_id in sibling.inside:
                link_copy = link.clone()
                link_copy.from_id = sibling.id
                link_copy.make_bubble_to_segment()
                all_links.append(link_copy)
                print(f"Link {link.from_id} -> {link.to_id} adjusted to bubble {sibling.id}")
                print(link.serialize())
            elif link.to_id in sibling.inside:
                link_copy = link.clone()
                link_copy.to_id = sibling.id
                link_copy.make_segment_to_bubble()
                all_links.append(link_copy)
                print(f"Link {link.from_id} -> {link.to_id} adjusted to bubble {sibling.id}")
                print(link.serialize())

    nodes = [node.serialize() for node in all_nodes]
    links = [link.serialize() for link in all_links]

    return {"nodes": nodes, "links": links, "end_data": end_data}
