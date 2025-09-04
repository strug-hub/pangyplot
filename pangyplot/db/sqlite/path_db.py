import os
import json
from collections import defaultdict
from pangyplot.objects.Path import Path

DB_NAME="paths"
SAMPLE_IDX="sample_idx.json"

def store_sample_idx(dir, sample_idx):
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        os.makedirs(db_path)

    with open(os.path.join(db_path, SAMPLE_IDX), "w") as f:
        json.dump(sample_idx, f)

def retrieve_sample_idx(dir):
    db_path = os.path.join(dir, DB_NAME)
    with open(os.path.join(db_path, SAMPLE_IDX), "r") as f:
        return json.load(f)

def store_path(dir, path):
    sample = path.sample_name()
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        os.makedirs(db_path)
    with open(get_filename(db_path, sample), "w") as f:
        json.dump(path.serialize(), f)

def create_path(filename):
    path = Path()
    with open(filename, "r") as f:
        data = json.load(f)
        path.full_id = data.get("full_id")
        path.sample = data.get("sample")
        path.hap = data.get("hap")
        path.start = data.get("start")
        path.length = data.get("length")
        path.is_ref = data.get("is_ref", False)
        path.path = data.get("path", [])
    return path

def retrieve_paths(dir, sample):
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        return []
    
    paths = []
    for file in get_all_filenames(db_path, sample):
        paths.append(create_path(file))
    return paths

def get_filename(db_path, sample):
    i = 0
    while True:
        filename = os.path.join(db_path, f"{sample}__{i+1}.json")
        if not os.path.exists(filename):
            return filename
        i += 1

def get_all_filenames(db_path, sample):
    i = 0
    while True:
        filename = os.path.join(db_path, f"{sample}__{i+1}.json")
        if not os.path.exists(filename):
            break
        yield filename
        i += 1

def summarize(dir):
    db_path = os.path.join(dir, DB_NAME)
    summary = defaultdict(list)
    for filename in os.listdir(db_path):
        if filename.endswith(".json"):
            if "__" not in filename:
                continue
            sample = filename.split("__")[0]
            summary[sample].append(filename)

    return summary