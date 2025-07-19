from pangyplot.objects.Segment import Segment
import pangyplot.db.sqlite.segment_db as db

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
    segment_dict = dict()

    counter = 0
    for line in gfa:
        if line[0] == "S":
            segment = parse_line_S(line)
            
            segment.x1 = layout_coords[counter]["x1"]
            segment.y1 = layout_coords[counter]["y1"]
            segment.x2 = layout_coords[counter]["x2"]
            segment.y2 = layout_coords[counter]["y2"]

            db.insert_segment(cur, segment)
            segment_dict[segment.id] = segment
            counter += 1

    conn.commit()
    conn.close()
    
    return segment_dict
