import tempfile
import shutil
from array import array

from pangyplot.db.indexes.BubbleIndex import BubbleIndex

def test_quick_index_roundtrip():
    # Create a temporary directory for the test
    tempdir = tempfile.mkdtemp()

    try:
        n = 1000
        start_steps = array('I', [i * 10 for i in range(n)])
        end_steps   = array('I', [i * 10 + 5 for i in range(n)])
        ids         = array('I', list(range(n)))
        bubble_to_parent  = array('I', [0] * 50)
        segment_to_bubble = array('I', [0] * 200)

        layout_x1 = array('f', [float(i) for i in range(n)])
        layout_x2 = array('f', [float(i) + 1.0 for i in range(n)])
        layout_ids = array('I', list(range(n)))

        original = BubbleIndex.__new__(BubbleIndex)
        original.dir              = tempdir
        original.start_steps      = start_steps
        original.end_steps        = end_steps
        original.ids              = ids
        original.bubble_to_parent  = bubble_to_parent
        original.segment_to_bubble = segment_to_bubble
        original.layout_x1        = layout_x1
        original.layout_x2        = layout_x2
        original.layout_ids       = layout_ids

        original.save_quick_index()

        reloaded = BubbleIndex.__new__(BubbleIndex)
        reloaded.dir = tempdir
        success = reloaded.load_quick_index()

        assert success, "Quick index failed to load"
        assert reloaded.start_steps      == original.start_steps
        assert reloaded.end_steps        == original.end_steps
        assert reloaded.ids              == original.ids
        assert reloaded.bubble_to_parent  == original.bubble_to_parent
        assert reloaded.segment_to_bubble == original.segment_to_bubble
        assert reloaded.layout_x1        == original.layout_x1
        assert reloaded.layout_x2        == original.layout_x2
        assert reloaded.layout_ids       == original.layout_ids

    finally:
        shutil.rmtree(tempdir)
