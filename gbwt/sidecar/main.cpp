// C++ GBWT path-service sidecar for PangyPlot.
//
// Honours the localhost wire contract in gbwt/sidecar/README.md, so nothing above
// the HTTP boundary changes. The point of the C++ implementation is MEMORY: it
// serves the GBWT **memory-mapped** from disk
// (fork github.com/ScottMastro/gbwt-mmap), so resident memory scales with the
// working set of active queries instead of the whole index. The document-array
// samples are skipped at load (with_da=false) since only `locate` needs them and
// the wire contract exposes only count/walk.
//
// Endpoints (see gbwt/sidecar/README.md -- the protocol is the boundary):
//   GET /health          -> "ok"
//   GET /meta            -> JSON: nodes, paths, has_metadata, has_translation,
//                           samples[], path_list[{id,sample,contig,phase,fragment}]
//   GET /walk?path=<id>  -> binary: little-endian i64 array, one per step,
//                           value = (segment_id << 1) | orientation_bit
//   GET /count?node=<id> -> text: haplotype occurrence count at the node
//
// Usage: pangyplot-gbwt-sidecar <graph.gbwt|graph.gbz> [addr]   (default 127.0.0.1:5701)
//
// NOTE: native `graph.gbwt` (PangyPlot's build: node id == segment id) is fully
// supported. A chopped GBZ carries a node->segment translation in its GBWTGraph
// (segment names + an sd_vector marking each segment's first node id); we parse
// that translation and collapse chopped node runs back to segment ids in /walk,
// so an adopted chopped GBZ serves the same segment-level walks as the binpaths.

#include <gbwt/gbwt.h>
#include <gbwt/support.h>

#include <sdsl/sd_vector.hpp>
#include <sdsl/simple_sds.hpp>

#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {

// ---- the loaded index (read-only after startup; shared by all workers) ------
gbwt::GBWT g_index;
void*      g_map = nullptr;   // mmap of the whole file; must outlive g_index
size_t     g_map_len = 0;

// Node->segment translation from a chopped GBZ's GBWTGraph. Empty for a native
// graph.gbwt (node id == segment id, nothing to translate). `g_segments[rank]`
// is the segment name; `g_node_to_segment` has a set bit at each segment's first
// node id, so `predecessor(node_id)->first` is that segment's rank.
bool               g_has_translation = false;
gbwt::StringArray  g_segments;
sdsl::sd_vector<>  g_node_to_segment;

constexpr std::uint32_t GBWT_TAG = 0x6B376B37;
constexpr std::uint32_t GBZ_TAG  = 0x205A4247; // "GBZ "

// GBWTGraph header: {u32 tag, u32 version, u64 nodes, u64 flags} = 24 bytes,
// serialized raw (simple-sds "value"). See jltsiren/gbwtgraph gbwtgraph.h.
struct GBWTGraphHeader {
  std::uint32_t tag;
  std::uint32_t version;
  std::uint64_t nodes;
  std::uint64_t flags;
};
constexpr std::uint32_t GBWTGRAPH_TAG              = 0x6B3764AF;
constexpr std::uint32_t GBWTGRAPH_ZSTD_VERSION     = 4;      // >= 4: zstd sequences
constexpr std::uint64_t GBWTGRAPH_FLAG_TRANSLATION = 0x0001;

// ---- tiny HTTP plumbing (4 GET endpoints; no external dependency) -----------

struct Response {
  int         status = 200;
  std::string content_type = "text/plain";
  std::string body;
};

std::string json_escape(const std::string& s) {
  std::string out;
  out.reserve(s.size() + 2);
  for (char c : s) {
    switch (c) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n";  break;
      case '\r': out += "\\r";  break;
      case '\t': out += "\\t";  break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char buf[8]; std::snprintf(buf, sizeof(buf), "\\u%04x", c); out += buf;
        } else { out += c; }
    }
  }
  return out;
}

// Parse "?path=5&node=7" style query into a single wanted key's value.
bool query_int(const std::string& query, const std::string& key, long long& out) {
  std::string needle = key + "=";
  size_t pos = 0;
  while (pos < query.size()) {
    size_t amp = query.find('&', pos);
    std::string kv = query.substr(pos, amp == std::string::npos ? std::string::npos : amp - pos);
    if (kv.rfind(needle, 0) == 0) {
      try { out = std::stoll(kv.substr(needle.size())); return true; }
      catch (...) { return false; }
    }
    if (amp == std::string::npos) break;
    pos = amp + 1;
  }
  return false;
}

// ---- handlers ---------------------------------------------------------------

Response handle_meta() {
  const gbwt::GBWT& idx = g_index;
  bool has_meta = idx.hasMetadata();

  std::ostringstream samples, paths;
  samples << "[";
  paths << "[";
  if (has_meta) {
    const gbwt::Metadata& md = idx.metadata;
    bool have_names = md.hasSampleNames();
    for (gbwt::size_type i = 0; i < md.samples(); i++) {
      if (i) samples << ",";
      samples << "\"" << json_escape(have_names ? md.sample(i) : std::to_string(i)) << "\"";
    }
    bool have_contigs = md.hasContigNames();
    for (gbwt::size_type i = 0; i < md.paths(); i++) {
      const gbwt::PathName& pn = md.path(i);
      if (i) paths << ",";
      std::string sname = have_names ? md.sample(pn.sample) : std::to_string(pn.sample);
      std::string cname = have_contigs ? md.contig(pn.contig) : std::to_string(pn.contig);
      paths << "{\"id\":" << i
            << ",\"sample\":\"" << json_escape(sname) << "\""
            << ",\"contig\":\"" << json_escape(cname) << "\""
            << ",\"phase\":" << pn.phase
            << ",\"fragment\":" << pn.count << "}";
    }
  }
  samples << "]";
  paths << "]";

  gbwt::size_type npaths = has_meta ? idx.metadata.paths() : 0;
  std::ostringstream out;
  out << "{\"nodes\":0"                        // a bare GBWT reports no node count
      << ",\"paths\":" << npaths
      << ",\"has_metadata\":" << (has_meta ? "true" : "false")
      << ",\"has_translation\":" << (g_has_translation ? "true" : "false")
      << ",\"samples\":" << samples.str()
      << ",\"path_list\":" << paths.str()
      << "}";
  return {200, "application/json", out.str()};
}

Response handle_walk(const std::string& query) {
  long long pid = 0;
  if (!query_int(query, "path", pid) || pid < 0) return {400, "text/plain", "missing or bad ?path="};

  // The forward sequence of path p is sequence id 2*p.
  gbwt::vector_type walk = g_index.extract(gbwt::Path::encode(static_cast<gbwt::size_type>(pid), false));

  std::string body;
  if (!g_has_translation) {
    // Native compact GBWT: the node handle IS `combined` (node id == segment id,
    // 2*id + orient) -- emit it directly.
    body.resize(walk.size() * sizeof(std::int64_t));
    char* w = body.data();
    for (gbwt::node_type h : walk) {
      std::int64_t v = static_cast<std::int64_t>(h);
      std::memcpy(w, &v, sizeof(v));               // little-endian on x86/ARM
      w += sizeof(v);
    }
    return {200, "application/octet-stream", std::move(body)};
  }

  // Chopped GBZ: map each node id back to its segment. vg chops a long segment
  // into a run of contiguous node ids, so a single segment visit shows up as
  // adjacent nodes (forward: id+1 each; reverse: id-1 each) all in one segment.
  // Collapse *only* such runs into one segment step -- NOT genuine repeats of a
  // segment (a self-loop revisits the same node id, which is not adjacent), so
  // tandem repeats are preserved exactly as in the binpaths. Emit
  // (segment_id<<1)|orient -- PangyPlot's `combined` form.
  std::vector<std::int64_t> out;
  out.reserve(walk.size());
  bool have_prev = false;
  std::size_t prev_rank = 0;
  gbwt::size_type prev_nid = 0;
  int prev_orient = -1;
  for (gbwt::node_type h : walk) {
    gbwt::size_type nid = gbwt::Node::id(h);
    int orient = gbwt::Node::is_reverse(h) ? 1 : 0;
    auto iter = g_node_to_segment.predecessor(nid);
    if (iter == g_node_to_segment.one_end()) {
      // No translation entry (should not happen for a valid GBZ): fall back to
      // the raw node id as the segment id, and don't collapse across the gap.
      out.push_back((static_cast<std::int64_t>(nid) << 1) | orient);
      have_prev = false;
      continue;
    }
    std::size_t rank = iter->first;                // segment index in g_segments
    bool continues_run = have_prev && rank == prev_rank && orient == prev_orient &&
                         ((orient == 0 && nid == prev_nid + 1) ||
                          (orient == 1 && nid + 1 == prev_nid));
    prev_nid = nid; prev_orient = orient; prev_rank = rank; have_prev = true;
    if (continues_run) continue;
    std::int64_t seg_id = std::strtoll(g_segments.str(rank).c_str(), nullptr, 10);
    out.push_back((seg_id << 1) | orient);
  }
  body.resize(out.size() * sizeof(std::int64_t));
  std::memcpy(body.data(), out.data(), body.size());
  return {200, "application/octet-stream", std::move(body)};
}

Response handle_count(const std::string& query) {
  long long nid = 0;
  if (!query_int(query, "node", nid) || nid < 0) return {400, "text/plain", "missing or bad ?node="};
  // find() takes a GBWT node handle; forward handle of node n is 2*n.
  gbwt::size_type count = g_index.find(gbwt::Node::encode(static_cast<gbwt::size_type>(nid), false)).size();
  return {200, "text/plain", std::to_string(count)};
}

Response route(const std::string& path, const std::string& query) {
  if (path == "/health") return {200, "text/plain", "ok"};
  if (path == "/meta")   return handle_meta();
  if (path == "/walk")   return handle_walk(query);
  if (path == "/count")  return handle_count(query);
  return {404, "text/plain", "not found"};
}

// ---- socket server ----------------------------------------------------------

const char* status_text(int s) {
  switch (s) { case 200: return "OK"; case 400: return "Bad Request"; case 404: return "Not Found"; default: return "OK"; }
}

void write_all(int fd, const char* p, size_t n) {
  while (n > 0) {
    ssize_t k = ::send(fd, p, n, 0);
    if (k <= 0) return;
    p += k; n -= static_cast<size_t>(k);
  }
}

void handle_client(int fd) {
  // Read the request head (GET has no body); the request line is all we need.
  std::string buf;
  char tmp[4096];
  while (buf.find("\r\n") == std::string::npos) {
    ssize_t k = ::recv(fd, tmp, sizeof(tmp), 0);
    if (k <= 0) { ::close(fd); return; }
    buf.append(tmp, static_cast<size_t>(k));
    if (buf.size() > (1 << 16)) break; // guard against absurd request lines
  }

  // Parse "GET /path?query HTTP/1.1".
  std::string method, target;
  { std::istringstream line(buf.substr(0, buf.find("\r\n"))); line >> method >> target; }

  Response resp;
  if (method != "GET") {
    resp = {405, "text/plain", "method not allowed"};
  } else {
    std::string path = target, query;
    size_t q = target.find('?');
    if (q != std::string::npos) { path = target.substr(0, q); query = target.substr(q + 1); }
    resp = route(path, query);
  }

  std::ostringstream head;
  head << "HTTP/1.1 " << resp.status << " " << status_text(resp.status) << "\r\n"
       << "Content-Type: " << resp.content_type << "\r\n"
       << "Content-Length: " << resp.body.size() << "\r\n"
       << "Connection: close\r\n\r\n";
  std::string h = head.str();
  write_all(fd, h.data(), h.size());
  write_all(fd, resp.body.data(), resp.body.size());
  ::close(fd);
}

int run_server(const std::string& host, int port, int workers) {
  int listen_fd = ::socket(AF_INET, SOCK_STREAM, 0);
  if (listen_fd < 0) { std::perror("socket"); return 1; }
  int one = 1;
  ::setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<uint16_t>(port));
  if (::inet_pton(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
    std::cerr << "[gbwt-sidecar] bad host " << host << "\n"; return 1;
  }
  if (::bind(listen_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) { std::perror("bind"); return 1; }
  if (::listen(listen_fd, 128) != 0) { std::perror("listen"); return 1; }

  std::cerr << "[gbwt-sidecar] listening on http://" << host << ":" << port
            << " (" << workers << " workers)\n";

  // Each worker accepts + handles independently; the index is read-only and
  // shared, so no locking (matches the Rust sidecar and the lock-free design).
  std::vector<std::thread> pool;
  for (int i = 0; i < workers; i++) {
    pool.emplace_back([listen_fd] {
      for (;;) {
        int fd = ::accept(listen_fd, nullptr, nullptr);
        if (fd < 0) { if (errno == EINTR) continue; break; }
        handle_client(fd);
      }
    });
  }
  for (auto& t : pool) t.join();
  ::close(listen_fd);
  return 0;
}

// ---- loading ----------------------------------------------------------------

std::uint32_t peek_tag(const std::string& filename) {
  std::ifstream in(filename, std::ios::binary);
  std::uint32_t tag = 0;
  in.read(reinterpret_cast<char*>(&tag), sizeof(tag));
  return tag;
}

// Skip the GBWTGraph `sequences` without materializing the node DNA -- the whole
// point of the mmap design is not to pull gigabytes of sequence into RAM. The
// layout depends on the graph version:
//   v>=4 (zstd, compress_even): index sd_vector | u64 string_size | zstd byte vec
//   v<4  (plain StringArray):   index sd_vector | int_vector<8> alphabet | int_vector strings
// For zstd we load the tiny index + size and seek past the compressed blob; for
// the plain form we load-and-discard the (compact) components to stay in sync.
void skip_sequences(std::istream& in, std::uint32_t version) {
  sdsl::sd_vector<> index; index.simple_sds_load(in);   // one bit per sequence; small
  if (version >= GBWTGRAPH_ZSTD_VERSION) {
    (void) sdsl::simple_sds::load_value<std::uint64_t>(in);          // uncompressed length
    std::uint64_t n = sdsl::simple_sds::load_value<std::uint64_t>(in); // zstd byte count
    std::uint64_t padded = (n + 7) & ~static_cast<std::uint64_t>(7);
    in.seekg(static_cast<std::streamoff>(padded), std::ios::cur);
  } else {
    sdsl::int_vector<8> alphabet; alphabet.simple_sds_load(in);
    sdsl::int_vector<>  strings;  strings.simple_sds_load(in);
  }
}

// Parse the node->segment translation from the GBWTGraph that follows the GBWT
// in a GBZ. `in` must be positioned at the GBWTGraph header (where GBWT::load
// leaves it). Loads only the translation (segment names + the node->segment
// sd_vector); the node sequences are skipped, not read.
void load_translation(std::istream& in) {
  GBWTGraphHeader gh = sdsl::simple_sds::load_value<GBWTGraphHeader>(in);
  if (gh.tag != GBWTGRAPH_TAG) {
    std::cerr << "[gbwt-sidecar] GBWTGraph tag 0x" << std::hex << gh.tag << std::dec
              << " unrecognized; serving raw node ids\n";
    return;
  }
  skip_sequences(in, gh.version);

  // The translation is always present in simple-sds (possibly empty).
  g_segments.simple_sds_load(in);
  g_node_to_segment.simple_sds_load(in);
  g_has_translation = (gh.flags & GBWTGRAPH_FLAG_TRANSLATION) && g_segments.size() > 0;
}

// mmap the file and load the GBWT in place (bulk zero-copy, DA skipped). For a
// GBZ, also parse the following GBWTGraph's node->segment translation so /walk
// returns segment ids. `gbwt_offset` is where the GBWT starts (0 for a native
// .gbwt; past the GBZ header + tags for a .gbz).
bool load_mmapped(const std::string& filename, std::streamoff gbwt_offset,
                  bool read_translation) {
  int fd = ::open(filename.c_str(), O_RDONLY);
  if (fd < 0) { std::perror("open"); return false; }
  struct stat sb{};
  if (::fstat(fd, &sb) != 0) { std::perror("fstat"); ::close(fd); return false; }
  g_map_len = static_cast<size_t>(sb.st_size);
  g_map = ::mmap(nullptr, g_map_len, PROT_READ, MAP_PRIVATE, fd, 0);
  ::close(fd);
  if (g_map == MAP_FAILED) { std::perror("mmap"); g_map = nullptr; return false; }
  ::madvise(g_map, g_map_len, MADV_RANDOM);

  std::ifstream in(filename, std::ios::binary);
  in.seekg(gbwt_offset);
  const auto* base = static_cast<const gbwt::byte_type*>(g_map);
  g_index.load(in, base, /*with_da=*/false);
  // GBWT::load reads the DA option + metadata from `in`, so it is now positioned
  // exactly at the start of the embedded GBWTGraph -- parse the translation.
  if (read_translation) { load_translation(in); }
  return true;
}

// Advance a stream past a GBZ's header (16 bytes) + tags to the embedded GBWT.
std::streamoff gbz_gbwt_offset(const std::string& filename) {
  std::ifstream in(filename, std::ios::binary);
  in.seekg(16); // GBZ Header {u32 tag, u32 version, u64 flags} = 16 bytes, no padding
  gbwt::Tags tags;
  tags.simple_sds_load(in);
  return in.tellg();
}

} // namespace

int main(int argc, char** argv) {
  std::signal(SIGPIPE, SIG_IGN);
  if (argc < 2) {
    std::cerr << "usage: " << argv[0] << " <graph.gbwt|graph.gbz> [addr]\n";
    return 1;
  }
  std::string filename = argv[1];
  std::string addr = (argc > 2) ? argv[2] : "127.0.0.1:5701";

  std::string host = "127.0.0.1";
  int port = 5701;
  { size_t c = addr.rfind(':');
    if (c != std::string::npos) { host = addr.substr(0, c); port = std::stoi(addr.substr(c + 1)); } }

  std::cerr << "[gbwt-sidecar] loading " << filename << "\n";
  std::uint32_t tag = peek_tag(filename);
  try {
    if (tag == GBZ_TAG) {
      // Serve the GBWT embedded in the GBZ (mmap'd) and parse the following
      // GBWTGraph's node->segment translation, so a chopped GBZ returns
      // segment-level walks (see load_translation / handle_walk).
      std::cerr << "[gbwt-sidecar] GBZ detected; serving embedded GBWT\n";
      if (!load_mmapped(filename, gbz_gbwt_offset(filename), /*read_translation=*/true))
        return 1;
    } else if (tag == GBWT_TAG) {
      if (!load_mmapped(filename, 0, /*read_translation=*/false)) return 1;
    } else {
      std::cerr << "[gbwt-sidecar] unrecognized file tag 0x" << std::hex << tag << "\n";
      return 1;
    }
  } catch (const std::exception& e) {
    std::cerr << "[gbwt-sidecar] load failed: " << e.what() << "\n";
    return 1;
  }

  gbwt::size_type npaths = g_index.hasMetadata() ? g_index.metadata.paths() : 0;
  std::cerr << "[gbwt-sidecar] loaded: " << npaths << " paths (mmap'd, DA skipped)\n";

  unsigned hw = std::thread::hardware_concurrency();
  int workers = static_cast<int>(hw ? (hw < 2 ? 2 : (hw > 8 ? 8 : hw)) : 4);
  return run_server(host, port, workers);
}
