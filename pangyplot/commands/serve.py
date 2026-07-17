import os
import sys
import shutil

from pangyplot.preprocess.skeleton.generate_skeleton import ensure_skeleton
from pangyplot.preprocess.ensure_paths import ensure_paths
from pangyplot.db.indexes.ensure_indexes import ensure_indexes


# serve is the production sibling of `run`: `run` uses Flask's threaded dev
# server bound to 127.0.0.1 (for local development); `serve` uses gunicorn bound
# to 0.0.0.0 so it is reachable from outside the host (or a container). gunicorn
# is REQUIRED here on purpose — if you want a dependency-light dev server, that
# is what `run` is for. The container's entrypoint is the bare CLI, so the image
# reaches this command as `pangyplot serve --db ... --ref ...`, exactly what you
# would type on a host that wants a production server.


def pangyplot_serve(args):
    # repo root holds wsgi.py (gunicorn imports `wsgi:app`). Resolve it so serve
    # works regardless of the process CWD (e.g. after `cd /work` in a container).
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    gunicorn = shutil.which("gunicorn")
    if not gunicorn:
        print("pangyplot serve requires gunicorn, which is not installed.")
        print("  Install it with:  pip install gunicorn")
        print("  Or use 'pangyplot run' for the built-in (development) server.")
        sys.exit(1)

    graph_dir = os.path.join(args.dir, "graphs", args.db)
    if not os.path.isdir(graph_dir) or not os.listdir(graph_dir):
        print(f"No graph data found for db '{args.db}' at {graph_dir}.")
        print("  Add data first with 'pangyplot add', or point --dir/--db at an existing datastore.")
        sys.exit(1)

    # Build any missing on-disk artifacts before the workers boot, the same way
    # `run` does. wsgi.py deliberately skips this (a WSGI import must be cheap and
    # side-effect-light), so serve owns the warm-up.
    ensure_paths(args.dir, args.db)
    ensure_indexes(args.dir, args.db, args.ref)
    ensure_skeleton(args.dir, args.db, args.ref)

    # gunicorn spawns fresh worker processes that import wsgi:app, which reads its
    # configuration from PANGYPLOT_* env. Translate the CLI flags into that env so
    # the command line stays the single source of truth.
    env = dict(os.environ)
    env["PANGYPLOT_DATA"] = args.dir
    env["PANGYPLOT_DB"] = args.db
    env["PANGYPLOT_REF"] = args.ref
    env["PANGYPLOT_PORT"] = str(args.port)
    if args.annotations:
        env["PANGYPLOT_ANNOTATION"] = args.annotations
    else:
        env.pop("PANGYPLOT_ANNOTATION", None)

    cmd = [
        gunicorn,
        "--chdir", repo_root,
        "--bind", f"{args.host}:{args.port}",
        "--workers", str(args.workers),
        "--threads", str(args.threads),
        "--timeout", str(args.timeout),
        "wsgi:app",
    ]

    print(f"Serving db='{args.db}' ref='{args.ref}' on http://{args.host}:{args.port} "
          f"(gunicorn: {args.workers} worker(s), {args.threads} thread(s))")

    # Replace this process with gunicorn so it becomes PID 1 in a container and
    # receives SIGTERM/SIGINT directly for a clean shutdown.
    os.execve(gunicorn, cmd, env)
