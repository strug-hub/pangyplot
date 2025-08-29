from collections import defaultdict
import pangyplot.parser.gfa.parse_utils as utils

def parse_line_P(line):
    path = dict()
    cols = line.strip().split("\t")

    path["full_id"] = cols[1]
    sampleInfo = utils.parse_id_string(cols[1])

    path["sample"] = sampleInfo["genome"]
    path["contig"] = sampleInfo["chrom"]
    path["hap"] = sampleInfo["hap"]
    path["start"] = sampleInfo["start"]
    path["path"] = cols[2].split(",")

    return path

def path_from_W(path_str):
    path = []
    pos = 0
    for i, char in enumerate(path_str):
        if char in "><":
            if i != 0:
                seg_id = path_str[pos:i]
                strand = "+" if path_str[i - 1] == ">" else "-"
                path.append(strand + seg_id)
            pos = i + 1
    # Append last
    seg_id = path_str[pos:]
    strand = "+" if path_str[pos - 1] == ">" else "-"
    path.append(strand + seg_id)
    return path

def parse_line_W(line):
    path = dict()
    cols = line.strip().split("\t")

    path["sample"] = cols[1]
    path["full_id"] = cols[1]
    path["hap"] = cols[2]
    path["start"] = cols[4]
    path["end"] = cols[5]
    path["path"] = path_from_W(cols[6])

    return path

def parse_paths(gfa, ref_path):
    sample_idx = dict()
    next_idx = 0
    path_dict = defaultdict(int)
    matching_refs = []

    def collapse_binary(path):
        nonlocal next_idx

        suffix = "" if path["hap"] is None else "." + path["hap"]
        pid = path["sample"] + suffix

        if pid not in sample_idx:
            sample_idx[pid] = next_idx
            next_idx += 1
        idx = sample_idx[pid]

        #compresses path links into a binary number stored as integer
        path_list = path["path"]
        for i in range(len(path_list) - 1):
            key = path_list[i] + path_list[i + 1]
            path_dict[key] |= (1 << idx)

        return idx

    reference_path = None

    for line in gfa:
        if line[0] in "PW":
            path = parse_line_P(line) if line[0] == "P" else parse_line_W(line)
            
            collapse_binary(path)

            if ref_path in path["full_id"]:
                matching_refs.append(path["full_id"])
                reference_path = path

    path_info = (sample_idx, path_dict)
    reference_info = (reference_path, matching_refs)
    
    return path_info, reference_info