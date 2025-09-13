
def parse_chromosome_list(chromosome_file):
    chromosome_list = []
    with open(chromosome_file, 'r') as file:
        for line in file:
            chrom = line.strip()
            if chrom:
                chromosome_list.append(chrom)
    return chromosome_list

def parse_cytoband(cytoband_file, chromosome_list=None):
    color_map = {
        "acen": "#CC0000",
        "gneg": "#FFFFFF",
        "gpos100": "#000000",
        "gpos25": "#CCCCCC",
        "gpos50": "#7F7F7F",
        "gpos75": "#333333",
        "gvar": "#0DCC00",
        "stalk": "#00CC83"
    }

    cytobands = dict()
    with open(cytoband_file, 'r') as file:
        for line in file:
            chrom, start, end, name, band_type = line.strip().split("\t")

            if name == "":
                name = chrom
                
            if chromosome_list and chrom not in chromosome_list:
                continue

            start = int(start)
            end = int(end)
            color = color_map.get(band_type, "#000000")

            if chrom not in cytobands:
                cytobands[chrom] = []

            band = {
                "band": len(cytobands[chrom]),
                "start": start,
                "end": end,
                "name": name,
                "type": band_type,
                "color": color,
                "chr": chrom    
            }
            cytobands[chrom].append(band)

    # Normalize sizes and positions
    for chrom in cytobands:
        total_size = max(b["end"] for b in cytobands[chrom])
        for band in cytobands[chrom]:
            band["size"] = (band["end"] - band["start"]) / total_size
            band["x"] = band["start"] / total_size

    return cytobands