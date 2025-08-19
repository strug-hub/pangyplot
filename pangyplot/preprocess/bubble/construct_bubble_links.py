from itertools import product
from collections import defaultdict
import pangyplot.db.sqlite.bubble_db as db

def classify_link(from_bubbles, to_bubbles, parent_child_dict):

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
    
    source, sink, inside = 0, 1, 2

    types, alt_links = [],[]

    if from_bubbles is None and to_bubbles is None:
        return [],[]
    
    if from_bubbles is None or to_bubbles is None:
        types.append("singleton") #[segment]-[bubble]
        alt_links.append(("singleton", (from_bubbles, to_bubbles))) # Scenario 3.1
        return types, alt_links

    print("pairs", list(product(from_bubbles, to_bubbles)))
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
                types.append("end"); #[segment]-[bubble]
                alt_links.append(("end", pair)) # Scenario 1.1
                continue
            if {x1, x2} == {source, sink}:
                types.append("deletion") #[bubble]-[bubble]
                alt_links.append(("deletion", pair)) # Scenario 1.2
                continue
        elif b1 != b2: # different bubbles
            if b1 in parent_child_dict[b2]:
                if x1 in {source, sink} and x2 in {source, sink}:
                    types.append("parent-child") #[parent_bubble]-[child_bubble]
                    alt_links.append(("parent-child", pair)) # Scenario 3.2
                    continue
                elif {x1,x2} == {inside}:
                    # shouldn't happen
                    types.append("parent-child-insides") 
                    continue
                else: # one inside (parent), one end
                    types.append("singleton") #[segment]-[child_bubble]
                    alt_links.append(("singleton", pair)) # Scenario 3.3
                    continue

            elif {x1, x2} == {source, inside} or {x1, x2} == {sink, inside}:
                types.append("chain") # Scenario 2.1
                alt_links.append(("chain", pair))
                continue

            if {x1, x2} == {source, sink} or {x1, x2} == {source} or {x1, x2} == {sink}:
                # almost a bubble chain but they aren't connected by a common end
                # though it happens with deletion links
                types.append("non-chain-ends") 
                continue

        print(f"Unknown link type: {pair}")
        types.append("unknown")
    
    #print("raw types:", types)

    return alt_links

def store_bubble_links(links, bubbles, chr_dir):
    node_to_bubbles = defaultdict(set)
    parent_child_dict = defaultdict(set)

    source, sink, inside = 0, 1, 2

    for bubble in bubbles:
        if bubble.parent:
            parent_child_dict[bubble.parent].add(bubble.id)
            parent_child_dict[bubble.id].add(bubble.parent)
        
        #for nid in bubble.inside:
        #    node_to_bubbles[nid].add(bubble.id)
        for nid in bubble.get_source_segments():
            key = (bubble.id, source)
            node_to_bubbles[nid].add(key)
        for nid in bubble.get_sink_segments():
            key = (bubble.id, sink)
            node_to_bubbles[nid].add(key)
        for nid in bubble.inside:
            node_to_bubbles[nid].add((bubble.id, inside))

    internal_links = []
    external_links = []

    for key, link in links.items():
        link_id = link.id()

        from_id, to_id = key
        from_bubbles = node_to_bubbles.get(from_id)
        to_bubbles = node_to_bubbles.get(to_id)
        print(f"Processing link {link_id} with bubbles {from_bubbles} -> {to_bubbles}...")
        alt_links = classify_link(from_bubbles, to_bubbles, parent_child_dict)

        #TODO: handle alt_links

    db.insert_internal_links(chr_dir, internal_links)
    db.insert_external_links(chr_dir, external_links)

