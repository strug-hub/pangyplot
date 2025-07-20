import os
import pangyplot.app as app

def pangyplot_run(args):

    if args.annotations is None:
        annotation_path = os.path.join(args.dir, "annotations", args.ref)
        if os.path.isdir(annotation_path):
            subdirs = [d for d in os.listdir(annotation_path)
                       if os.path.isdir(os.path.join(annotation_path, d))]
            if subdirs:
                args.annotations = subdirs[0]

    app.create_app(args.dir, args.db, args.annotations, args.ref, args.port, development=True)
