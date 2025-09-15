import pangyplot.db.db_utils as utils
from pangyplot.objects.Segment import Segment
import statistics

DB_NAME="segments.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def create_segment_table(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS segments (
            id INTEGER PRIMARY KEY,
            gc_count INTEGER NOT NULL,
            n_count INTEGER NOT NULL,
            length INTEGER NOT NULL,
            x1 REAL NOT NULL,
            y1 REAL NOT NULL,
            x2 REAL NOT NULL,
            y2 REAL NOT NULL,
            seq TEXT NOT NULL
        );
    """)
    conn.commit()
    return conn

def get_max_id(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT MAX(id) FROM segments")
    return cur.fetchone()[0]

def insert_segment(cur, segment):
    cur.execute("""
        INSERT INTO segments (id, gc_count, n_count, length, x1, y1, x2, y2, seq)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        segment.id,
        segment.gc_count,
        segment.n_count,
        segment.length,
        segment.x1,
        segment.y1,
        segment.x2,
        segment.y2,
        segment.seq
    ))

def get_index_info(dir):
    cur = get_connection(dir).cursor()
    for row in cur.execute("SELECT id, length, x1, y1, x2, y2 FROM segments"):
        yield row

def get_all(dir, step_index=None):
    cur = get_connection(dir).cursor()
    for row in cur.execute("SELECT * FROM segments"):
        yield create_segment(row, step_index)

def create_segment(row, step_index=None):
    segment = Segment()
    segment.id = row["id"]
    segment.gc_count = row["gc_count"]
    segment.n_count = row["n_count"]
    segment.length = row["length"]
    segment.x1 = row["x1"]
    segment.y1 = row["y1"]
    segment.x2 = row["x2"]
    segment.y2 = row["y2"]
    segment.seq = row["seq"]
    
    if step_index:
        segment.add_step(step_index)

    return segment

def get_segment(dir, seg_id, step_index=None):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM segments WHERE id = ?", (seg_id,))
    row = cur.fetchone()
    if row:
        return create_segment(row, step_index)
    return None

def get_segment_range(dir, start_id, end_id, step_index=None):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM segments WHERE id BETWEEN ? AND ?", (start_id, end_id))
    rows = cur.fetchall()
    return [create_segment(row, step_index) for row in rows]

def count_segments(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT COUNT(*) FROM segments")
    return int(cur.fetchone()[0])


def summarize_segments(dir):
    cur = get_connection(dir).cursor()

    # Basic counts
    cur.execute("SELECT COUNT(*), MIN(id), MAX(id) FROM segments")
    n_segments, min_id, max_id = cur.fetchone()

    # Length stats
    cur.execute("SELECT length FROM segments")
    lengths = [row["length"] for row in cur.fetchall()]
    min_len = min(lengths)
    max_len = max(lengths)
    mean_len = sum(lengths) / len(lengths)
    median_len = statistics.median(lengths)

    # GC/N stats
    cur.execute("SELECT SUM(gc_count), SUM(n_count), SUM(length) FROM segments")
    gc_sum, n_sum, total_len = cur.fetchone()
    gc_percent = (gc_sum / total_len) * 100 if total_len > 0 else 0
    n_percent = (n_sum / total_len) * 100 if total_len > 0 else 0

    # Layout bounding box
    cur.execute("SELECT MIN(x1), MAX(x1), MIN(y1), MAX(y1), MIN(x2), MAX(x2), MIN(y2), MAX(y2) FROM segments")
    x1_min, x1_max, y1_min, y1_max, x2_min, x2_max, y2_min, y2_max = cur.fetchone()

    return {
        "n_segments": n_segments,
        "id_range": (min_id, max_id),
        "lengths": {
            "min": min_len,
            "max": max_len,
            "mean": mean_len,
            "median": median_len,
        },
        "bases": {
            "total_length": total_len,
            "gc_count": gc_sum,
            "n_count": n_sum,
            "gc_percent": gc_percent,
            "n_percent": n_percent,
        },
        "layout": {
            "x1_range": (x1_min, x1_max),
            "y1_range": (y1_min, y1_max),
            "x2_range": (x2_min, x2_max),
            "y2_range": (y2_min, y2_max),
        }
    }
