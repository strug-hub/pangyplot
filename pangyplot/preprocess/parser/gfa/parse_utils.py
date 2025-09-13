import re

def parse_reference_string(str, ref):

    if "|" in str:
        chrom = str.split("|")[-1]
        genome = str.split("|")[0]
        if genome.startswith("id="):
            genome = genome[3:]
    elif "#" in str:
        genome = str.split("#")[0]
        chrom = str.split("#")[-1]
    else:
        genome = ref
        chrom = ref

    return {"chrom": chrom, "genome": genome}


# 2 elements example:
# CHM13#chr7

# >2 elements example:
# GRCh38#0#chr5[10000-626046]
# GENOME#HAP#CHR[START-END]

def pound_separated(reference_str, start=0):
    genome = None
    chrom = None
    start = start
    hap = None

    parts = reference_str.split("#")
    
    bracket_match = re.search(r"\[(\d+)-(\d+)\]$", parts[-1])
    if bracket_match:
        start += int(bracket_match.group(1))
        parts[-1] = re.sub(r"\[\d+-\d+\]$", "", parts[-1])
        
    genome = parts[0]

    if len(parts) == 2:
        hap = None
        chrom = parts[1]

    elif len(parts) > 2:
        hap = parts[1]
        chrom = parts[2]

    return {"chrom": chrom, "genome": genome, "hap":hap, "start": start}

def parse_id_string(reference_str):
    chrom = None
    genome = None
    hap = None
    start = 0

    # Regex to check for pattern :[number]-[number] at the end
    match = re.search(r":(\d+)-\d+$", reference_str)
    if match:
        start = int(match.group(1))
        reference_str = reference_str.rsplit(":", 1)[0]

    if "#" in reference_str:
        return pound_separated(reference_str, start)
    else:
        if "|" in reference_str:
            chrom = reference_str.split("|")[-1]
            genome = reference_str.split("|")[0]
            if genome.startswith("id="):
                genome = genome[3:]
        else:
            genome = reference_str
            chrom = reference_str
    
    return {"chrom": chrom, "genome": genome, "hap": hap, "start": start}
