import json
from pangyplot.objects.Bubble import Bubble
from pangyplot.db.sqlite.db_utils import get_connection
import pangyplot.db.sqlite.db_utils as utils

DB_NAME = "bubbles.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def create_bubble_tables(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE bubbles (
            id INTEGER PRIMARY KEY,
            chain TEXT,
            chain_step INTEGER,
            subtype TEXT,
            parent INTEGER,
            children TEXT,
            siblings TEXT,
            source INTEGER,
            compacted_source TEXT,
            sink INTEGER,
            compacted_sink TEXT,
            inside TEXT,
            range_exclusive TEXT,
            range_inclusive TEXT,
            length INTEGER,
            gc_count INTEGER,
            n_counts INTEGER
        );
    """)

    conn.commit()
    return conn

def insert_bubble(cur, bubble):
    cur.execute("""
        INSERT INTO bubbles (
            id, chain, chain_step, subtype, parent,
            children, siblings,
            source, compacted_source, sink, compacted_sink,
            inside, range_exclusive, range_inclusive,
            length, gc_count, n_counts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        bubble.id,
        bubble.chain,
        bubble.chain_step,
        bubble.subtype,
        bubble.parent,
        json.dumps(bubble.children),
        json.dumps(bubble._siblings),
        bubble._source,
        json.dumps(bubble._compacted_source),
        bubble._sink,
        json.dumps(bubble._compacted_sink),
        json.dumps(sorted(bubble.inside)),  # Convert set to list
        json.dumps(bubble._range_exclusive),
        json.dumps(bubble._range_inclusive),
        bubble.length,
        bubble.gc_count,
        bubble.n_counts
    ))

def insert_bubbles(conn, bubbles):
    cur = conn.cursor()
    for bubble in bubbles:
        insert_bubble(cur, bubble)
    conn.commit()

def create_bubble(row):
    bubble = Bubble()
    bubble.id = row["id"]
    bubble.chain = row["chain"]
    bubble.chain_step = row["chain_step"]
    bubble.subtype = row["subtype"]
    bubble.parent = row["parent"]
    bubble.children = json.loads(row["children"])
    bubble._siblings = json.loads(row["siblings"])
    bubble._source = row["source"]
    bubble._compacted_source = json.loads(row["compacted_source"])
    bubble._sink = row["sink"]
    bubble._compacted_sink = json.loads(row["compacted_sink"])
    bubble.inside = set(json.loads(row["inside"]))
    bubble._range_exclusive = json.loads(row["range_exclusive"])
    bubble._range_inclusive = json.loads(row["range_inclusive"])
    bubble.length = row["length"]
    bubble.gc_count = row["gc_count"]
    bubble.n_counts = row["n_counts"]
    return bubble

def load_parentless_bubbles(cur):
    cur.execute("SELECT * FROM bubbles WHERE parent IS NULL")
    return [create_bubble(row) for row in cur.fetchall()]

def get_bubble(cur, bubble_id):
    cur.execute("SELECT * FROM bubbles WHERE id = ?", (bubble_id,))
    row = cur.fetchone()
    if row is None:
        return None
    return create_bubble(row)

def count_bubbles(chr_dir):
    conn = utils.get_connection(chr_dir, DB_NAME)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM bubbles")
    return int(cur.fetchone()[0])