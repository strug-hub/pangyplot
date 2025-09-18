from pangyplot.objects.Segment import Segment
import pangyplot.db.sqlite.segment_db as db
from pangyplot.db.indexes.SegmentIndex import SegmentIndex

def parse_line_S(line):
    cols = line.strip().split("\t")
    segment = Segment()
    segment.id = int(cols[1])
    seq = cols[2].upper()
    segment.seq = seq
    segment.gc_count = seq.count('G') + seq.count('C')
    segment.n_count = seq.count('N')
    segment.length = len(seq)
    return segment

def parse_segments(gfa, layout_coords, dir):
    conn = db.create_segment_table(dir)
    cur = conn.cursor()

    layout = layout_coords["layout"]
    layout_type = layout_coords["type"]
    
    counter = 0
    for line in gfa:
        if line[0] == "S":
            segment = parse_line_S(line)
            if layout_type == "odgi":
                coords = layout[counter]
            elif layout_type == "bandage":
                coords = layout[segment.id]

            segment.x1 = coords["x1"]
            segment.y1 = coords["y1"]
            segment.x2 = coords["x2"]
            segment.y2 = coords["y2"]

            db.insert_segment(cur, segment)
            counter += 1

    conn.commit()
    conn.close()

    segment_idx = SegmentIndex(dir)

    return segment_idx
