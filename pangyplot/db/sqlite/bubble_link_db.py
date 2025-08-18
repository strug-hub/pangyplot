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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bubble_id INTEGER,
            link_id TEXT,
            internal BOOLEAN
        );
    """)

    cur.execute("CREATE INDEX idx_bubble_id ON bubble_link(bubble_id)")


    cur.execute("""
        CREATE TABLE bubble_stack (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bubble_id INTEGER,
            parent_id INTEGER,
            distance INTEGER
        );
    """)

    cur.execute("CREATE INDEX idx_bubble_child ON bubble_stack(child_id)")


    conn.commit()
    return conn

def insert_bubble_link(cur, bubble_id, link_id, internal):
    cur.execute("""
        INSERT INTO bubble_link (
            bubble_id, link_id, internal
        ) VALUES (?, ?, ?)
    """, (
        bubble_id,
        link_id,
        internal
    ))

def insert_bubble_links(dir, bubble_link_pairs, internal):
    conn = get_connection(dir)
    cur = conn.cursor()
    for bubble_id, link_id in bubble_link_pairs:
        insert_bubble_link(cur, bubble_id, link_id, internal)
    conn.commit()

def insert_internal_links(dir, bubble_link_pairs):
    insert_bubble_links(dir, bubble_link_pairs, internal=True)

def insert_external_links(dir, bubble_link_pairs):
    insert_bubble_links(dir, bubble_link_pairs, internal=False)

def get_link_ids(dir, bubble_id):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM bubble_link WHERE bubble_id = ?", (bubble_id,))

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

def insert_bubble_relationship(cur, child_id, parent_id, distance):
    cur.execute("""
        INSERT INTO bubble_stack (
            child_id, parent_id, distance
        ) VALUES (?, ?, ?)
    """, (
        child_id,
        parent_id,
        distance
    ))
    
def insert_bubble_relationships(dir, relationships):
    conn = get_connection(dir)
    cur = conn.cursor()
    for child_id, parent_id, distance in relationships:
        insert_bubble_relationship(cur, child_id, parent_id, distance)
    conn.commit()

def get_parents(dir, bubble_id):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT * FROM bubble_link WHERE bubble_id = ?", (bubble_id,))

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
