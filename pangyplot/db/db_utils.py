import os
import sqlite3
import json
import gzip
import threading

_local = threading.local()

def get_connection(dir, filename, clear_existing=False):
    db_path = os.path.join(dir, filename)

    if clear_existing:
        if os.path.exists(db_path):
            os.remove(db_path)
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    cache = getattr(_local, 'connections', None)
    if cache is None:
        cache = {}
        _local.connections = cache

    if db_path in cache:
        return cache[db_path]

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cache[db_path] = conn
    return conn

def dump_json(data, file_path):
    if not file_path.endswith(".gz"):
        file_path += ".gz"
    with gzip.open(file_path, 'wt', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

def load_json(file_path):
    if not file_path.endswith(".gz"):
        file_path += ".gz"
    if not os.path.exists(file_path):
        return None
    with gzip.open(file_path, 'rt', encoding='utf-8') as f:
        return json.load(f)
