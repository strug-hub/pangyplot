import os
import json
from collections import defaultdict
from pangyplot.objects.Path import Path
from pangyplot.db.path_codec import write_binpath, read_binpath

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

    filepath = get_filename(db_path, sample)
    metadata = path.serialize()
    steps = metadata.pop("path", [])
    write_binpath(filepath, metadata, steps)

def create_path(filename):
    metadata, steps = read_binpath(filename)
    path = Path()
    path.full_id = metadata.get("full_id")
    path.sample = metadata.get("sample")
    path.hap = metadata.get("hap")
    path.contig = metadata.get("contig")
    path.start = metadata.get("start")
    path.length = metadata.get("length")
    path.is_ref = metadata.get("is_ref", False)
    path.path = steps
    return path

def retrieve_paths(dir, sample):
    db_path = os.path.join(dir, DB_NAME)
    if not os.path.exists(db_path):
        return []

    paths = []
    for file in get_all_filenames(db_path, sample):
        paths.append(create_path(file))
    return paths

_filename_counters = {}

def reset_filename_counters():
    _filename_counters.clear()

def get_filename(db_path, sample):
    key = (db_path, sample)
    idx = _filename_counters.get(key, 0) + 1
    _filename_counters[key] = idx
    return os.path.join(db_path, f"{sample}__{idx}.binpath")

def get_all_filenames(db_path, sample):
    i = 0
    while True:
        filename = os.path.join(db_path, f"{sample}__{i+1}.binpath")
        if not os.path.exists(filename):
            break
        yield filename
        i += 1

def summarize(dir):
    db_path = os.path.join(dir, DB_NAME)
    summary = defaultdict(list)
    for filename in os.listdir(db_path):
        if filename.endswith(".binpath"):
            if "__" not in filename:
                continue
            sample = filename.split("__")[0]
            summary[sample].append(filename)

    return summary
