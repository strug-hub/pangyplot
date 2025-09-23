import os
from pympler.asizeof import asizeof

from flask import Flask
from dotenv import load_dotenv
from pangyplot.routes import bp as routes_bp

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.AnnotationIndex import AnnotationIndex
import pangyplot.organisms as organisms
import pangyplot.preprocess.parser.parse_cytoband as cytoband_parser

def create_app(data_dir, db_name, annotation_name, ref, port, development=True):
    app = Flask(__name__)

    setup_cytoband(app)
    load_indexes(app, data_dir, db_name, annotation_name, ref)

    app.register_blueprint(routes_bp)

    if development:
        print(f"Starting PangyPlot (non-production environment)... http://127.0.0.1:{port}")
        app.run(port=port)

    return app

def load_indexes(app, data_dir, db_name, annotation_name, ref):
    app.gfa_index = dict()
    app.step_index = dict()
    app.bubble_index = dict()
    app.annotation_index = dict()
    
    app.genome = ref
    app.chromosomes = []

    if annotation_name:
        annotation_path = os.path.join(data_dir, "annotations", ref, annotation_name)
        app.annotation_index[ref] = AnnotationIndex(annotation_name, annotation_path)
        print(f"annotation_index size: {asizeof(app.annotation_index[ref]) / 1024**2:.2f} MB")

    graph_path = os.path.join(data_dir, "graphs", db_name)
    for chr in os.listdir(graph_path):
        chr_dir = os.path.join(graph_path, chr)
        if not os.path.isdir(chr_dir):
            continue
        
        print(f"Loading chromosome: {chr}")
        app.chromosomes.append(chr)

        print(f"Loading: {chr}")
        chr_dir = os.path.join(graph_path, chr)

        app.gfa_index[chr] = GFAIndex(chr_dir)
        print(f"gfa_index size:      {asizeof(app.gfa_index[chr]) / 1024**2:.2f} MB")

        app.step_index[(chr,ref)] = StepIndex(chr_dir, ref)
        print(f"step_index size:      {asizeof(app.step_index[(chr,ref)]) / 1024**2:.2f} MB")

        app.bubble_index[chr] = BubbleIndex(chr_dir, app.gfa_index[chr])
        print(f"bubble_index size:      {asizeof(app.bubble_index[chr]) / 1024**2:.2f} MB")

    print(f"gfa_index size total:      {asizeof(app.gfa_index) / 1024**2:.2f} MB")
    print(f"step_index size total:      {asizeof(app.step_index) / 1024**2:.2f} MB")
    print(f"bubble_index size total:      {asizeof(app.bubble_index) / 1024**2:.2f} MB")

def setup_cytoband(app):
    load_dotenv()
    app.cytoband = dict()

    organism = os.getenv("ORGANISM", organisms.DEFAULT_ORGANISM)
    cytoband_path = os.getenv("CYTOBAND_PATH", None)
    canonical_path = os.getenv("CANONICAL_PATH", None)
    
    if organism == "custom":
        if not cytoband_path or not canonical_path:
            print("A 'custom' organism was specified, but no information about CYTOBAND_PATH or CANONICAL_PATH was found in .env")
            print(f"Using default organism: {organisms.DEFAULT_ORGANISM}")
            organism = organisms.DEFAULT_ORGANISM
    else:
        cytoband_path = None
        canonical_path = None

    app.cytoband['organism'] = organism
    genome = organisms.ORGANISM_TO_GENOME.get(organism, None)
    app.cytoband['genome'] = genome

    if not cytoband_path:
        genome = organisms.ORGANISM_TO_GENOME.get(organism, None)
        if genome:
            ORGANISM=organism
            script_dir = os.path.dirname(os.path.realpath(__file__))
            cytoband_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.cytoBand.txt")
            canonical_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.canonical.txt")

    app.cytoband["chromosomes"] = cytoband_parser.parse_chromosome_list(canonical_path)
    app.cytoband["cytobands"] = cytoband_parser.parse_cytoband(cytoband_path, app.cytoband["chromosomes"])