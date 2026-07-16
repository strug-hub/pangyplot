import json
import gzip
from array import array

from pangyplot.utils.layout_reader import read_lay

def get_reader(path):
    if path.endswith(".gz"):
        return gzip.open(path, 'rt')
    return open(path, 'r')


def get_binary_reader(path):
    if path.endswith(".gz"):
        return gzip.open(path, 'rb')
    return open(path, 'rb')


def _read_head(path, n=16):
    with get_binary_reader(path) as f:
        return f.read(n)


def _is_text(head):
    # odgi's .lay opens with the raw bytes of a double, which for any real
    # layout include unprintable bytes; both text formats are ASCII.
    return all(0x20 <= b < 0x7F or b in (0x09, 0x0A, 0x0D) for b in head)


class OdgiLayout:
    """Layout coords for every segment, held as four packed arrays.

    Indexes like the list of dicts it replaces -- `layout[i]` is still
    {"x1", "y1", "x2", "y2"} -- but that dict is built on access rather than
    stored. A dict per segment cost ~300 B against 32 B here, which on v2 chrY
    is 0.32 G held for the whole run (add.py keeps layout_coords in scope long
    after parse, and it sits underneath the peak).
    """

    __slots__ = ["x1", "y1", "x2", "y2"]

    def __init__(self, x1, y1, x2, y2):
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2

    def __len__(self):
        return len(self.x1)

    def __getitem__(self, i):
        return {"x1": self.x1[i], "y1": self.y1[i],
                "x2": self.x2[i], "y2": self.y2[i]}

    def __iter__(self):
        for i in range(len(self)):
            yield self[i]


def parse_odgi_layout(path):
    # array('d') keeps the coords packed while reading; a list of Python floats
    # would box every one of them.
    x1, y1, x2, y2 = array('d'), array('d'), array('d'), array('d')

    prevLine = None
    count = 0
    skipFirstLine = True

    with get_reader(path) as f:
        for line in f:
            if skipFirstLine:
                skipFirstLine = False
                continue

            count += 1
            if count % 2 == 0:
                cols1 = prevLine.strip().split("\t")
                cols2 = line.strip().split("\t")
                x1.append(float(cols1[1]))
                y1.append(float(cols1[2]))
                x2.append(float(cols2[1]))
                y2.append(float(cols2[2]))

            prevLine = line

    return {"type": "odgi", "layout": OdgiLayout(x1, y1, x2, y2)}

def parse_native_odgi_layout(path):
    """Parse odgi's binary .lay -- the same coords as its .lay.tsv view.

    Positional like the TSV, so it is interchangeable with it downstream.
    """
    with get_binary_reader(path) as f:
        data = f.read()

    x1, y1, x2, y2 = read_lay(data)
    return {"type": "odgi", "layout": OdgiLayout(x1, y1, x2, y2)}

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
    """Parse a layout, detecting which of the three formats it is.

    Bandage `.layout` (JSON), odgi's `.lay.tsv` (text), and odgi's native binary
    `.lay` all arrive through the same option, so the format is sniffed rather
    than declared.
    """
    head = _read_head(path)

    # Bandage layout is JSON (starts with '{' or whitespace + '{')
    if head.lstrip().startswith(b"{"):
        return parse_bandage_layout(path)
    if _is_text(head):
        return parse_odgi_layout(path)
    return parse_native_odgi_layout(path)
