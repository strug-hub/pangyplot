"""Pieces shared by the legacy and flat bubble indexers.

Kept in one place so the two paths cannot drift while both exist -- a divergence
here would show up as a datastore diff and be blamed on the port.
"""


def collapse_ranges(steps):
    """Merge a set of step positions into contiguous [start, end] ranges."""
    if not steps:
        return []

    sorted_steps = sorted(int(s) for s in steps)
    ranges = []
    start = prev = sorted_steps[0]

    for step in sorted_steps[1:]:
        if step == prev + 1:
            prev = step
        else:
            ranges.append((start, prev))
            start = prev = step

    ranges.append((start, prev))
    return ranges


def find_children(bubbles):
    """Link each bubble to its parent's children list."""
    bubble_dict = {bubble.id: bubble for bubble in bubbles}

    for bubble in bubbles:
        if bubble.parent:
            bubble_parent = bubble_dict[bubble.parent]
            bubble_parent.add_child(bubble, bubble_dict)
