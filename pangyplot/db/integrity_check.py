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

def remove_invalid_links(nodes, links, nodeids=None):
    if nodeids is None:
        nodeids={node.id for node in nodes}
    keepLinks = []
    for link in links:
        if link.to_id not in nodeids or link.from_id not in nodeids:
            continue
        keepLinks.append(link)
    return keepLinks

