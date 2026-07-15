from pangyplot.objects.Link import Link

def parse_line_L(line):
    link = Link()
    cols = line.strip().split("\t")

    link.from_id = int(cols[1])
    link.from_strand = cols[2]
    link.to_id = int(cols[3])
    link.to_strand = cols[4]
    return link
