import json
from pangyplot.objects.Bubble import Bubble
from pangyplot.db.db_utils import get_connection
import pangyplot.db.db_utils as utils

DB_NAME = "bubbles.db"

def get_connection(dir):
    return utils.get_connection(dir, DB_NAME)

def create_bubble_tables(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE bubbles (
            id INTEGER PRIMARY KEY,
            chain INTEGER,
            chain_step INTEGER,
            subtype TEXT,
            parent INTEGER,
            children TEXT,
            siblings TEXT,
            source TEXT,
            sink TEXT,
            inside TEXT,
            range_exclusive TEXT,
            range_inclusive TEXT,
            length INTEGER,
            gc_count INTEGER,
            n_count INTEGER,
            x1 FLOAT,
            x2 FLOAT,
            y1 FLOAT,
            y2 FLOAT
        );
    """)

    cur.execute("CREATE INDEX idx_bubble_chain ON bubbles(chain, chain_step)")

    conn.commit()
    return conn

def insert_bubble(cur, bubble):    
    cur.execute("""
        INSERT INTO bubbles (
            id, chain, chain_step, subtype, parent,
            children, siblings,
            source, sink,
            inside, range_exclusive, range_inclusive,
            length, gc_count, n_count, x1, x2, y1, y2
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        bubble.id,
        bubble.chain,
        bubble.chain_step,
        bubble.subtype,
        bubble.parent,
        json.dumps(bubble.children),
        json.dumps(bubble.siblings),
        json.dumps(bubble.source_segments),
        json.dumps(bubble.sink_segments),
        json.dumps(sorted(bubble.inside)),  # Convert set to list
        json.dumps(bubble.range_exclusive),
        json.dumps(bubble.range_inclusive),
        bubble.length,
        bubble.gc_count,
        bubble.n_count,
        bubble.x1,
        bubble.x2,
        bubble.y1,
        bubble.y2
    ))

def insert_bubbles(dir, bubbles):
    conn = get_connection(dir)
    cur = conn.cursor()
    for bubble in bubbles:
        insert_bubble(cur, bubble)
    conn.commit()

def create_bubble(row, gfaidx):
    bubble = Bubble()
    bubble.id = row["id"]
    bubble.chain = row["chain"]
    bubble.chain_step = row["chain_step"]
    bubble.subtype = row["subtype"]
    bubble.parent = row["parent"]
    bubble.children = json.loads(row["children"])
    bubble.siblings = json.loads(row["siblings"])
    bubble.inside = set(json.loads(row["inside"]))
    bubble.range_exclusive = json.loads(row["range_exclusive"])
    bubble.range_inclusive = json.loads(row["range_inclusive"])
    bubble.length = row["length"]
    bubble.gc_count = row["gc_count"]
    bubble.n_count = row["n_count"]
    bubble.x1 = row["x1"]
    bubble.x2 = row["x2"]
    bubble.y1 = row["y1"]
    bubble.y2 = row["y2"]

    bubble.add_source(json.loads(row["source"]))
    bubble.add_sink(json.loads(row["sink"]))

    bubble.calculate_properties(gfaidx)

    return bubble

def load_parentless_bubbles(dir, gfaidx):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM bubbles WHERE parent IS NULL")
    rows = cur.fetchall()
    return [create_bubble(row, gfaidx) for row in rows]

def get_bubble(dir, bubble_id, gfaidx):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM bubbles WHERE id = ?", (bubble_id,))
    row = cur.fetchone()
    if row is None:
        return None
    return create_bubble(row, gfaidx)

def get_bubble_ids_from_chain(dir, chain_id, start_step, end_step):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT id FROM bubbles WHERE chain = ? AND chain_step BETWEEN ? AND ?", (chain_id, start_step, end_step))
    rows = cur.fetchall()
    return [row["id"] for row in rows]

def get_chain_ends(dir, chain_id):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT id, chain_step FROM bubbles WHERE chain = ? ORDER BY chain_step ASC LIMIT 1", (chain_id,))
    start_row = cur.fetchone()
    cur.execute("SELECT id, chain_step FROM bubbles WHERE chain = ? ORDER BY chain_step DESC LIMIT 1", (chain_id,))
    end_row = cur.fetchone()
    if start_row is None or end_row is None:
        return None
    return (start_row["id"], start_row["chain_step"]), (end_row["id"], end_row["chain_step"])
    
def count_bubbles(chr_dir):
    cur = get_connection(chr_dir).cursor()
    cur.execute("SELECT COUNT(*) FROM bubbles")
    return int(cur.fetchone()[0])