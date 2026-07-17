__version__ = "v0.3.0"
__version_name__ = "Burrows"
__author__ = "Scott Mastromatteo"

# Stamped versions that are treated as equivalent to __version__ for the
# purpose of on-disk artifact compatibility (skeletons, path indexes, etc.).
# Add a version here when its on-disk format is unchanged from the current
# version; remove it on a format-breaking bump to force regeneration.
COMPATIBLE_VERSIONS = {"v0.1.0", "v0.2.0"}


def is_compatible_version(stamped):
    return stamped == __version__ or stamped in COMPATIBLE_VERSIONS