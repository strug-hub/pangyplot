#!/usr/bin/env bash
# Build the native C++ GBWT builder (gbwt/build-cpp/gbwt-build).
#
# Links against the C++ gbwt library (the gbwt-mmap fork) + the vgteam sdsl-lite
# install -- the same toolchain the C++ sidecar uses. Both are built separately
# (see context/gbwt-mmap-cpp-investigation.md). Override their locations with
# GBWT_FORK / SDSL_PREFIX if they aren't in the default sibling layout.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
FORK="${GBWT_FORK:-$here/../../../gbwt-mmap}"
SDSL="${SDSL_PREFIX:-$here/../../../local}"

for p in "$FORK/lib/libgbwt.a" "$SDSL/lib/libsdsl.a"; do
  [ -f "$p" ] || { echo "missing $p — build the gbwt fork + sdsl, or set GBWT_FORK/SDSL_PREFIX"; exit 1; }
done

g++ -std=c++17 -O2 -fopenmp -pthread \
  -I "$FORK/include" -I "$SDSL/include" \
  "$here/main.cpp" \
  "$FORK/lib/libgbwt.a" "$SDSL/lib/libsdsl.a" \
  "$SDSL/lib/libdivsufsort.a" "$SDSL/lib/libdivsufsort64.a" \
  $(pkg-config --libs libzstd) \
  -o "$here/gbwt-build"
echo "built $here/gbwt-build"
