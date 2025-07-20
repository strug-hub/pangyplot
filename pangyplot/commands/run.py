import os

import pangyplot.app as app

def pangyplot_run(args):

    datastore_path = args.dir
    datastore_path = os.path.join(datastore_path, args.db)

    app.create_app(datastore_path, args.ref, args.port, development=True)
