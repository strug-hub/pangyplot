import pangyplot.db.db_utils as utils
from pangyplot.objects.Link import Link

DB_NAME = "links.db"

def get_connection(dir):
    return utils.get_connection(dir, DB_NAME)

def create_link_table(dir, sample_idx):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            from_id INTEGER NOT NULL,
            from_strand TEXT NOT NULL,
            to_id INTEGER NOT NULL,
            to_strand TEXT NOT NULL,
            haplotype TEXT NOT NULL,
            reverse TEXT NOT NULL,
            frequency REAL NOT NULL
        );
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_from_id ON links(from_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_to_id ON links(to_id);")

    cur.execute("CREATE TABLE IF NOT EXISTS sample_index ("
                "sample TEXT PRIMARY KEY,"
                "idx INTEGER NOT NULL"
                ");")
    
    cur.executemany("""
        INSERT INTO sample_index (sample, idx)
        VALUES (?, ?)
    """, sample_idx.items())

    conn.commit()
    return conn

def insert_link(cur, link):
    key = f"{link.from_id}{link.from_strand}{link.to_id}{link.to_strand}"
    cur.execute("""
        INSERT INTO links (id, from_id, from_strand, to_id, to_strand, haplotype, reverse, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        key,
        link.from_id,
        link.from_strand,
        link.to_id,
        link.to_strand,
        link.haplotype,
        link.reverse,
        link.frequency
    ))

def load_sample_index(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT sample, idx FROM sample_index")
    return {row["sample"]: row["idx"] for row in cur.fetchall()}

def load_links(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT from_id, to_id, from_strand, to_strand FROM links")
    return cur.fetchall()

def create_link(row):
    link = Link()
    link.from_id = row["from_id"]
    link.from_strand = row["from_strand"]
    link.to_id = row["to_id"]
    link.to_strand = row["to_strand"]
    link.haplotype = row["haplotype"]
    link.reverse = row["reverse"]
    link.frequency = row["frequency"]
    return link

def get_link(dir, key, cur=None):
    if cur is None:
        cur = get_connection(dir).cursor()
    
    key = key.replace("s", "")
    cur.execute("SELECT * FROM links WHERE id = ?", (key,))
    row = cur.fetchone()
    if row:
        return create_link(row)
    return None

def count_links(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT COUNT(*) FROM links")
    return int(cur.fetchone()[0])

def get_link_by_ids(dir, link_ids):
    cur = get_connection(dir).cursor()
    links = [get_link(dir, link_id, cur) for link_id in link_ids]
    return [link for link in links if link is not None]