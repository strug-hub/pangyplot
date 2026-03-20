.. _chromosome-view:

Chromosome View
==================================

The chromosome view provides a full-chromosome perspective of the pangenome graph. Instead of showing individual nodes, it displays the graph as chain polylines at a high level, progressively revealing more detail as you zoom in.


Skeleton View
~~~~~~~~~~~~~~~~~~~

At the default zoom level, the chromosome view shows the **skeleton** — a simplified representation of the full chromosome. Chains of bubbles are drawn as polylines, with gene landmarks labeled along the reference path.

The skeleton automatically adjusts its level of detail based on the zoom level, merging small chains at wide zoom and revealing them as you zoom in.


Detail View
~~~~~~~~~~~~~~~~~~~

As you zoom into a region, the skeleton fades and is replaced by a **detail layer** showing individual chains decomposed into their bubble-segment subgraphs. Chains under a complexity threshold are expanded into force-simulated nodes and links, while larger chains remain as polylines.

Force-simulated nodes are anchored to their chain's polyline endpoints, keeping them visually connected to the surrounding context. Junction segments — naked GFA segments between chains — are also rendered to show inter-chain connectivity.


Opening the Bubble View
~~~~~~~~~~~~~~~~~~~~~~~~

To inspect a region at full resolution, hold **Shift** and drag to create a selection rectangle over one or more chains. From the selection popup, use the **Open Bubble View** action to switch to the force-directed graph viewer (see :ref:`visuals`) centered on the selected region, where individual bubbles can be popped to reveal their internal segment-level structure.
