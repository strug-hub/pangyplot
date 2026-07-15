import pangyplot.db.db_utils as utils
from pangyplot.objects.Link import Link

DB_NAME = "links.db"

def get_connection(dir):
    return utils.get_connection(dir, DB_NAME)

def create_link_table(dir, bulk=False):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    if bulk:
        cur.execute("PRAGMA page_size = 8192")
        cur.execute("PRAGMA journal_mode = OFF")
        cur.execute("PRAGMA synchronous = OFF")
        cur.execute("PRAGMA cache_size = -64000")
        cur.execute("PRAGMA temp_store = MEMORY")
        cur.execute("PRAGMA mmap_size = 268435456")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY,
            from_id INTEGER NOT NULL,
            from_strand TEXT NOT NULL,
            to_id INTEGER NOT NULL,
            to_strand TEXT NOT NULL,
            frequency REAL NOT NULL
        );
    """)

    if not bulk:
        cur.execute("CREATE INDEX IF NOT EXISTS idx_from_id ON links(from_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_to_id ON links(to_id);")

    conn.commit()
    return conn

def create_link_indexes(conn):
    cur = conn.cursor()
    cur.execute("CREATE INDEX IF NOT EXISTS idx_from_id ON links(from_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_to_id ON links(to_id);")
    conn.commit()

def insert_link(cur, link):
    key = f"{link.from_id}{link.from_strand}{link.to_id}{link.to_strand}"
    cur.execute("""
        INSERT INTO links (id, from_id, from_strand, to_id, to_strand, frequency)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        key,
        link.from_id,
        link.from_strand,
        link.to_id,
        link.to_strand,
        link.frequency
    ))

def insert_links_batch(cur, batch):
    cur.executemany("""
        INSERT INTO links (id, from_id, from_strand, to_id, to_strand, frequency)
        VALUES (?, ?, ?, ?, ?, ?)
    """, batch)

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

def get_all(dir):
    cur = get_connection(dir).cursor()
    for row in cur.execute("SELECT * FROM links"):
        yield create_link(row)

def summarize_links(dir, top_n=10):
    cur = get_connection(dir).cursor()

    # Basic counts
    cur.execute("SELECT COUNT(*) FROM links")
    n_links = cur.fetchone()[0]

    # Strand orientation distribution
    cur.execute("""
        SELECT from_strand || to_strand AS orientation, COUNT(*) as n
        FROM links
        GROUP BY orientation
        ORDER BY n DESC
    """)
    orientations = {row["orientation"]: row["n"] for row in cur.fetchall()}

    # Frequency stats
    cur.execute("SELECT MIN(frequency), MAX(frequency), AVG(frequency) FROM links")
    min_freq, max_freq, mean_freq = cur.fetchone()

    return {
        "n_links": n_links,
        "orientations": orientations,
        "frequency": {
            "min": min_freq,
            "max": max_freq,
            "mean": mean_freq,
        }
    }
