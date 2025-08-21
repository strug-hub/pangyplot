from itertools import product
from collections import defaultdict
import pangyplot.db.sqlite.bubble_db as db

def classify_link(link, from_bubbles, to_bubbles, bubble_dict):
    # this is a function that untangles the complex link relationships
    # at the ends of bubbles. Links here go to a bubble end (source or sink)
    # or inside a bubble. And of course bubbles can be nested in other bubbles.

    # it collapses to a handful of cases when you only consider one bubble end:

    # Scenario 1: bubble end to itself
    # 1. [BubbleA source/sink]-[BubbleA inside] a link internal to the bubble
    # 2. [BubbleA source]-[BubbleA sink] a deletion link
    
    # Scenario 2: bubble end is internal to a chain
    # 1. [BubbleA source/sink]-(aka [BubbleB sink/source])-[BubbleB inside] a chain link from bubble A to bubble B, must collapse similar links

    # Scenario 3: bubble end is at a chain end
    # 1. [BubbleA source/sink]-[segment] a segment not in a bubble (ie. None) 
    # 2. [BubbleA source/sink]-[ParentBubble source/sink] a link from a child bubble to its parent bubble
    # 3. [BubbleA source/sink]-[ParentBubble inside] similar to case 1 but segment is inside a bubble
    # 4. [BubbleA source/sink]-[BubbleB source/sink] a link from one bubble to another bubble, not in the same chain 
    
    source, sink, inside, segment = 0, 1, 2, -1

    types = []
    alt_links = defaultdict(list)

    if from_bubbles is None and to_bubbles is None:
        return alt_links
    
    if from_bubbles is None or to_bubbles is None:
        valid_bubbles = from_bubbles if from_bubbles is not None else to_bubbles
        for bub in valid_bubbles:
            fb = bub if from_bubbles is not None else (link.from_id, segment)
            tb = bub if to_bubbles is not None else (link.to_id, segment)

            types.append("singleton") #[segment]-[bubble]
            alt_links["singleton"].append((fb, tb)) # Scenario 3.1

        return alt_links
    
    for pair in list(product(from_bubbles, to_bubbles)):
        (b1, x1), (b2, x2) = pair
        
        if b1 == b2: # Scenario 1
            if {x1, x2} == {inside}:
                types.append("internal") #[segment]-[segment]
                continue
            if x1 == x2:
                types.append("compacted"); #[segment]-[segment]
                continue
            if {x1, x2} == {source, inside} or {x1, x2} == {sink, inside}:
                types.append("end"); #[segment]-[bubble] Scenario 1.1
                if x1 == inside:
                    seg_pair = ((link.from_id, segment), (b2, x2))
                    alt_links["end"].append(seg_pair)
                elif x2 == inside:
                    seg_pair = ((b1, x1), (link.to_id, segment))
                    alt_links["end"].append(seg_pair)
                continue
            if {x1, x2} == {source, sink}:
                types.append("deletion") #[bubble]-[bubble] Scenario 1.2
                alt_links["deletion"].append(pair)
                continue
        elif b1 != b2: # different bubbles
            if bubble_dict[b1].parent == b2 or bubble_dict[b2].parent == b1:
                if x1 in {source, sink} and x2 in {source, sink}:
                    types.append("parent-child") #[parent_bubble]-[child_bubble] Scenario 3.2
                    alt_links["parent-child"].append(pair)
                elif {x1,x2} == {inside}:
                    # shouldn't happen
                    types.append("parent-child-insides") 
                    continue
                else: # one inside (parent), one end
                    types.append("singleton") #[segment]-[child_bubble] Scenario 3.3

                    if x1 == inside:
                        seg_pair = ((link.from_id, segment), (b2, x2))
                        alt_links["singleton"].append(seg_pair)
                    elif x2 == inside:
                        seg_pair = ((b1, x1), (link.to_id, segment))
                        alt_links["singleton"].append(seg_pair)
                    continue

            elif {x1, x2} == {source, inside} or {x1, x2} == {sink, inside}:
                types.append("chain") # [bubble]-[bubble] Scenario 2.1
                alt_links["chain"].append(pair)
                continue

            if {x1, x2} == {source, sink} or {x1, x2} == {source} or {x1, x2} == {sink}:
                # bubbles not connected by a common end
                # happens with deletion links, ignore within a chain
                if bubble_dict[b1].chain == bubble_dict[b2].chain:
                    types.append("skip-ends-in-chain")
                else:
                    types.append("cross-chain") #[bubble]-[bubble] Scenario 3.4
                    alt_links["cross-chain"].append(pair)
                continue

        types.append("unknown")
    
    #print("raw types:", types)

    return alt_links

def store_bubble_links(links, bubbles):
    bubble_dict = {bubble.id: bubble for bubble in bubbles}
    node_to_bubbles = defaultdict(set)

    source, sink, inside, segment = 0, 1, 2, -1

    for bubble in bubbles:
        
        for nid in bubble.get_source_segments():
            key = (bubble.id, source)
            node_to_bubbles[nid].add(key)
        for nid in bubble.get_sink_segments():
            key = (bubble.id, sink)
            node_to_bubbles[nid].add(key)
        for nid in bubble.inside:
            node_to_bubbles[nid].add((bubble.id, inside))

    bubble_check = defaultdict(list)
    bubble_check_result = defaultdict(list)

    for key, link in links.items():
        from_id, to_id = key
        from_bubbles = node_to_bubbles.get(from_id)
        to_bubbles = node_to_bubbles.get(to_id)

        if from_bubbles is not None:
            for bubble in from_bubbles:
                bubble_check[bubble].append(link)
        if to_bubbles is not None:
            for bubble in to_bubbles:
                bubble_check[bubble].append(link)

        alt_links = classify_link(link, from_bubbles, to_bubbles, bubble_dict)
        
        if from_bubbles is not None:
            for bubble in from_bubbles:
                bubble_check_result[bubble].append(alt_links)
        if to_bubbles is not None:
            for bubble in to_bubbles:
                bubble_check_result[bubble].append(alt_links)

        link_id = link.id()

        for link_type in alt_links:
            for (b1, x1), (b2, x2) in alt_links[link_type]:
                if link_type == "chain":
                    continue # chains are computed from end links
                elif link_type == "end":
                    if x1 == segment:
                        bubble_dict[b2].add_end_link(link_id, f"{b1}", f"{b2}:{x2}")
                    if x2 == segment:
                        bubble_dict[b1].add_end_link(link_id, f"{b1}:{x1}", f"{b2}")
                elif link_type == "deletion":
                    bubble_dict[b1].add_deletion_link(link_id)
                elif link_type == "parent-child":
                    if bubble_dict[b1].parent == b2:
                        bparent, bchild = b2, b1
                    elif bubble_dict[b2].parent == b1:
                        bparent, bchild = b1, b2
                    else:
                        continue
                    bubble_dict[bparent].add_child_link(link_id, f"{b1}:{x1}", f"{b2}:{x2}")
                elif link_type == "singleton":
                    if x1 == segment:
                        bubble_dict[b2].add_singleton_link(link_id, f"{b1}", f"{b2}:{x2}")
                    if x2 == segment:
                        bubble_dict[b1].add_singleton_link(link_id, f"{b1}:{x1}", f"{b2}")
                elif link_type == "cross-chain":
                    bubble_dict[b1].add_cross_link(link_id, f"{b1}:{x1}", f"{b2}:{x2}")
                    bubble_dict[b2].add_cross_link(link_id, f"{b1}:{x1}", f"{b2}:{x2}")
