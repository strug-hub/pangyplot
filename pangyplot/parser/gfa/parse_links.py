from collections import defaultdict
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

def reverse_key(key):
    def flip(stranded_id):
        seg_id = stranded_id[:-1]
        strand = stranded_id[-1]
        flipped_strand = '-' if strand == '+' else '+'
        return seg_id + flipped_strand

    from_key, to_key = key
    return (flip(to_key), flip(from_key))

def parse_links(gfa, sample_idx, path_dict, dir):
    conn = db.create_link_table(dir, sample_idx)
    cur = conn.cursor()
    link_dict = defaultdict(list)

    def process_path_information(link):
        n = len(sample_idx)

        key = (f"{link.from_id}{link.from_strand}",
               f"{link.to_id}{link.to_strand}")
        keyReverse = reverse_key(key)

        mask = 0
        if key in path_dict:
            mask |= path_dict[key]
        if keyReverse in path_dict:
            mask |= path_dict[keyReverse]
            
        # We store the haplotype bitmask as a hex string (e.g., '0x2fa')
        # to avoid integer overflow in Neo4j Bolt protocol (>64-bit ints not supported)
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
    
    return link_dict