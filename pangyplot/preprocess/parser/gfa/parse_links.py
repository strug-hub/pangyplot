from collections import defaultdict
from pangyplot.db.indexes.LinkIndex import LinkIndex
import pangyplot.db.sqlite.link_db as db
from pangyplot.objects.Link import Link

def parse_line_L(line):
    link = Link()
    cols = line.strip().split("\t")

    link.from_id = int(cols[1])
    link.from_strand = cols[2]
    link.to_id = int(cols[3])
    link.to_strand = cols[4]
    return link

def parse_links(gfa, path_idx, path_dict, dir):
    conn = db.create_link_table(dir)
    cur = conn.cursor()
    link_dict = defaultdict(list)

    def process_path_information(link):
        n = len(path_idx)

        key = link.id()
        keyReverse = link.reverse_id()

        mask = 0
        if key in path_dict:
            mask |= path_dict[key]
        if keyReverse in path_dict:
            mask |= path_dict[keyReverse]
            
        # We store the haplotype bitmask as a hex string (e.g., '0x2fa')
        link.haplotype = hex(mask)[2:]  # e.g., '2fa'
        link.frequency = bin(mask).count("1") / n
        link.reverse = hex(path_dict.get(keyReverse, 0))[2:]
        return link
    
    for line in gfa:
        if line[0] == "L":
            link = parse_line_L(line)
            link = process_path_information(link)
            db.insert_link(cur, link)
            fid = link.from_id
            tid = link.to_id
            link_dict[(fid,tid)] = link

    conn.commit()
    conn.close()

    link_idx = LinkIndex(dir)
    return link_idx