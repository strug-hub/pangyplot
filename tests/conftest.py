import pathlib
import pytest

FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def fixtures_dir():
    return FIXTURES_DIR


@pytest.fixture(scope="module")
def mini_p_gfa(fixtures_dir):
    return fixtures_dir / "mini_p.gfa"


@pytest.fixture(scope="module")
def mini_w_gfa(fixtures_dir):
    return fixtures_dir / "mini_w.gfa"


@pytest.fixture(scope="module")
def mini_odgi_layout(fixtures_dir):
    return fixtures_dir / "mini.odgi.tsv"


@pytest.fixture(scope="module")
def mini_bandage_layout(fixtures_dir):
    return fixtures_dir / "mini.bandage.json"


@pytest.fixture(scope="module")
def drb1_gfa(fixtures_dir):
    return fixtures_dir / "DRB1-3123.gfa"


@pytest.fixture(scope="module")
def drb1_layout(fixtures_dir):
    return fixtures_dir / "DRB1-3123.lay.tsv"
