"""Unit tests for `pangyplot serve` (the production/container serve command).

serve is the gunicorn-backed sibling of `run`: it warms the datastore, translates
its CLI flags into the PANGYPLOT_* env that wsgi:app reads, and execs gunicorn
bound to 0.0.0.0. These tests mock out the actual exec + warm-up so nothing binds
a port or rebuilds indexes.
"""
import os
import types
from unittest import mock

import pytest

from pangyplot.commands import serve


def _args(**kw):
    d = dict(db="hprc.clip", ref="GRCh38", port=5700, dir="datastore",
             annotations=None, host="0.0.0.0", workers=1, threads=4, timeout=120)
    d.update(kw)
    return types.SimpleNamespace(**d)


def test_serve_requires_gunicorn():
    """No gunicorn on PATH -> hard fail (use `run` for a dependency-light server)."""
    with mock.patch.object(serve.shutil, "which", return_value=None):
        with pytest.raises(SystemExit) as exc:
            serve.pangyplot_serve(_args())
    assert exc.value.code == 1


def test_serve_rejects_missing_datastore():
    """gunicorn present but the db has no graph data -> clean refusal, not a boot."""
    with mock.patch.object(serve.shutil, "which", return_value="/usr/bin/gunicorn"):
        with pytest.raises(SystemExit) as exc:
            serve.pangyplot_serve(_args(db="does-not-exist"))
    assert exc.value.code == 1


def _run_capturing_exec(args, environ=None):
    """Drive pangyplot_serve up to (but not through) the gunicorn exec, returning
    the argv and env it would have exec'd with."""
    captured = {}

    def fake_execve(path, argv, env):
        captured["path"], captured["argv"], captured["env"] = path, argv, env
        raise RuntimeError("stop-before-exec")

    ctx = mock.patch.dict(os.environ, environ, clear=False) if environ else mock.patch.dict(os.environ, {})
    with mock.patch.object(serve.shutil, "which", return_value="/usr/bin/gunicorn"), \
         mock.patch.object(serve, "ensure_paths"), \
         mock.patch.object(serve, "ensure_indexes"), \
         mock.patch.object(serve, "ensure_skeleton"), \
         mock.patch.object(serve.os, "execve", fake_execve), \
         ctx:
        with pytest.raises(RuntimeError, match="stop-before-exec"):
            serve.pangyplot_serve(args)
    return captured


def test_serve_translates_flags_to_gunicorn_and_env():
    cap = _run_capturing_exec(_args(annotations="gencode48.chrY", host="0.0.0.0",
                                    port=5700, workers=2, threads=3, timeout=99))
    argv, env = cap["argv"], cap["env"]

    assert argv[-1] == "wsgi:app"
    assert "0.0.0.0:5700" in argv
    assert argv[argv.index("--workers") + 1] == "2"
    assert argv[argv.index("--threads") + 1] == "3"
    assert argv[argv.index("--timeout") + 1] == "99"
    # gunicorn must chdir to the repo root so `wsgi:app` imports regardless of CWD.
    assert argv[argv.index("--chdir") + 1].endswith("pangyplot")

    assert env["PANGYPLOT_DB"] == "hprc.clip"
    assert env["PANGYPLOT_REF"] == "GRCh38"
    assert env["PANGYPLOT_ANNOTATION"] == "gencode48.chrY"
    assert env["PANGYPLOT_DATA"] == "datastore"
    assert env["PANGYPLOT_PORT"] == "5700"


def test_serve_without_annotations_clears_stale_env():
    """--annotations omitted must not inherit a stale PANGYPLOT_ANNOTATION (e.g. the
    image's demo default) when pointed at the user's own datastore."""
    cap = _run_capturing_exec(_args(annotations=None),
                              environ={"PANGYPLOT_ANNOTATION": "gencode48.chrY"})
    assert "PANGYPLOT_ANNOTATION" not in cap["env"]
