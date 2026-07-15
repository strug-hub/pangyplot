import os
import logging
from pympler.asizeof import asizeof

from flask import Flask, request
from flask_babel import Babel
from pangyplot.db.db_utils import NumpyJSONEncoder


from dotenv import load_dotenv
from pangyplot.routes import bp as routes_bp

from pangyplot.db.indexes.GFAIndex import GFAIndex
from pangyplot.db.indexes.GbwtPathIndex import GbwtPathIndex
from pangyplot.db.gbwt_manager import GbwtManager
from pangyplot.db.indexes.StepIndex import StepIndex
from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.AnnotationIndex import AnnotationIndex
from pangyplot.db.indexes.PolychainIndex import PolychainIndex
import pangyplot.organisms as organisms
import pangyplot.preprocess.parser.parse_cytoband as cytoband_parser


babel = Babel()

def get_locale():
    # Check ?lang= query param first
    lang = request.args.get("lang")
    print("LOCALE", lang)
    print(lang)
    return lang or "en"


def create_app(data_dir, db_name, annotation_name, ref, port, development=True, debug=False):
    app = Flask(__name__)
    app.json.default = NumpyJSONEncoder().default

    app.config['BABEL_DEFAULT_LOCALE'] = 'en'
    app.config['BABEL_SUPPORTED_LOCALES'] = [
        'en', 'fr', 'es', 'de', 'it',
        'pt_BR', 'ru', 'zh_Hans_CN', 'ja', 'ko', 'ar'
    ]

    babel.init_app(app, locale_selector=get_locale)

    app.debug_mode = debug
    app.data_dir = data_dir
    app.db_name = db_name

    setup_cytoband(app)
    load_indexes(app, data_dir, db_name, annotation_name, ref)

    app.register_blueprint(routes_bp)

    # Filter out static asset request logs (js, css, fonts, images)
    class StaticFilter(logging.Filter):
        def filter(self, record):
            msg = record.getMessage()
            return not ('/static/' in msg and ('.js ' in msg or '.css ' in msg
                or '.woff' in msg or '.ttf' in msg or '.svg ' in msg or '.png ' in msg))
    logging.getLogger('werkzeug').addFilter(StaticFilter())

    if development:
        base_url = f"http://127.0.0.1:{port}"
        debug_label = " [DEBUG]" if debug else ""
        print(f"\nStarting PangyPlot (non-production environment){debug_label}...")
        print(f"  Viewer:       {base_url}/#chrY:23129355-23199010")
        print(f"  Deep nesting: {base_url}/#chr20:32618374-32624146\n")
        app.run(port=port, threaded=True)

    return app


def load_indexes(app, data_dir, db_name, annotation_name, ref):
    app.gfa_index = dict()
    app.step_index = dict()
    app.bubble_index = dict()
    app.polychain_index = dict()
    app.annotation_index = dict()
    
    app.genome = ref
    app.chromosomes = []

    # GBWT path engine (opt-in via PANGYPLOT_GBWT). Off by default -> legacy
    # binpath PathIndex. When on, each chr's path_index is swapped for a
    # GbwtPathIndex backed by a per-chr sidecar (see GbwtManager).
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app.gbwt_manager = GbwtManager(repo_root=repo_root)

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

        gbwt_client = app.gbwt_manager.client_for_chrom(chr, chr_dir)
        if gbwt_client is not None:
            app.gfa_index[chr].path_index = GbwtPathIndex(gbwt_client)

        app.step_index[(chr,ref)] = StepIndex(chr_dir, ref)
        print(f"step_index size:      {asizeof(app.step_index[(chr,ref)]) / 1024**2:.2f} MB")

        app.bubble_index[chr] = BubbleIndex(chr_dir, app.gfa_index[chr])
        print(f"bubble_index size:      {asizeof(app.bubble_index[chr]) / 1024**2:.2f} MB")

        if not PolychainIndex.validate(chr_dir):
            print(f"  ⛓️  Building polychain index for {chr}...", flush=True)
        app.polychain_index[chr] = PolychainIndex(
            chr_dir, app.bubble_index[chr], app.gfa_index[chr],
            app.step_index[(chr, ref)], ref)
        print(f"polychain_index size:   {asizeof(app.polychain_index[chr]) / 1024**2:.2f} MB")

        app.gfa_index[chr].path_index.compute_bp_ranges(app.step_index[(chr, ref)])
        print(f"  ✓ Computed subpath bp ranges")

    print(f"gfa_index size total:      {asizeof(app.gfa_index) / 1024**2:.2f} MB")
    print(f"step_index size total:      {asizeof(app.step_index) / 1024**2:.2f} MB")
    print(f"bubble_index size total:      {asizeof(app.bubble_index) / 1024**2:.2f} MB")

def setup_cytoband(app):
    load_dotenv()
    app.cytoband = dict()

    organism = os.getenv("ORGANISM", organisms.DEFAULT_ORGANISM)
    cytoband_path = os.getenv("CYTOBAND_PATH", None)
    canonical_path = os.getenv("CANONICAL_PATH", None)

    if organism == organisms.CUSTOM_ORGANISM:
        if not cytoband_path or not canonical_path:
            print("A 'custom' organism was specified, but no information about CYTOBAND_PATH or CANONICAL_PATH was found in .env")
            print(f"Using default organism: {organisms.DEFAULT_ORGANISM}")
            organism = organisms.DEFAULT_ORGANISM
            cytoband_path = None
            canonical_path = None
        else:
            missing = [p for p in (cytoband_path, canonical_path) if not os.path.isfile(p)]
            if missing:
                for path in missing:
                    print(f"Custom cytoband file not found: {path}")
                print(f"Continuing without an ideogram (ORGANISM={organisms.NO_ORGANISM})")
                organism = organisms.NO_ORGANISM
    else:
        cytoband_path = None
        canonical_path = None

        if organism != organisms.NO_ORGANISM and organism not in organisms.ORGANISM_TO_GENOME:
            print(f"Unrecognized ORGANISM '{organism}'. Valid values: "
                  f"{organisms.NO_ORGANISM}, {organisms.CUSTOM_ORGANISM}, "
                  f"{', '.join(organisms.VALID_ORGANISMS)}")
            print(f"Continuing without an ideogram (ORGANISM={organisms.NO_ORGANISM})")
            organism = organisms.NO_ORGANISM

    app.cytoband['organism'] = organism
    app.cytoband['genome'] = organisms.ORGANISM_TO_GENOME.get(organism, None)

    # No ideogram: the app boots with an empty chromosome list and no bands.
    # Do not synthesize a fake organism to fill the gap.
    if organism == organisms.NO_ORGANISM:
        app.cytoband["chromosomes"] = []
        app.cytoband["cytobands"] = dict()
        return

    if not cytoband_path:
        genome = app.cytoband['genome']
        script_dir = os.path.dirname(os.path.realpath(__file__))
        cytoband_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.cytoBand.txt")
        canonical_path = os.path.join(script_dir, "static", "cytoband", f"{genome}.canonical.txt")

    app.cytoband["chromosomes"] = cytoband_parser.parse_chromosome_list(canonical_path)
    app.cytoband["cytobands"] = cytoband_parser.parse_cytoband(cytoband_path, app.cytoband["chromosomes"])