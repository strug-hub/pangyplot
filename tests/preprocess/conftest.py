import pathlib
import pytest

CYTOBAND_FIXTURES = pathlib.Path(__file__).parent.parent / "fixtures" / "cytoband"


@pytest.fixture
def cytoband_file():
    return CYTOBAND_FIXTURES / "test.cytoBand.txt"


@pytest.fixture
def canonical_file():
    return CYTOBAND_FIXTURES / "test.canonical.txt"


@pytest.fixture
def empty_name_file():
    return CYTOBAND_FIXTURES / "empty_name.cytoBand.txt"


@pytest.fixture
def three_chrom_canonical():
    return CYTOBAND_FIXTURES / "three_chrom.canonical.txt"
