def deduplicate_links(links):
    link_ids = set()
    dedup = []
    for link in links:
        if link is None:
            continue
        key = link.id()
        if key in link_ids:
            continue
        link_ids.add(key)
        dedup.append(link)
    return dedup

def deduplicate_nodes(nodes):
    node_ids = set()
    dedup = []
    for node in nodes:
        if node is None or node.id in node_ids:
            continue
        node_ids.add(node.id)
        dedup.append(node)
    return dedup

def remove_invalid_links(nodes, links, ids=None):
    if ids is None:
        ids={node.id for node in nodes}
    keepLinks = []
    for link in links:
        if link.to_id not in ids or link.from_id not in ids:
            continue
        keepLinks.append(link)
    return keepLinks

