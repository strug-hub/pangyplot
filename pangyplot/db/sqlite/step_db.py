import pangyplot.db.sqlite.db_utils as utils

DB_NAME = "step_index.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def write_step_index(segments, path, dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE step_index (
            step INTEGER PRIMARY KEY,
            seg_id INTEGER NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL
        );
    """)
    cur.execute("CREATE INDEX idx_seg_id ON step_index(seg_id);")

    pos = 1
    for i, step in enumerate(path["path"]):
        sid = int(step[:-1])
        length = segments[sid].length
        start = pos
        end = pos + length - 1
        cur.execute("INSERT INTO step_index (step, seg_id, start, end) VALUES (?, ?, ?, ?)",
                    (i, sid, start, end))
        pos += length

    conn.commit()
    conn.close()

def load_steps(cur):
    cur.execute("SELECT step, seg_id, start, end FROM step_index ORDER BY step")
    return cur.fetchall()

def get_step(cur, step):
    cur.execute("SELECT * FROM step_index WHERE step = ?", (step,))
    return cur.fetchone()

def get_segment_steps(cur, seg_id):
    cur.execute("SELECT step FROM step_index WHERE seg_id = ? ORDER BY step", (seg_id,))
    return [row["step"] for row in cur.fetchall()]
