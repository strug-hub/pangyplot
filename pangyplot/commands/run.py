import os

from pangyplot.routes import initialize_app

def pangyplot_run(args):

    datastore_path = args.dir
    datastore_path = os.path.join(datastore_path, args.db)

    initialize_app(datastore_path, args.port, args.ref, development=True)
