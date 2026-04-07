import os
import tempfile
from pangyplot.db.indexes.SeqIndex import SeqWriter, SeqReader

def test_seq_read_write_roundtrip():
    test_seqs = [
        "", "A", "AC", "ACGT", "NNNN", "ACGTNACGTN", "T" * 255
    ]

    with tempfile.NamedTemporaryFile(delete=False) as tf:
        filepath = tf.name

    try:
        writer = SeqWriter(filepath)
        for seq in test_seqs:
            writer.write_seq(seq)
        writer.close()

        reader = SeqReader(filepath)
        for expected in test_seqs:
            result = reader.next_seq()
            assert result == expected, f"Mismatch: {expected} vs {result}"
        assert reader.next_seq() is None  # EOF
        reader.close()

    finally:
        os.remove(filepath)
