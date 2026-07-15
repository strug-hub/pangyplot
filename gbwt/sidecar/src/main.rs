// GBWT path-service sidecar for PangyPlot (Stage 3).
//
// Loads a per-chromosome path index once and answers path queries over localhost
// HTTP. Two index formats are supported behind one wire contract:
//
//   * graph.gbwt  -- a native compact GBWT (PangyPlot's own build): node id ==
//                    segment id, no translation. The default production format.
//   * graph.gbz   -- a GBZ (e.g. built by vg): may be chopped, so it carries a
//                    node->segment translation and walks go through segment_path.
//
// Either way walks come back in PangyPlot *segment* ids. Flask does region
// filtering and varint encoding in Python, so this service stays minimal.
//
// Endpoints:
//   GET /health                 -> "ok"
//   GET /meta                   -> JSON: nodes, paths, samples, path_list[]
//   GET /walk?path=<id>         -> binary: little-endian i64 array, one per step,
//                                  value = (segment_id << 1) | orientation_bit
//                                  (+ = 0, - = 1) -- PangyPlot's `combined` form.
//   GET /count?node=<id>        -> text: haplotype occurrence count at the node
//
// Usage: gbwt-sidecar <graph.gbwt|graph.gbz> [addr]   (addr default 127.0.0.1:5701)

use std::env;
use std::io::Cursor;
use std::sync::Arc;

use gbz::{support, Orientation, GBWT, GBZ};
use simple_sds::serialize;
use tiny_http::{Header, Response, Server};

type Resp = Response<Cursor<Vec<u8>>>;

/// The loaded path index. A GBZ carries sequences + an optional translation; a
/// bare GBWT is just the path index (compact, node = segment). Both answer the
/// same three queries; the enum keeps the format difference out of `route`.
enum Backend {
    Gbz(GBZ),
    Gbwt(GBWT),
}

fn main() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: {} <graph.gbwt|graph.gbz> [addr]", args[0]);
        std::process::exit(1);
    }
    let filename = &args[1];
    let addr = args
        .get(2)
        .cloned()
        .unwrap_or_else(|| "127.0.0.1:5701".to_string());

    eprintln!("[gbwt-sidecar] loading {}", filename);
    let backend = if GBZ::is_gbz(filename) {
        let gbz: GBZ = serialize::load_from(filename).map_err(|e| e.to_string())?;
        eprintln!(
            "[gbwt-sidecar] loaded GBZ: {} nodes, {} paths, translation={}",
            gbz.nodes(),
            gbz.paths(),
            gbz.has_translation()
        );
        Backend::Gbz(gbz)
    } else {
        let gbwt: GBWT = serialize::load_from(filename).map_err(|e| e.to_string())?;
        eprintln!(
            "[gbwt-sidecar] loaded GBWT: {} paths (compact, node = segment)",
            backend_paths_gbwt(&gbwt)
        );
        Backend::Gbwt(gbwt)
    };
    let backend = Arc::new(backend);

    // Serve concurrently: the index is read-only and Arc-shared, so worker
    // threads need no locking. Matters for the /select hot path (Stage 5);
    // harmless for paths. tiny_http hands each request to one worker.
    let server = Arc::new(Server::http(&addr).map_err(|e| e.to_string())?);
    let workers = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .clamp(2, 8);
    eprintln!(
        "[gbwt-sidecar] listening on http://{} ({} workers)",
        addr, workers
    );

    let mut handles = Vec::new();
    for _ in 0..workers {
        let server = Arc::clone(&server);
        let backend = Arc::clone(&backend);
        handles.push(std::thread::spawn(move || {
            for req in server.incoming_requests() {
                let (path, query) = split_url(req.url());
                let resp = route(&backend, &path, &query);
                let _ = req.respond(resp);
            }
        }));
    }
    for h in handles {
        let _ = h.join();
    }
    Ok(())
}

/// Dispatch a request. The (path, query) -> Resp mapping IS the wire contract;
/// see README "Wire protocol". Any implementation (Rust now, C++ later) that
/// honours it is a drop-in for the Python client.
fn route(backend: &Backend, path: &str, query: &[(String, String)]) -> Resp {
    match path {
        "/health" => text("ok"),
        "/meta" => handle_meta(backend),
        "/walk" => handle_walk(backend, query),
        "/count" => handle_count(backend, query),
        _ => text("not found").with_status_code(404),
    }
}

// --- routing helpers -------------------------------------------------------

fn split_url(url: &str) -> (String, Vec<(String, String)>) {
    match url.split_once('?') {
        None => (url.to_string(), Vec::new()),
        Some((p, q)) => {
            let params = q
                .split('&')
                .filter_map(|kv| kv.split_once('='))
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            (p.to_string(), params)
        }
    }
}

fn param<'a>(query: &'a [(String, String)], key: &str) -> Option<&'a str> {
    query.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn text(body: &str) -> Resp {
    Response::from_data(body.as_bytes().to_vec())
        .with_header(header("Content-Type", "text/plain"))
}

fn json(body: String) -> Resp {
    Response::from_data(body.into_bytes()).with_header(header("Content-Type", "application/json"))
}

fn binary(body: Vec<u8>) -> Resp {
    Response::from_data(body).with_header(header("Content-Type", "application/octet-stream"))
}

fn bad_request(msg: &str) -> Resp {
    text(msg).with_status_code(400)
}

// --- metadata (shared shape for both backends) -----------------------------

fn backend_paths_gbwt(gbwt: &GBWT) -> usize {
    gbwt.metadata().map(|md| md.paths()).unwrap_or(0)
}

/// Build the /meta JSON from a GBWT `Metadata` (both backends expose one).
fn meta_json(
    md: Option<&gbz::Metadata>,
    nodes: usize,
    paths: usize,
    has_metadata: bool,
    has_translation: bool,
) -> Resp {
    let mut samples: Vec<String> = Vec::new();
    let mut path_list: Vec<serde_json::Value> = Vec::new();

    if let Some(md) = md {
        for id in 0..md.samples() {
            samples.push(md.sample_name(id));
        }
        for (id, pn) in md.path_iter().enumerate() {
            path_list.push(serde_json::json!({
                "id": id,
                "sample": md.sample_name(pn.sample()),
                "contig": md.contig_name(pn.contig()),
                "phase": pn.phase(),
                "fragment": pn.fragment(),
            }));
        }
    }

    json(
        serde_json::json!({
            "nodes": nodes,
            "paths": paths,
            "has_metadata": has_metadata,
            "has_translation": has_translation,
            "samples": samples,
            "path_list": path_list,
        })
        .to_string(),
    )
}

fn handle_meta(backend: &Backend) -> Resp {
    match backend {
        Backend::Gbz(gbz) => meta_json(
            gbz.metadata(),
            gbz.nodes(),
            gbz.paths(),
            gbz.has_metadata(),
            gbz.has_translation(),
        ),
        Backend::Gbwt(gbwt) => meta_json(
            gbwt.metadata(),
            0, // a bare GBWT has no node/sequence count; informational only
            backend_paths_gbwt(gbwt),
            gbwt.has_metadata(),
            false,
        ),
    }
}

// --- walk ------------------------------------------------------------------

fn handle_walk(backend: &Backend, query: &[(String, String)]) -> Resp {
    let pid: usize = match param(query, "path").and_then(|s| s.parse().ok()) {
        Some(p) => p,
        None => return bad_request("missing or bad ?path="),
    };

    let mut buf: Vec<u8> = Vec::new();
    match backend {
        // vg GBZ may be chopped -> walk in GFA *segments* (segment.name = id).
        // Unchopped GBZ has node id == segment id.
        Backend::Gbz(gbz) => {
            if gbz.has_translation() {
                if let Some(iter) = gbz.segment_path(pid, Orientation::Forward) {
                    for (segment, orient) in iter {
                        match std::str::from_utf8(segment.name).ok().and_then(|s| s.parse::<i64>().ok()) {
                            Some(seg_id) => push_combined(&mut buf, seg_id, orient == Orientation::Reverse),
                            None => return bad_request("non-integer segment name; PangyPlot needs integer ids"),
                        }
                    }
                }
            } else if let Some(iter) = gbz.path(pid, Orientation::Forward) {
                for (node_id, orient) in iter {
                    push_combined(&mut buf, node_id as i64, orient == Orientation::Reverse);
                }
            }
        }
        // Native compact GBWT: node handle IS `combined`. The forward sequence of
        // path p is sequence id 2*p in a bidirectional GBWT.
        Backend::Gbwt(gbwt) => {
            if let Some(iter) = gbwt.sequence(2 * pid) {
                for handle in iter {
                    let (node_id, orient) = support::decode_node(handle);
                    push_combined(&mut buf, node_id as i64, orient == Orientation::Reverse);
                }
            }
        }
    }
    binary(buf)
}

fn push_combined(buf: &mut Vec<u8>, seg_id: i64, reverse: bool) {
    let combined = (seg_id << 1) | if reverse { 1 } else { 0 };
    buf.extend_from_slice(&combined.to_le_bytes());
}

// --- count -----------------------------------------------------------------

fn handle_count(backend: &Backend, query: &[(String, String)]) -> Resp {
    let nid: usize = match param(query, "node").and_then(|s| s.parse().ok()) {
        Some(n) => n,
        None => return bad_request("missing or bad ?node="),
    };

    let count = match backend {
        Backend::Gbz(gbz) => {
            if gbz.has_node(nid) {
                gbz.search_state(nid, Orientation::Forward)
                    .map(|s| s.len())
                    .unwrap_or(0)
            } else {
                0
            }
        }
        // find() takes a GBWT node handle; forward handle of node nid is 2*nid.
        Backend::Gbwt(gbwt) => gbwt
            .find(support::encode_node(nid, Orientation::Forward))
            .map(|s| s.len())
            .unwrap_or(0),
    };
    text(&count.to_string())
}
