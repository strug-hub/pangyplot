"""Tests for db_utils: NumpyJSONEncoder, dump_json/load_json, get_connection."""

import json
import os

import numpy as np
import pytest

from pangyplot.db.db_utils import NumpyJSONEncoder, dump_json, get_connection, load_json


# ---------------------------------------------------------------------------
# NumpyJSONEncoder
# ---------------------------------------------------------------------------

class TestNumpyJSONEncoder:

    @pytest.mark.parametrize("dtype", [np.int8, np.int16, np.int32, np.int64,
                                        np.uint8, np.uint16, np.uint32, np.uint64])
    def test_integer_types(self, dtype):
        val = dtype(42)
        assert json.dumps(val, cls=NumpyJSONEncoder) == "42"

    @pytest.mark.parametrize("dtype", [np.float32, np.float64])
    def test_floating_types(self, dtype):
        val = dtype(3.14)
        result = json.loads(json.dumps(val, cls=NumpyJSONEncoder))
        assert abs(result - 3.14) < 0.01

    def test_ndarray_raises(self):
        """Encoder only handles scalars, not arrays."""
        with pytest.raises(TypeError):
            json.dumps(np.array([1, 2, 3]), cls=NumpyJSONEncoder)

    def test_mixed_dict(self):
        data = {
            "np_int": np.int64(10),
            "np_float": np.float32(2.5),
            "py_int": 7,
            "py_str": "hello",
            "nested": {"a": np.uint8(255)},
        }
        result = json.loads(json.dumps(data, cls=NumpyJSONEncoder))
        assert result["np_int"] == 10
        assert abs(result["np_float"] - 2.5) < 0.01
        assert result["py_int"] == 7
        assert result["py_str"] == "hello"
        assert result["nested"]["a"] == 255


# ---------------------------------------------------------------------------
# dump_json / load_json
# ---------------------------------------------------------------------------

class TestDumpLoadJson:

    def test_round_trip(self, tmp_path):
        data = {"key": [1, 2, 3], "nested": {"x": True}}
        path = str(tmp_path / "test.json.gz")
        dump_json(data, path)
        assert load_json(path) == data

    def test_auto_appends_gz(self, tmp_path):
        data = {"a": 1}
        path = str(tmp_path / "test.json")
        dump_json(data, path)
        # File on disk has .gz suffix
        assert os.path.exists(path + ".gz")
        assert load_json(path) == data

    def test_path_with_gz_no_double_suffix(self, tmp_path):
        data = {"b": 2}
        path = str(tmp_path / "test.json.gz")
        dump_json(data, path)
        assert not os.path.exists(path + ".gz")
        assert os.path.exists(path)

    def test_numpy_scalars_survive_round_trip(self, tmp_path):
        data = {"i": np.int64(99), "f": np.float32(1.5)}
        path = str(tmp_path / "np.json.gz")
        dump_json(data, path)
        result = load_json(path)
        assert result["i"] == 99
        assert abs(result["f"] - 1.5) < 0.01

    def test_load_missing_file_returns_none(self, tmp_path):
        path = str(tmp_path / "nonexistent.json.gz")
        assert load_json(path) is None


# ---------------------------------------------------------------------------
# get_connection
# ---------------------------------------------------------------------------

class TestGetConnection:

    def test_returns_usable_connection(self, tmp_path):
        conn = get_connection(str(tmp_path), "test.db")
        conn.execute("CREATE TABLE t (id INTEGER)")
        conn.execute("INSERT INTO t VALUES (1)")
        assert conn.execute("SELECT id FROM t").fetchone()["id"] == 1

    def test_row_factory_is_row(self, tmp_path):
        import sqlite3
        conn = get_connection(str(tmp_path), "test2.db")
        assert conn.row_factory is sqlite3.Row

    def test_clear_existing_removes_old_data(self, tmp_path):
        d = str(tmp_path)
        conn = get_connection(d, "clear.db", clear_existing=True)
        conn.execute("CREATE TABLE t (v TEXT)")
        conn.execute("INSERT INTO t VALUES ('old')")
        conn.commit()
        conn.close()

        conn2 = get_connection(d, "clear.db", clear_existing=True)
        tables = conn2.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        assert len(tables) == 0
        conn2.close()

    def test_caching_returns_same_connection(self, tmp_path):
        d = str(tmp_path / "cache_test")
        os.makedirs(d)
        conn1 = get_connection(d, "cached.db")
        conn2 = get_connection(d, "cached.db")
        assert conn1 is conn2
