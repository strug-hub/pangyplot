import json
from pangyplot.objects.Bubble import Bubble
from pangyplot.db.db_utils import get_connection
import pangyplot.db.db_utils as utils

DB_NAME = "bubbles.db"

def get_connection(dir):
    return utils.get_connection(dir, DB_NAME)

def create_bubble_link_table(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=False)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE bubble_link (
            id INTEGER PRIMARY KEY,
            link_id TEXT,
            internal BOOLEAN
        );
    """)

    conn.commit()
    return conn

def insert_bubble_link(cur, bubble_id, link_id, internal):
    cur.execute("""
        INSERT INTO bubble_link (
            id, link_id, internal
        ) VALUES (?, ?, ?)
    """, (
        bubble_id,
        link_id,
        internal
    ))

def insert_bubble_links(dir, bubble_id, bubble_links, internal):
    conn = get_connection(dir)
    cur = conn.cursor()
    for link in bubble_links:
        print(f"Inserting link {link} for bubble {bubble_id} (internal={internal})")
        insert_bubble_link(cur, bubble_id, link, internal)
    conn.commit()

def insert_internal_links(dir, bubble_id, bubble_links):
    insert_bubble_links(dir, bubble_id, bubble_links, internal=True)

def insert_external_links(dir, bubble_id, bubble_links):
    insert_bubble_links(dir, bubble_id, bubble_links, internal=False)

def get_link_ids(dir, bubble_id):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM bubble_link WHERE id = ?", (bubble_id,))

    rows = cur.fetchall()
    if rows is None:
        return []
    results = {"internal": [], "external": []}
    for row in rows:
        if row["internal"]:
            results["internal"].append(row["link_id"])
        else:
            results["external"].append(row["link_id"])
    return results
