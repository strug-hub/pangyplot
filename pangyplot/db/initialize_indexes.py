import os
from pympler.asizeof import asizeof
from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.LinkIndex import LinkIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

def initialize(flask_app, db_path, ref):
    flask_app.segment_index = dict()
    flask_app.link_index = dict()
    flask_app.step_index = dict()
    flask_app.bubble_index = dict()

    flask_app.genome = ref
    flask_app.chrom = []
    
    for chr in os.listdir(db_path):
        flask_app.chrom.append(chr)
    
        print(f"Loading: {chr}")
        chr_dir = os.path.join(db_path, chr)

        flask_app.segment_index[chr] = SegmentIndex(chr_dir)
        print(f"segment_index size:      {asizeof(flask_app.segment_index[chr]) / 1024**2:.2f} MB")

        flask_app.link_index[chr] = LinkIndex(chr_dir)
        print(f"link_index size:      {asizeof(flask_app.link_index[chr]) / 1024**2:.2f} MB")

        flask_app.step_index[chr] = StepIndex(chr_dir, ref)
        print(f"step_index size:      {asizeof(flask_app.step_index[chr]) / 1024**2:.2f} MB")

        flask_app.bubble_index[chr] = BubbleIndex(chr_dir)
        print(f"bubble_index size:      {asizeof(flask_app.bubble_index[chr]) / 1024**2:.2f} MB")

    print(f"segment_index size total:      {asizeof(flask_app.segment_index) / 1024**2:.2f} MB")
    print(f"link_index size total:      {asizeof(flask_app.link_index) / 1024**2:.2f} MB")
    print(f"step_index size total:      {asizeof(flask_app.step_index) / 1024**2:.2f} MB")
    print(f"bubble_index size total:      {asizeof(flask_app.bubble_index) / 1024**2:.2f} MB")
