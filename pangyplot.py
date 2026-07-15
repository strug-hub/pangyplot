import argparse
import os

from pangyplot.commands import add
from pangyplot.commands import cytoband
from pangyplot.commands import run
from pangyplot.commands import setup
from pangyplot.commands import status
from pangyplot.commands import annotate
from pangyplot.commands import reindex
from pangyplot.commands import preprocess
from pangyplot.preprocess import cytoband_generator
from pangyplot.version import __version__,__version_name__

script_dir = os.path.dirname(os.path.realpath(__file__))
DEFAULT_DB_FOLDER = os.path.join(script_dir, "datastore")
DEFAULT_DB = "_default_"
DEFAULT_PORT = 5700

def parse_args():

    parser = argparse.ArgumentParser(description="PangyPlot command line options.")

    subparsers = parser.add_subparsers(dest='command', help='Available commands', required=True)

    parser_setup = subparsers.add_parser('setup', help='Setup the environment for database connection.')
    
    parser_status = subparsers.add_parser('status', help='Check the database status.')
    parser_status.add_argument('--dir', help='Directory where the database files are', default=DEFAULT_DB_FOLDER)
    parser_status.add_argument('--db', help='Check specific database', default=None, required=False)
    parser_status.add_argument('--table', help='Check specific table (eg. segment)', default=None, required=False)
    parser_status.add_argument('--full', help='Include row counts from databases (slower)', action='store_true', default=False)

    parser_run = subparsers.add_parser('run', help='Launch the software (development mode).')
    parser_run.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)
    parser_run.add_argument('--ref', help='Reference name', default=None, required=True)
    parser_run.add_argument('--port', help='Port to run the app on', default=DEFAULT_PORT, type=int, required=False)
    parser_run.add_argument('--dir', help='Directory where the database files are', default=DEFAULT_DB_FOLDER)
    parser_run.add_argument('--annotations', help='Name of annotations to use', default=None, required=False)
    parser_run.add_argument('--debug', help='Enable debug mode in the frontend', action='store_true')

    parser_add = subparsers.add_parser('add', help='Add a dataset.')
    parser_add.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)
    parser_add.add_argument('--ref', help='Reference genome name', default=None, required=True)
    parser_add.add_argument('--chr', help='Chromosome name', required=True)
    parser_add.add_argument('--path', help='Reference path name', default=None, required=False)
    parser_add.add_argument('--gfa', help='Path to the GFA file', default=None, required=True)
    parser_add.add_argument('--layout', help='Path to the odgi layout TSV file', default=None, required=True)
    parser_add.add_argument('--dir', help='Directory to store database files', default=DEFAULT_DB_FOLDER)
    parser_add.add_argument('--force', help='Overwrite existing files without asking', action='store_true')
    parser_add.add_argument('--retry', help='Attempt to use existing GFA index', action='store_true')
    parser_add.add_argument('--offset', help='Suggest bp offset for reference path', default=0, required=False, type=int)
    parser_add.add_argument('--sep', help='Character separator for path name (prefix taken as path name)', default=None, required=False)
    parser_add.add_argument('--build-gbwt', help='Build a native compact graph.gbwt from the parsed paths (no vg; for the GBWT path engine)', action='store_true')
    parser_add.add_argument('--gbz', help='Adopt a pre-built GBZ as this chr graph.gbz instead (for foreign/vg-built GBZs)', default=None, required=False)

    parser_annotate = subparsers.add_parser('annotate', help='Add annotation dataset.')
    parser_annotate.add_argument('--ref', help='Reference genome name', default=None, required=True)
    parser_annotate.add_argument('--gff3', help='Path to a GFF3 file', default=None, required=False)
    parser_annotate.add_argument('--bed', help='Path to a BED file (NOT YET SUPPORTED)', default=None, required=False)
    parser_annotate.add_argument('--force', help='Overwrite existing files', action='store_true')
    parser_annotate.add_argument('--name', help='Name for the annotation set', default=None, required=True)
    parser_annotate.add_argument('--dir', help='Directory to store database files', default=DEFAULT_DB_FOLDER)

    parser_cytoband = subparsers.add_parser('cytoband', help='Generate a pseudo-cytoband from chromosome lengths (for organisms with no UCSC cytoband).')
    parser_cytoband.add_argument('--fai', help='Path to a FASTA .fai index (or any TSV whose first two columns are name and length)', default=None, required=True)
    parser_cytoband.add_argument('--out-dir', help='Directory to write the cytoband and canonical files into', default=os.getcwd())
    parser_cytoband.add_argument('--genome', help='Genome name used for the output filenames (default: derived from --fai)', default=None)
    parser_cytoband.add_argument('--band-size', help='Subdivide each chromosome into bands of this many bp (default: one solid band per chromosome)', default=None, type=int)
    parser_cytoband.add_argument('--num-bands', help='Subdivide each chromosome into this many bands, as an alternative to --band-size', default=None, type=int)
    parser_cytoband.add_argument('--min-length', help=f'Drop sequences shorter than this many bp (default: {cytoband_generator.DEFAULT_MIN_LENGTH}; use 0 to keep all)', default=cytoband_generator.DEFAULT_MIN_LENGTH, type=int)
    parser_cytoband.add_argument('--chromosomes', help='Comma-separated list of sequences to keep, in this order (overrides --min-length and --pattern)', default=None)
    parser_cytoband.add_argument('--pattern', help='Keep only sequences whose name matches this regex', default=None)
    parser_cytoband.add_argument('--force', help='Overwrite existing files without asking', action='store_true')

    parser_version = subparsers.add_parser('version', help='Show version information.')

    #TODO: create metadata file and use to reindex 
    #parser_run = subparsers.add_parser('reindex', help='Reindex all GFA files.')
    #parser_run.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)

    parser_preprocess = subparsers.add_parser('preprocess', help='Interactive generator for odgi preprocessing scripts.')

    parser_example = subparsers.add_parser('example', help='Adds example DRB1 data.')
    #parser_example.add_argument('--chrM', help='Use HPRC chrM data', action='store_true')
    #parser_example.add_argument('--gencode', help='Add genocode annotations', action='store_true')
    #parser.add_argument('--drb1', help='Use DRB1 demo data', action='store_true')

    args = parser.parse_args()
    
    if args.command == "setup":
        setup.pangyplot_setup(args)

    if args.command == "status":
        status.pangyplot_status(args)

    if args.command == "add":
        add.pangyplot_add(args)

    if args.command == "reindex":
        reindex.pangyplot_reindex(args)

    if args.command == 'run':
        run.pangyplot_run(args)

    if args.command == 'preprocess':
        preprocess.pangyplot_preprocess(args)

    if args.command == 'annotate':
        annotate.pangyplot_annotate(args)

    if args.command == 'cytoband':
        cytoband.pangyplot_cytoband(args)

    if args.command == 'version':
        print(f"PangyPlot {__version__} ({__version_name__})")
        exit(0)

if __name__ == '__main__':
    parse_args()
