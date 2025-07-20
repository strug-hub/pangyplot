import os
from pympler.asizeof import asizeof

from flask import Flask
from dotenv import load_dotenv
from pangyplot.routes import bp as routes_bp

from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.LinkIndex import LinkIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex

import pangyplot.parser.parse_cytoband as cytoband_parser

def create_app(db_path, ref, port, development=True):

    app = Flask(__name__)

    setup_cytoband(app)
    load_indexes(app, db_path, ref)

    app.register_blueprint(routes_bp)

    if development:
        print(f"Starting PangyPlot (non-production environment)... http://127.0.0.1:{port}")
        app.run(port=port)

    return app

def load_indexes(app, db_path, ref):
    app.segment_index = dict()
    app.link_index = dict()
    app.step_index = dict()
    app.bubble_index = dict()

    app.genome = ref
    app.chromosomes = []

    for chr in os.listdir(db_path):
        app.chromosomes.append(chr)

        print(f"Loading: {chr}")
        chr_dir = os.path.join(db_path, chr)

        app.segment_index[chr] = SegmentIndex(chr_dir)
        print(f"segment_index size:      {asizeof(app.segment_index[chr]) / 1024**2:.2f} MB")

        app.link_index[chr] = LinkIndex(chr_dir)
        print(f"link_index size:      {asizeof(app.link_index[chr]) / 1024**2:.2f} MB")

        app.step_index[chr] = StepIndex(chr_dir, ref)
        print(f"step_index size:      {asizeof(app.step_index[chr]) / 1024**2:.2f} MB")

        app.bubble_index[chr] = BubbleIndex(chr_dir)
        print(f"bubble_index size:      {asizeof(app.bubble_index[chr]) / 1024**2:.2f} MB")

    print(f"segment_index size total:      {asizeof(app.segment_index) / 1024**2:.2f} MB")
    print(f"link_index size total:      {asizeof(app.link_index) / 1024**2:.2f} MB")
    print(f"step_index size total:      {asizeof(app.step_index) / 1024**2:.2f} MB")
    print(f"bubble_index size total:      {asizeof(app.bubble_index) / 1024**2:.2f} MB")


def setup_cytoband(app):
    load_dotenv()

    organism_to_genome = {
        "human": "hg38",
        "dog": "canFam3",
        "mouse": "mm39",
        "fruitfly": "dm6",
        "zebrafish": "danRer11",
        "chicken": "galGal6",
        "rabbit": "oryCun2",
    }

    app.cytoband = dict()
    
    organism = os.getenv("ORGANISM", "human")
    cytoband_path = os.getenv("CYTOBAND_PATH", None)
    canonical_path = os.getenv("CANONICAL_PATH", None)
    
    if organism == "custom":
        if not cytoband_path or not canonical_path:
            print("No information about CYTOBAND_PATH or CANONICAL_PATH was found in .env")
            print("Using default organism: human")
            organism = "human"
    else:
        cytoband_path = None
        canonical_path = None

    app.cytoband['organism'] = organism
    genome = organism_to_genome.get(organism, None)
    app.cytoband['genome'] = genome

    if not cytoband_path:
        genome = organism_to_genome.get(organism, None)
        if genome:
            ORGANISM=organism
            script_dir = os.path.dirname(os.path.realpath(__file__))
            cytoband_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.cytoBand.txt")
            canonical_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.canonical.txt")

    app.cytoband["chromosomes"] = cytoband_parser.parse_chromosome_list(canonical_path)
    app.cytoband["cytobands"] = cytoband_parser.parse_cytoband(cytoband_path, app.cytoband["chromosomes"])