import json
import gzip

def get_reader(path):
    if path.endswith(".gz"):
        return gzip.open(path, 'rt')
    return open(path, 'r')

def parse_odgi_layout(path):
    def parse_lines(line1, line2):
        cols1 = line1.strip().split("\t")
        cols2 = line2.strip().split("\t")
        return {
            "x1": float(cols1[1]),
            "y1": float(cols1[2]),
            "x2": float(cols2[1]),
            "y2": float(cols2[2])
        }

    layout_coords = []
    count = 0
    prevLine = None
    skipFirstLine = True
    
    with get_reader(path) as f:
        for line in f:
            if skipFirstLine:
                skipFirstLine = False
                continue

            count += 1
            if count % 2 == 0:
                coords = parse_lines(prevLine, line)
                if coords:
                    layout_coords.append(coords)

            prevLine = line

    return {"type": "odgi", "layout": layout_coords}

def parse_bandage_layout(path):
    layout_coords = dict()
    with get_reader(path) as f:
        data = json.load(f)

    for node_id, coords in data.items():
        if not coords:
            continue
        start = coords[0]
        end = coords[-1]
        
        node_id = ''.join(filter(str.isdigit, node_id))
        layout_coords[int(node_id)] = {
            "x1": float(start[0]),
            "y1": float(start[1]),
            "x2": float(end[0]),
            "y2": float(end[1])
        }

    return  {"type": "bandage", "layout": layout_coords}

def parse_layout(path):
    with get_reader(path) as f:
        first_line = f.readline()
    
    # Bandage layout is JSON (starts with '{' or whitespace + '{')
    if first_line.strip().startswith("{"):
        return parse_bandage_layout(path)
    else:
        return parse_odgi_layout(path)
    