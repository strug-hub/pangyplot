import os
from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.LinkIndex import LinkIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pympler.asizeof import asizeof

from pangyplot_app import initialize_app

def pangyplot_run(args):

    datastore_path = args.dir
    datastore_path = os.path.join(datastore_path, args.db)

    segment_index = dict()
    link_index = dict()
    step_index = dict()
    bubble_index = dict()

    for chr in os.listdir(datastore_path):

        print(f"Loading: {chr}")
        chr_dir = os.path.join(datastore_path, chr)

        segment_index[chr] = SegmentIndex(chr_dir)
        print(f"segment_index size:      {asizeof(segment_index[chr]) / 1024**2:.2f} MB")

        link_index[chr] = LinkIndex(chr_dir)
        print(f"link_index size:      {asizeof(link_index[chr]) / 1024**2:.2f} MB")

        step_index[chr] = StepIndex(chr_dir)
        print(f"step_index size:      {asizeof(step_index[chr]) / 1024**2:.2f} MB")

        bubble_index[chr] = BubbleIndex(chr_dir)
        print(f"bubble_index size:      {asizeof(bubble_index[chr]) / 1024**2:.2f} MB")

    print(f"segment_index size total:      {asizeof(segment_index) / 1024**2:.2f} MB")
    print(f"link_index size total:      {asizeof(link_index) / 1024**2:.2f} MB")
    print(f"step_index size total:      {asizeof(step_index) / 1024**2:.2f} MB")
    print(f"bubble_index size total:      {asizeof(bubble_index) / 1024**2:.2f} MB")    

    initialize_app(db_name=args.db, port=args.port)
