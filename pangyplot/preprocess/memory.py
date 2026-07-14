"""Hand memory back to the OS between pipeline phases.

Parsing churns through tens of millions of short-lived objects, and the arenas
that churn leaves behind are not returned to the OS on their own: after parsing
v2 chrY, RSS sat at 0.96 G while the live indexes were 0.05 G. gc.collect() plus
malloc_trim(0) gave back 0.49 G of that.

This matters more than it sounds. Every later phase stacks on top of whatever
parse leaves resident, so the floor is added to the peak -- and it is the peak,
not the total, that decides whether a chromosome fits in RAM.
"""

import ctypes
import ctypes.util
import gc


def release():
    """Collect garbage and return freed arenas to the OS. Safe to call anywhere."""
    gc.collect()

    # glibc-only, and there is nothing to fall back to elsewhere -- other
    # allocators either release eagerly or offer no equivalent knob.
    try:
        libc_path = ctypes.util.find_library("c")
        if libc_path is None:
            return
        libc = ctypes.CDLL(libc_path)
        if hasattr(libc, "malloc_trim"):
            libc.malloc_trim(0)
    except (OSError, AttributeError):
        pass
