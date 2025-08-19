from itertools import product
from collections import defaultdict

def classify_link(from_bubbles, to_bubbles, parent_child_dict, chain_end_dict):

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
        types.append("seg-bubble") #[segment]-[bubble]
        alt_links = [(from_bubbles, to_bubbles)] # Scenario 3.1
        return types, alt_links
   
    for pair in list(product(from_bubbles, to_bubbles)):
        (b1, x1), (b2, x2) = pair
         
        if b1 == b2: # Scenario 1
            if {x1, x2} == {inside}:
                types.append("internal") #[segment]-[segment]
                continue
            if {x1, x2} == {source, inside} or {x1, x2} == {sink, inside}:
                types.append("inside-end"); #[segment]-[bubble]
                alt_links.append(("inside-end", pair)) # Scenario 1.1
                continue
            if x1 == x2:
                types.append("compacted"); #[segment]-[segment]
                continue
            if {x1, x2} == {source, sink}:
                types.append("deletion") #[bubble]-[bubble]
                alt_links.append(("deletion", pair)) # Scenario 1.2
                continue
        elif b1 != b2: # different bubbles
            if b1 in parent_child_dict[b2]:
                if inside == x1 and chain_end_dict.get((b2, x2), False):
                    if :
                        types.append("parent-child-chain")
                    types.append("parent-child"); continue #[segment]-[child_bubble]
                else:
                    types.append("parent-child-ends") #[parent_bubble]-[child_bubble]
                    alt_links.append(("parent-child-ends", pair)) 
                    continue 

            if {x1, x2} == {source, sink} or {x1, x2} == {source} or {x1, x2} == {sink}:
                types.append("sib-ends") # this one is strange because you'd think it would be a bubble chain but they aren't connected by a end???
                continue
            if {x1, x2} == {source, inside}:
                types.append("inside-sib-source")
                continue
            if {x1, x2} == {sink, inside}:
                types.append("inside-sib-sink")
                continue

        types.append("unknown")
    
    print("raw types:", types)

    if "compacted" in types:
        types = ["compacted"]

    if "deletion" in types:
        types = ["deletion"]

    if len(types) > 1:
        types = [t for t in types if t != "parent-child"]
    if len(types) > 1:
        types = [t for t in types if t != "internal"]

    if "inside-sib-sink" in types and "source-inside" in types:
        types = [t for t in types if t not in ["inside-sib-sink", "source-inside"]]
        types.append("end-link")
    if "inside-sib-source" in types and "sink-inside" in types:
        types = [t for t in types if t not in ["inside-sib-source", "sink-inside"]]
        types.append("end-link")

    types.sort()

    return types, alt_links


def store_bubble_links(links, bubbles, chr_dir):
    node_to_bubbles = defaultdict(set)
    parent_child_dict = defaultdict(set)
    chain_end_dict = defaultdict()

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
            chain_end_dict[key] = bubble.is_source_chain_end()
        for nid in bubble.get_sink_segments():
            key = (bubble.id, sink)
            node_to_bubbles[nid].add(key)
            chain_end_dict[key] = bubble.is_sink_chain_end()
        for nid in bubble.inside:
            node_to_bubbles[nid].add((bubble.id, inside))

    internal_links = []
    external_links = []
    counts = defaultdict(int)

    for key, link in links.items():
        link_id = link.id()

        from_id, to_id = key
        from_bubbles = node_to_bubbles.get(from_id)
        to_bubbles = node_to_bubbles.get(to_id)

        link_type, alt_links = classify_link(from_bubbles, to_bubbles, parent_child_dict)
        counts[";".join(link_type)] += 1

        print(f"Processing link {link_id} with bubbles {from_bubbles} -> {to_bubbles}... {link_type}")
        if ";".join(link_type) == "inside-sib-source;parent-child-ends;source-inside":
            input("Press Enter to continue...")


        if from_bubbles is None and to_bubbles is None:
            continue
        
        #if from_bubble == to_bubble:
        #    internal_links.append((from_bubble, link_id))
        #    internal_links.append((to_bubble, link_id))
        #else:
        #    external_links.append((from_bubble, link_id))
        #    external_links.append((to_bubble, link_id))

    for key,count in counts.items():
        print(f"{key}: {count}")

    input("Press Enter to continue...")

    db.insert_internal_links(chr_dir, internal_links)
    db.insert_external_links(chr_dir, external_links)

