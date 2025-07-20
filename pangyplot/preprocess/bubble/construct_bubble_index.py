import os
from pangyplot.db.indexes.StepIndex import StepIndex
import pangyplot.preprocess.bubble.bubble_utils as utils
import pangyplot.db.sqlite.bubble_db as db
from pangyplot.utils.plot_bubbles import plot_bubbles

def construct_bubble_index(graph, chr_dir, ref, plot=False):
    step_index = StepIndex(chr_dir, ref)
    step_dict = step_index.segment_map()

    bubbles = []

    for raw_chain in graph.b_chains:
        chain_id = f"c{raw_chain.id}"
        # note: raw_chain.ends not used (do we need to?)

        if not raw_chain.sorted: 
            raw_chain.sort()

        chain_bubbles = []
        for chain_step, raw_bubble in enumerate(raw_chain.sorted):
            bubble = utils.create_bubble_object(raw_bubble, chain_id, chain_step, step_dict)

            chain_bubbles.append(bubble)

        utils.find_siblings(chain_bubbles)
        bubbles.extend(chain_bubbles)

    utils.find_parent_children(bubbles)

    db.create_bubble_tables(chr_dir)
    db.insert_bubbles(chr_dir, bubbles)

    if plot:
        plot_path = os.path.join(chr_dir, "bubbles.plot.svg")
        plot_bubbles(bubbles, output_path=plot_path)

