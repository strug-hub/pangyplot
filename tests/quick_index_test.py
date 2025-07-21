import tempfile
import shutil
from array import array

from pangyplot.db.indexes.BubbleIndex import BubbleIndex

def test_quick_index_roundtrip():
    # Create a temporary directory for the test
    tempdir = tempfile.mkdtemp()

    try:
        # Create and manually assign arbitrary data
        n = 1000
        starts = array('I', [i * 10 for i in range(n)])
        ends = array('I', [i * 10 + 5 for i in range(n)])
        ids = array('I', list(range(n)))

        # Save original
        original = BubbleIndex.__new__(BubbleIndex)
        original.dir = tempdir
        original.starts = starts
        original.ends = ends
        original.ids = ids

        # Save quick index
        original.save_quick_index()

        # Load into a new instance
        reloaded = BubbleIndex.__new__(BubbleIndex)
        reloaded.dir = tempdir
        success = reloaded.load_quick_index()

        assert success, "Quick index failed to load"
        assert reloaded.starts == original.starts
        assert reloaded.ends == original.ends
        assert reloaded.ids == original.ids

    finally:
        shutil.rmtree(tempdir)
