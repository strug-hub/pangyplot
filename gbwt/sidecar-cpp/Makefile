# C++ GBWT sidecar for PangyPlot.
#
# Depends on the mmap-serving gbwt fork (github.com/ScottMastro/gbwt-mmap) and the
# vgteam sdsl-lite it is built against. Override the paths if your checkout differs:
#   make GBWT_DIR=/path/to/gbwt-mmap SDSL_PREFIX=/path/to/local
#
# Defaults assume the layout this was developed in:
#   <root>/gbwt-mmap   (the fork, built: has lib/libgbwt.a + include/)
#   <root>/local       (installed sdsl: has lib/libsdsl.a + include/)
#   <root>/pangyplot   (this repo; Makefile at gbwt/sidecar-cpp/)

GBWT_DIR    ?= ../../../gbwt-mmap
SDSL_PREFIX ?= ../../../local

BIN     := pangyplot-gbwt-sidecar
CXX     ?= c++
# -fopenmp: the gbwt library is compiled with OpenMP (parallel sort / resample),
# so its symbols must be resolved at link time even though the sidecar itself
# does no OpenMP.
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra -pthread -fopenmp
INCLUDES := -I$(GBWT_DIR)/include -I$(SDSL_PREFIX)/include
LIBS     := $(GBWT_DIR)/lib/libgbwt.a -L$(SDSL_PREFIX)/lib -lsdsl -lzstd -pthread -fopenmp

$(BIN): main.cpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) main.cpp $(LIBS) -o $(BIN)

clean:
	rm -f $(BIN)

.PHONY: clean
