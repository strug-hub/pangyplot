import argparse
import os

from pangyplot.commands import add
from pangyplot.commands import run
from pangyplot.commands import setup
from pangyplot.commands import status
from pangyplot.commands import annotate
from pangyplot.commands import reindex

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

    parser_run = subparsers.add_parser('run', help='Launch the software (development mode).')
    parser_run.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)
    parser_run.add_argument('--ref', help='Reference name', default=None, required=True)
    parser_run.add_argument('--port', help='Port to run the app on', default=DEFAULT_PORT, type=int, required=False)
    parser_run.add_argument('--dir', help='Directory where the database files are', default=DEFAULT_DB_FOLDER)
    parser_run.add_argument('--annotations', help='Name of annotations to use', default=None, required=False)

    parser_add = subparsers.add_parser('add', help='Add a dataset.')
    parser_add.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)
    parser_add.add_argument('--ref', help='Reference genome name', default=None, required=True)
    parser_add.add_argument('--chr', help='Chromosome name', required=True)
    parser_add.add_argument('--path', help='Reference path name', default=None, required=False)
    parser_add.add_argument('--gfa', help='Path to the GFA file', default=None, required=True)
    parser_add.add_argument('--layout', help='Path to the odgi layout TSV file', default=None, required=True)
    parser_add.add_argument('--dir', help='Directory to store database files', default=DEFAULT_DB_FOLDER)
    parser_add.add_argument('--force', help='Overwrite existing files', action='store_true')

    parser_annotate = subparsers.add_parser('annotate', help='Add annotation dataset.')
    parser_annotate.add_argument('--ref', help='Reference genome name', default=None, required=True)
    parser_annotate.add_argument('--gff3', help='Path to a GFF3 file', default=None, required=False)
    parser_annotate.add_argument('--bed', help='Path to a BED file (NOT YET SUPPORTED)', default=None, required=False)

    parser_annotate.add_argument('--name', help='Name for the annotation set', default=None, required=True)
    parser_annotate.add_argument('--dir', help='Directory to store database files', default=DEFAULT_DB_FOLDER)

    #TODO: create metadata file and use to reindex 
    #parser_run = subparsers.add_parser('reindex', help='Reindex all GFA files.')
    #parser_run.add_argument('--db', help='Database name', default=DEFAULT_DB, required=True)

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

    if args.command == 'annotate':
        annotate.pangyplot_annotate(args)

    exit(0)


if __name__ == '__main__':
    parse_args()
