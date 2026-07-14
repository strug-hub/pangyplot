import logging
import pdb
from BubbleGun.BubbleChain import BubbleChain, node_sort_key


def connect_bubbles(graph):
    """
    takes a graph object and connects the individual bubbles into chains and add them back to graph object
    """

    # counter = 0
    ids_to_bubbles = dict()
    for b in graph.bubbles.values():
        # if counter % 50000 == 0:
        #     logging.info(f"Processed {counter} bubbles in the first loop...")
        # counter += 1
        ids_to_bubbles.setdefault(b.source.id, set()).add(b)
        ids_to_bubbles.setdefault(b.sink.id, set()).add(b)

    starting_nodes = [x for x, bubbles in ids_to_bubbles.items() if len(bubbles) == 1]
    logging.info(f"Got the {len(starting_nodes)} starting nodes of bubbles to construct chains...")

    def build_chain(start_node):
        # logging.info(f"Building chain starting at node {start_node}...")
        chain = BubbleChain()
        current_n = start_node
        while True:
            # if len(chain) % 10000 == 0:
            #     logging.info(f"Built chain {chain.id} of length {len(chain)}...")

            bubbles_at_node = ids_to_bubbles.get(current_n)
            if not bubbles_at_node:
                break
            current_b = bubbles_at_node.pop()
            chain.add_bubble(current_b)
            if current_n == current_b.source.id:
                next_n = current_b.sink.id
            else:
                next_n = current_b.source.id
            next_set = ids_to_bubbles.get(next_n)
            if next_set is not None:
                next_set.discard(current_b)
            current_n = next_n
        return chain

    # a source or a sink can be part of two bubbles at most
    # so sets in ids_to_bubbles can only be 1 or 2 in length
    counter = 0
    for n in starting_nodes:
        # if counter % 50000 == 0:
        #     logging.info(f"Processed {counter} starting nodes in the second loop...")
        counter += 1
        if not ids_to_bubbles.get(n):
            continue
        chain = build_chain(n)
        if len(chain) != 0:
            chain.find_ends()
            graph.add_chain(chain)  # get sorted and ends found when added to graph

    # handle remaining bubbles (e.g. circular chains with no degree-1 ends)
    for n, bubbles in ids_to_bubbles.items():
        if not bubbles:
            continue
        chain = build_chain(n)
        if len(chain) != 0:
            chain.find_ends()
            graph.add_chain(chain)  # get sorted and ends found when added to graph

    # filling bubbles and chains ids
    # graph.b_chains is a set of chains hashed on their end node-id strings, so
    # iterating it directly numbers the chains in a PYTHONHASHSEED-dependent
    # order: the same graph produces different bubble/chain ids on every build.
    # Chains are uniquely identified by their (sorted) ends, so that is a stable
    # total order.
    b_counter = 1
    chain_counter = 1
    # sorted() on the ends too: their order within c.ends comes from a set as
    # well, and only the pair identifies the chain — not which end came first.
    for chain in sorted(graph.b_chains,
                        key=lambda c: sorted(node_sort_key(e) for e in c.ends)):
        chain.id = chain_counter

        for b in chain.sorted:
            b.id = b_counter
            b.chain_id = chain.id
            b_counter += 1
        chain_counter += 1

    # pdb.set_trace()
