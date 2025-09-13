import gzip

def get_reader(layout):
    if layout.endswith(".gz"):
        return gzip.open(layout, 'rt')
    return open(layout)

def parse_lines(line1, line2):

    cols1 = line1.strip().split("\t")
    cols2 = line2.strip().split("\t")
    id = int(int(cols1[0])/2)

    result = dict()
    result["id"] = str(id)
    result["x1"] = float(cols1[1])
    result["y1"] = float(cols1[2])
    result["x2"] = float(cols2[1])
    result["y2"] = float(cols2[2])

    return result

def parse_layout(layout):
    count = 0
    prevLine = None
    skipFirstLine = True
    layoutCoords = []
    
    with get_reader(layout) as file:
        for line in file:
            if skipFirstLine:
                skipFirstLine=False
                continue

            count += 1
            if count % 2 == 0:
                coords = parse_lines(prevLine, line)
                if coords:
                    layoutCoords.append(coords)

            prevLine = line

    return layoutCoords