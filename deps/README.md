# deps/ — pinned C++ toolchain for the GBWT graphd

The GBWT path daemon (`gbwt/graphd/pangyplot-graphd`) links **static `gbwt` +
static `sdsl`**. Those two libraries are not on any package index at the versions
we need, so their sources are vendored here as **git submodules pinned to exact
commits** — this is what makes the Docker image (and any from-source build)
reproducible: no floating branches, no opaque prebuilt binaries.

| submodule | upstream | pinned commit |
|-----------|----------|---------------|
| `deps/sdsl-lite` | https://github.com/vgteam/sdsl-lite | `349de44` (`v2.3.1-vgteam-21-g349de44`) |
| `deps/gbwt-mmap` | https://github.com/ScottMastro/gbwt-mmap (branch `mmap-serving`) | `ac9a59a` |

These are the exact commits the v0.3.0 "Burrows" graphd was built against.

## Fetching

```bash
git clone --recurse-submodules https://github.com/strug-hub/pangyplot
# or, in an existing checkout:
git submodule update --init --recursive
```

## Build order

`sdsl-lite` first (gbwt links against it), then `gbwt-mmap`, then the graphd:

```bash
# 1. sdsl-lite -> install prefix (headers + libsdsl.a)
#    (built + installed to a prefix, e.g. $PWD/deps/.build/sdsl)
# 2. gbwt-mmap -> lib/libgbwt.a + include/, built against that sdsl
# 3. graphd:
make -C gbwt/graphd \
     GBWT_DIR=<path-to-built-gbwt-mmap> \
     SDSL_PREFIX=<sdsl-install-prefix>
```

The Docker image (v0.3.0+) does exactly this in a builder stage and copies only
the resulting `pangyplot-graphd` binary into the slim runtime image. See
`docker/Dockerfile`.

## Bumping a pin

```bash
git -C deps/gbwt-mmap fetch && git -C deps/gbwt-mmap checkout <new-sha>
git add deps/gbwt-mmap && git commit -m "Bump gbwt-mmap to <new-sha>"
```

A pin change invalidates the Docker builder layer, so the toolchain recompiles
only when you deliberately move a commit.
