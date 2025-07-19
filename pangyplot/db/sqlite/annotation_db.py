import pangyplot.db.sqlite.db_utils as utils

DB_NAME = "annotations.db"

def get_connection(chr_dir):
    return utils.get_connection(chr_dir, DB_NAME)

def create_annotation_table(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    #cur.execute("""
    #    CREATE TABLE IF NOT EXISTS annotations (

    #    );
    #""")

    conn.commit()
    return conn

def insert_annotation(cur, annotation):
    return
    cur.execute("""
        INSERT INTO annotations (segment_id, start, end, type, value)
        VALUES (?, ?, ?, ?, ?)
    """, (
        annotation.segment_id,
        annotation.start,
        annotation.end,
        annotation.type,
        annotation.value
    ))

def load_annotations(cur):
    cur.execute("SELECT * FROM annotations")
    return cur.fetchall()

def get_annotation(cur, ann_id):
    cur.execute("SELECT * FROM annotations WHERE id = ?", (ann_id,))
    return cur.fetchone()