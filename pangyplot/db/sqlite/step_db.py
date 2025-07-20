import pangyplot.db.sqlite.db_utils as utils

DB_NAME = "step_index.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def write_step_index(segments, genome, path, dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE step_index (
            step INTEGER NOT NULL,
            seg_id INTEGER NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            genome TEXT NOT NULL,
            PRIMARY KEY (genome, step)
        );
    """)
    cur.execute("CREATE INDEX idx_seg_id ON step_index(seg_id);")
    cur.execute("CREATE INDEX idx_genome ON step_index(genome);")

    pos = 1
    for i, step in enumerate(path["path"]):
        sid = int(step[:-1])
        length = segments[sid].length
        start = pos
        end = pos + length - 1
        cur.execute("INSERT INTO step_index (step, seg_id, start, end, genome) VALUES (?, ?, ?, ?, ?)",
                    (i, sid, start, end, genome))
        pos += length

    conn.commit()
    conn.close()

def load_steps(cur, genome):
    cur.execute("SELECT step, seg_id, start, end FROM step_index WHERE genome = ? ORDER BY step", (genome,))
    return cur.fetchall()

def get_step(cur, step, genome):
    cur.execute("SELECT * FROM step_index WHERE genome = ? AND step = ?", (genome, step))
    return cur.fetchone()

def get_segment_steps(cur, seg_id, genome):
    cur.execute("SELECT step FROM step_index WHERE genome = ? AND seg_id = ? ORDER BY step", (genome, seg_id))
    return [row["step"] for row in cur.fetchall()]
