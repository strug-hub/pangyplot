import os
import pangyplot.app as app

def pangyplot_run(args):

    annotation_dir = os.path.join(args.dir, "annotations", args.ref)

    if args.annotations:
        annotation_path = os.path.join(annotation_dir, args.annotations)

        if not os.path.isdir(annotation_dir):
            print(f"Annotation directory '{annotation_dir}' does not exist. Please run 'pangyplot annotate' first.")
            return
        
        if not os.path.isdir(annotation_path):
            print(f"Annotations for '{args.annotations}' does not exist for {args.ref}. Please run 'pangyplot annotate' first.")
            print(f"Annotation directory '{annotation_dir}' does not exist. Please run 'pangyplot annotate' first.")
            subdirs = [d for d in os.listdir(annotation_dir)
                if os.path.isdir(os.path.join(annotation_dir, d))]
            print("Available annotations:", subdirs)
            return

    else:
        if os.path.isdir(annotation_dir):
            subdirs = [d for d in os.listdir(annotation_dir)
                    if os.path.isdir(os.path.join(annotation_dir, d))]

            if subdirs:
                # Sort subdirs by modification time (newest first)
                subdirs.sort(key=lambda d: os.path.getmtime(os.path.join(annotation_dir, d)), reverse=True)

                print("Found annotations:", subdirs[0])
                args.annotations = subdirs[0]

        if args.annotations is None:
            print("No annotations found. Running without annotations.")




    app.create_app(args.dir, args.db, args.annotations, args.ref, args.port, development=True)
