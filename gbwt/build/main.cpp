// Native C++ GBWT builder for PangyPlot (GBWT migration Stage 3).
//
// Reads the PangyPlot "pathdata" intermediate (paths as `combined` node handles +
// metadata, emitted by pangyplot/preprocess/gbwt_build.py) and builds a compact,
// bidirectional GBWT with metadata via gbwt::GBWTBuilder, serialized to
// <output>.gbwt in simple-sds format.
//
// No vg, no chopping. PangyPlot's `combined = (segment_id << 1) | orientation_bit`
// IS a gbwt node handle: gbwt::Node::encode(id, rev) = (id << 1) | rev, Forward=0/
// Reverse=1. So node id == segment id with no node->segment translation, and the
// built GBWT serves walks byte-identical to the binpaths it is built from. This is
// the same construction gbwt::GBWTBuilder does inside vg -- minus vg's chopping
// GFA-import step (we feed pre-parsed compact paths).
//
// pathdata format (little-endian; x86-64):
//   magic "PPGB", u32 version(=1), u64 num_paths
//   per path: u32 sample_len, sample bytes; u32 contig_len, contig bytes;
//             u64 haplotype, u64 fragment;
//             u64 num_steps, num_steps x i64 combined (node handles, each >= 2)
//
// Usage: gbwt-build <input.pathdata> <output.gbwt>

#include <cstdint>
#include <fstream>
#include <iostream>
#include <set>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <gbwt/dynamic_gbwt.h>
#include <gbwt/gbwt.h>

using gbwt::node_type;
using gbwt::size_type;
using gbwt::vector_type;

static uint32_t read_u32(std::istream& in) { uint32_t v = 0; in.read(reinterpret_cast<char*>(&v), 4); return v; }
static uint64_t read_u64(std::istream& in) { uint64_t v = 0; in.read(reinterpret_cast<char*>(&v), 8); return v; }
static int64_t  read_i64(std::istream& in) { int64_t  v = 0; in.read(reinterpret_cast<char*>(&v), 8); return v; }

static std::string read_str(std::istream& in) {
  uint32_t n = read_u32(in);
  std::string s(n, '\0');
  if(n) in.read(&s[0], n);
  return s;
}

struct PathRec { std::string sample, contig; uint64_t hap = 0, frag = 0; vector_type nodes; };

int main(int argc, char** argv) {
  if(argc < 3) { std::cerr << "usage: " << argv[0] << " <input.pathdata> <output.gbwt>\n"; return 1; }

  std::ifstream in(argv[1], std::ios::binary);
  if(!in) { std::cerr << "[gbwt-build] cannot open " << argv[1] << "\n"; return 1; }

  char magic[4] = {0};
  in.read(magic, 4);
  if(std::string(magic, 4) != "PPGB") { std::cerr << "[gbwt-build] bad magic; not a pathdata file\n"; return 1; }
  uint32_t version = read_u32(in);
  if(version != 1) { std::cerr << "[gbwt-build] unsupported pathdata version " << version << "\n"; return 1; }
  uint64_t num_paths = read_u64(in);

  std::vector<PathRec> paths;
  paths.reserve(num_paths);
  node_type max_node = 0;

  for(uint64_t i = 0; i < num_paths; i++) {
    PathRec p;
    p.sample = read_str(in);
    p.contig = read_str(in);
    p.hap = read_u64(in);
    p.frag = read_u64(in);
    uint64_t n = read_u64(in);
    p.nodes.reserve(n);
    for(uint64_t j = 0; j < n; j++) {
      int64_t combined = read_i64(in);
      // Valid handles are >= 2 (segment id >= 1); handle 0 is the endmarker.
      if(combined < 2) { std::cerr << "[gbwt-build] path " << i << ": node handle " << combined << " < 2\n"; return 1; }
      node_type node = static_cast<node_type>(combined);
      if(node > max_node) max_node = node;
      p.nodes.push_back(node);
    }
    paths.push_back(std::move(p));
  }
  if(!in) { std::cerr << "[gbwt-build] truncated pathdata\n"; return 1; }

  // Node width: bits needed to hold the largest node handle.
  size_type node_width = 1;
  while((size_type(1) << node_width) <= static_cast<size_type>(max_node)) node_width++;

  // Build a bidirectional GBWT: insert each forward path, both_orientations=true
  // adds the reverse (required for bidirectional search / reverse extraction).
  gbwt::GBWTBuilder builder(node_width);
  for(auto& p : paths) builder.insert(p.nodes, true);
  builder.finish();

  // Compress the dynamic index, then attach metadata to the compressed GBWT.
  // The flag must be set explicitly (addMetadata()), and metadata lives on the
  // GBWT -- not the DynamicGBWT -- to be serialized. Mirrors gbwt's own builder.
  gbwt::GBWT compressed(builder.index);
  compressed.addMetadata();

  // Intern sample/contig names (first-appearance order); count distinct
  // (haplotype, fragment) pairs for the haplotype stat.
  std::vector<std::string> sample_names, contig_names;
  std::unordered_map<std::string, size_type> sample_id, contig_id;
  auto intern = [](const std::string& s, std::vector<std::string>& names,
                   std::unordered_map<std::string, size_type>& ids) -> size_type {
    auto it = ids.find(s);
    if(it != ids.end()) return it->second;
    size_type id = names.size();
    names.push_back(s);
    ids[s] = id;
    return id;
  };
  std::vector<size_type> psid(paths.size()), pcid(paths.size());
  std::set<std::pair<size_type, size_type>> haplotypes;
  for(size_t i = 0; i < paths.size(); i++) {
    psid[i] = intern(paths[i].sample, sample_names, sample_id);
    pcid[i] = intern(paths[i].contig, contig_names, contig_id);
    haplotypes.insert({static_cast<size_type>(paths[i].hap), static_cast<size_type>(paths[i].frag)});
  }

  compressed.metadata.setSamples(sample_names);
  compressed.metadata.setContigs(contig_names);
  compressed.metadata.setHaplotypes(haplotypes.size());
  for(size_t i = 0; i < paths.size(); i++) {
    compressed.metadata.addPath(psid[i], pcid[i],
                                static_cast<size_type>(paths[i].hap),
                                static_cast<size_type>(paths[i].frag));
  }

  std::ofstream out(argv[2], std::ios::binary);
  if(!out) { std::cerr << "[gbwt-build] cannot write " << argv[2] << "\n"; return 1; }
  compressed.simple_sds_serialize(out);
  out.close();

  std::cerr << "[gbwt-build] wrote " << argv[2] << " (" << num_paths << " paths, node_width " << node_width << ")\n";
  return 0;
}
