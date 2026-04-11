"""
Assign parent superbubbles to nested bubbles using set containment
instead of re-running BFS from every interior node.

Algorithm:
1. For each superbubble, collect the set of all node IDs (source + sink + inside)
2. For each bubble, collect its node IDs
3. Sort superbubbles smallest-first so that the tightest container wins
4. A bubble B is nested in superbubble S if B's nodes are a strict subset of S's nodes
5. Assign the smallest containing superbubble as parent
"""


def find_parents(graph):
    all_sbs = [x for x in graph.bubbles.values() if x.is_super()]

    # Precompute node-ID sets for every superbubble
    sb_node_sets = {}
    for sb in all_sbs:
        ids = {n.id for n in sb.inside}
        ids.add(sb.source.id)
        ids.add(sb.sink.id)
        sb_node_sets[sb.key] = ids

    # Sort smallest-first so last assignment = tightest parent
    all_sbs.sort(key=lambda x: len(x.inside))
    all_sbs.reverse()  # largest first

    # Build node-to-superbubble index: which superbubbles contain each node?
    node_to_sbs = {}
    for sb in all_sbs:
        for nid in sb_node_sets[sb.key]:
            node_to_sbs.setdefault(nid, []).append(sb)

    # For every bubble, find its parent superbubble
    for bubble in graph.bubbles.values():
        b_nodes = {n.id for n in bubble.inside}
        b_nodes.add(bubble.source.id)
        b_nodes.add(bubble.sink.id)

        # Candidate parents: superbubbles that contain the bubble's source
        candidates = node_to_sbs.get(bubble.source.id, [])

        best_parent = None
        best_size = float('inf')

        for sb in candidates:
            if sb.key == bubble.key:
                continue
            sb_nodes = sb_node_sets[sb.key]
            sb_size = len(sb_nodes)
            if sb_size < best_size and b_nodes < sb_nodes:  # strict subset
                best_parent = sb
                best_size = sb_size

        if best_parent is not None:
            graph.bubbles[bubble.key].parent_sb = best_parent.id
            graph.bubbles[bubble.key].parent_chain = best_parent.chain_id

    # Propagate parent info to chains
    for chain in graph.b_chains:
        for b in chain.bubbles:
            if b.parent_sb != 0:
                chain.parent_sb = b.parent_sb
                chain.parent_chain = b.parent_chain
                break
