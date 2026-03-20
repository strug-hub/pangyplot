import tempfile
import shutil
from array import array

import numpy as np

from pangyplot.db.indexes.BubbleIndex import BubbleIndex
from pangyplot.db.indexes.LinkIndex import LinkIndex
from pangyplot.db.indexes.SegmentIndex import SegmentIndex
from pangyplot.db.indexes.StepIndex import StepIndex

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


def test_segment_mmap_index_roundtrip():
    tempdir = tempfile.mkdtemp()

    try:
        n = 500
        original = SegmentIndex.__new__(SegmentIndex)
        original.dir = tempdir
        original.length = array('I', [i * 3 for i in range(n)])
        original.x1 = array('f', [float(i) for i in range(n)])
        original.y1 = array('f', [float(i) + 0.5 for i in range(n)])
        original.x2 = array('f', [float(i) + 1.0 for i in range(n)])
        original.y2 = array('f', [float(i) + 1.5 for i in range(n)])
        original.valid = array('B', [1 if i % 3 != 0 else 0 for i in range(n)])
        original._count = sum(original.valid)

        original.save_mmap_index()

        reloaded = SegmentIndex.__new__(SegmentIndex)
        reloaded.dir = tempdir
        success = reloaded.load_mmap_index()

        assert success, "Mmap index failed to load"
        assert len(reloaded.valid) == n
        assert reloaded._count == original._count

        # Spot-check values
        for i in [0, 1, 99, 249, 499]:
            assert reloaded.length[i] == original.length[i]
            assert np.isclose(reloaded.x1[i], original.x1[i])
            assert np.isclose(reloaded.y1[i], original.y1[i])
            assert np.isclose(reloaded.x2[i], original.x2[i])
            assert np.isclose(reloaded.y2[i], original.y2[i])
            assert reloaded.valid[i] == original.valid[i]

        # Verify types are mmap'd
        assert isinstance(reloaded.x1, np.memmap)

    finally:
        shutil.rmtree(tempdir)


def test_segment_mmap_validate():
    tempdir = tempfile.mkdtemp()

    try:
        # Empty dir should fail validation
        assert not SegmentIndex.validate(tempdir)

        # Build and save a valid index
        idx = SegmentIndex.__new__(SegmentIndex)
        idx.dir = tempdir
        idx.length = array('I', [10, 20, 30])
        idx.x1 = array('f', [1.0, 2.0, 3.0])
        idx.y1 = array('f', [1.0, 2.0, 3.0])
        idx.x2 = array('f', [1.0, 2.0, 3.0])
        idx.y2 = array('f', [1.0, 2.0, 3.0])
        idx.valid = array('B', [1, 1, 0])
        idx._count = 2
        idx.save_mmap_index()

        # Should now pass
        assert SegmentIndex.validate(tempdir)

    finally:
        shutil.rmtree(tempdir)


def test_step_mmap_index_roundtrip():
    tempdir = tempfile.mkdtemp()

    try:
        n = 300
        original = StepIndex.__new__(StepIndex)
        original.dir = tempdir
        original.genome = "TestGenome"
        original.starts = array('I', [i * 100 for i in range(n)])
        original.ends = array('I', [i * 100 + 50 for i in range(n)])
        original.segments = array('I', list(range(n)))

        original.save_mmap_index()

        reloaded = StepIndex.__new__(StepIndex)
        reloaded.dir = tempdir
        reloaded.genome = "TestGenome"
        success = reloaded.load_mmap_index()

        assert success, "Mmap index failed to load"
        assert len(reloaded.starts) == n

        # Spot-check values
        for i in [0, 1, 149, 299]:
            assert reloaded.starts[i] == original.starts[i]
            assert reloaded.ends[i] == original.ends[i]
            assert reloaded.segments[i] == original.segments[i]

        # Verify mmap'd
        assert isinstance(reloaded.starts, np.memmap)

        # Verify bisect works on mmap'd array
        import bisect
        idx = bisect.bisect_right(reloaded.starts, 5000)
        assert idx == bisect.bisect_right(original.starts, 5000)

    finally:
        shutil.rmtree(tempdir)


def test_step_mmap_validate():
    tempdir = tempfile.mkdtemp()

    try:
        assert not StepIndex.validate(tempdir)

        idx = StepIndex.__new__(StepIndex)
        idx.dir = tempdir
        idx.genome = "TestGenome"
        idx.starts = array('I', [0, 100, 200])
        idx.ends = array('I', [50, 150, 250])
        idx.segments = array('I', [1, 2, 3])
        idx.save_mmap_index()

        assert StepIndex.validate(tempdir)

    finally:
        shutil.rmtree(tempdir)


def test_link_mmap_index_roundtrip():
    tempdir = tempfile.mkdtemp()

    try:
        from bitarray import bitarray

        original = LinkIndex.__new__(LinkIndex)
        original.dir = tempdir
        original.strand_map = {'+': 1, '-': 0}
        original.rev_strand_map = {1: '+', 0: '-'}

        original.from_ids = array('I', [0, 1, 2, 3])
        original.to_ids = array('I', [1, 2, 3, 4])
        original.from_strands = bitarray([1, 1, 0, 1])
        original.to_strands = bitarray([1, 0, 1, 0])
        original.seg_index_offsets = array('I', [0, 0, 1, 2, 3])
        original.seg_index_counts = array('B', [1, 2, 2, 2, 1])
        original.seg_index_flat = array('I', [0, 0, 1, 1, 2, 2, 3, 3])

        original.save_mmap_index()

        reloaded = LinkIndex.__new__(LinkIndex)
        reloaded.dir = tempdir
        reloaded.strand_map = {'+': 1, '-': 0}
        reloaded.rev_strand_map = {1: '+', 0: '-'}
        success = reloaded.load_mmap_index()

        assert success, "Mmap index failed to load"
        assert len(reloaded.from_ids) == 4

        # Spot-check values
        for i in range(4):
            assert reloaded.from_ids[i] == original.from_ids[i]
            assert reloaded.to_ids[i] == original.to_ids[i]
            assert reloaded.from_strands[i] == original.from_strands[i]
            assert reloaded.to_strands[i] == original.to_strands[i]

        # Verify strand map lookup works with numpy uint8
        assert reloaded.rev_strand_map[reloaded.from_strands[0]] == '+'
        assert reloaded.rev_strand_map[reloaded.to_strands[1]] == '-'

        # Verify mmap'd
        assert isinstance(reloaded.from_ids, np.memmap)

    finally:
        shutil.rmtree(tempdir)


def test_link_mmap_validate():
    tempdir = tempfile.mkdtemp()

    try:
        from bitarray import bitarray

        assert not LinkIndex.validate(tempdir)

        idx = LinkIndex.__new__(LinkIndex)
        idx.dir = tempdir
        idx.strand_map = {'+': 1, '-': 0}
        idx.rev_strand_map = {1: '+', 0: '-'}
        idx.from_ids = array('I', [0])
        idx.to_ids = array('I', [1])
        idx.from_strands = bitarray([1])
        idx.to_strands = bitarray([0])
        idx.seg_index_offsets = array('I', [0, 0])
        idx.seg_index_counts = array('B', [1, 1])
        idx.seg_index_flat = array('I', [0, 0])
        idx.save_mmap_index()

        assert LinkIndex.validate(tempdir)

    finally:
        shutil.rmtree(tempdir)


def test_bubble_mmap_index_roundtrip():
    tempdir = tempfile.mkdtemp()

    try:
        n = 200
        original = BubbleIndex.__new__(BubbleIndex)
        original.dir = tempdir
        original.bubble_to_parent = array('I', [0] * 50)
        original.segment_to_bubble = array('I', [0] * 300)
        original.start_steps = array('I', [i * 10 for i in range(n)])
        original.end_steps = array('I', [i * 10 + 5 for i in range(n)])
        original.ids = array('I', list(range(n)))
        original.layout_x1 = array('f', [float(i) for i in range(n)])
        original.layout_x2 = array('f', [float(i) + 1.0 for i in range(n)])
        original.layout_ids = array('I', list(range(n)))

        original.save_mmap_index()

        reloaded = BubbleIndex.__new__(BubbleIndex)
        reloaded.dir = tempdir
        success = reloaded.load_mmap_index()

        assert success, "Mmap index failed to load"
        assert len(reloaded.ids) == n

        for i in [0, 1, 99, 199]:
            assert reloaded.start_steps[i] == original.start_steps[i]
            assert reloaded.end_steps[i] == original.end_steps[i]
            assert reloaded.ids[i] == original.ids[i]
            assert np.isclose(reloaded.layout_x1[i], original.layout_x1[i])
            assert np.isclose(reloaded.layout_x2[i], original.layout_x2[i])

        # Verify mmap'd
        assert isinstance(reloaded.start_steps, np.memmap)

        # Verify prefix_max_x2 was rebuilt (not mmap'd, writable)
        assert isinstance(reloaded.prefix_max_x2, np.ndarray)
        assert not isinstance(reloaded.prefix_max_x2, np.memmap)

    finally:
        shutil.rmtree(tempdir)


def test_bubble_mmap_validate():
    tempdir = tempfile.mkdtemp()

    try:
        assert not BubbleIndex.validate(tempdir)

        idx = BubbleIndex.__new__(BubbleIndex)
        idx.dir = tempdir
        idx.bubble_to_parent = array('I', [0, 0])
        idx.segment_to_bubble = array('I', [0, 0])
        idx.start_steps = array('I', [0])
        idx.end_steps = array('I', [5])
        idx.ids = array('I', [1])
        idx.layout_x1 = array('f', [0.0])
        idx.layout_x2 = array('f', [1.0])
        idx.layout_ids = array('I', [1])
        idx.save_mmap_index()

        assert BubbleIndex.validate(tempdir)

    finally:
        shutil.rmtree(tempdir)
