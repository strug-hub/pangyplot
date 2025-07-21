def get_p_line(path):
    """
    Convert a path dictionary to a GFA P-line string using PanSN-style naming.
    Format: P\tHG002#1#chr7\t123+,124-,...
    """
    sample = path["sample"]
    contig = path["contig"]
    hap = path.get("hap") or "0"

    path_id = f"{sample}#{hap}#{contig}"
    segments = ",".join(path["path"])

    return f"P\t{path_id}\t{segments}\t0M"

def get_s_line(node):
    seq = node.get("sequence", "*")
    return f"S\t{node['id']}\t{seq}"

def get_l_line(link):
    return f"L\t{link['source']}\t{link['from_strand']}\t{link['target']}\t{link['to_strand']}\t0M"


def get_gfa_header():
    return "H\tVN:Z:1.0"
    