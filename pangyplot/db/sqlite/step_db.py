import pangyplot.db.db_utils as utils

DB_NAME = "step_index.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def write_step_index(segment_index, genome, path, dir):
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
    cur.execute("CREATE INDEX idx_seg_id ON step_index(genome, seg_id);")
    cur.execute("CREATE INDEX idx_genome ON step_index(genome, step);")

    pos = path["start"]
    for i, step in enumerate(path["path"]):
        sid = int(step[:-1])
        length = segment_index.segment_length(sid)
        start = pos + 1
        end = pos + length
    
        cur.execute("INSERT INTO step_index (step, seg_id, start, end, genome) VALUES (?, ?, ?, ?, ?)",
                    (i, sid, start, end, genome))
        pos += length

    conn.commit()
    conn.close()

def load_steps(dir, genome):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT step, seg_id, start, end FROM step_index WHERE genome = ? ORDER BY step", (genome,))
    return cur.fetchall()

def get_step(dir, step, genome):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM step_index WHERE genome = ? AND step = ?", (genome, step))
    return cur.fetchone()

def get_segment_steps(dir, seg_id, genome):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT step FROM step_index WHERE genome = ? AND seg_id = ?", (genome, seg_id))
    return [row["step"] for row in cur.fetchall()]

def get_genomes(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT DISTINCT genome FROM step_index")
    return [row["genome"] for row in cur.fetchall()]