# Releasing PangyPlot

The steps to cut a release, publish the container, and archive it on Zenodo.
Ordering matters — the container digest and the Zenodo DOI each only exist after
an earlier step, so a couple of things are deliberate follow-ups.

## 1. Bump the version

- `pangyplot/version.py` — `__version__` (e.g. `v0.3.0`) and `__version_name__`.
  Add the *previous* version to `COMPATIBLE_VERSIONS` **if the on-disk format is
  unchanged** (a plain label bump is), so existing datastores don't regenerate.
- `CITATION.cff` — `version` and `date-released`.
- Commit to `main`.

## 2. Tag → CI builds and pushes the container

The `docker-publish.yml` workflow builds the image and pushes it to GHCR on a
**published Release**, a **`v*` tag**, or a **manual dispatch**.

- Cut a GitHub **Release** off `main` for `vX.Y.Z` (this also feeds Zenodo, step 5),
  or push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
- For a dry run without touching the tag: **Actions → "Publish container to GHCR"
  → Run workflow** with the version.

The build compiles the GBWT graphd from the pinned `deps/` submodules
(`submodules: recursive` in the checkout), so **there is nothing to build
locally** — CI does it. Currently **CPU-only**; the GPU variant is commented out
in the workflow matrix until `docker/Dockerfile.gpu` also builds the graphd.

Tags pushed: `:X.Y.Z`, `:X.Y`, `:latest`, `:sha-<short>`.

## 3. Make the GHCR package public

New GHCR packages are **private** by default. Anonymous `docker pull` (and the
Zenodo pointer in step 6) need it public:

- **Packages → pangyplot → Package settings → Change visibility → Public**.
- If that setting is greyed out ("disabled by organization administrators"), a
  **`strug-hub` org owner** must first allow public packages under
  **Org Settings → Packages**, or flip the package themselves.

## 4. Grab the image digest

```bash
docker buildx imagetools inspect ghcr.io/strug-hub/pangyplot:X.Y.Z \
    --format '{{.Manifest.Digest}}'
```
(or read it from the workflow log). Record `ghcr.io/strug-hub/pangyplot@sha256:…`
— the immutable, content-addressed reference used below.

## 5. Archive on Zenodo → DOI

- **First time:** an org owner approves the **Zenodo OAuth app** for `strug-hub`
  (Org Settings → Third-party access), then enable the repo in Zenodo's GitHub tab.
  Zenodo only archives releases made **after** the toggle is on.
- Publishing the `vX.Y.Z` Release then makes Zenodo auto-archive the source and
  mint two DOIs: a **concept DOI** (stable, always latest) and a **version DOI**.

Reproducibility note: the release tarball is a `git archive`, which does **not**
include submodule contents — `deps/sdsl-lite` and `deps/gbwt-mmap` are empty in
it. Rebuilding from the tarball therefore needs the pinned submodule commits
re-fetched from their (public) upstreams. The published container image is the
self-contained artifact; the tarball is reproducible-by-reference.

## 6. Cross-link the container and the DOI

- On the **Zenodo record**: add the image digest from step 4 as a *related
  identifier* (relation e.g. "is supplemented by"). This is a pointer, not an
  archived copy — reproducibility of the image then rests on GHCR keeping it. To
  make it fully self-contained instead, upload
  `docker save ghcr.io/strug-hub/pangyplot:X.Y.Z | gzip` as a record file.
- In **`CITATION.cff`**: paste the **concept DOI** into the (currently commented)
  `identifiers:` block. Set it once — the concept DOI always resolves to latest.

## 7. Docs

- `docs/source/advanced/quickstart.rst` — bump the version-pinned image tag.
