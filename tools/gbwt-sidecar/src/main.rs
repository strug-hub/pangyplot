// GBWT path-service sidecar for PangyPlot (Stage 3).
//
// Loads a per-chromosome GBZ once and answers path queries over localhost HTTP.
// Node ids are used directly as PangyPlot segment ids (the ingest guarantees
// node id == segment id; no chopping/translation). Flask does region filtering
// and varint encoding in Python, so this service stays minimal.
//
// Endpoints:
//   GET /health                 -> "ok"
//   GET /meta                   -> JSON: nodes, paths, samples, path_list[]
//   GET /walk?path=<id>         -> binary: little-endian i64 array, one per step,
//                                  value = (segment_id << 1) | orientation_bit
//                                  (+ = 0, - = 1) -- PangyPlot's `combined` form.
//   GET /count?node=<id>        -> text: haplotype occurrence count at the node
//
// Usage: gbwt-sidecar <graph.gbz> [addr]     (addr default 127.0.0.1:5701)

use std::env;
use std::io::Cursor;
use std::sync::Arc;

use gbz::{GBZ, Orientation};
use simple_sds::serialize;
use tiny_http::{Header, Response, Server};

type Resp = Response<Cursor<Vec<u8>>>;

fn main() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: {} <graph.gbz> [addr]", args[0]);
        std::process::exit(1);
    }
    let filename = &args[1];
    let addr = args
        .get(2)
        .cloned()
        .unwrap_or_else(|| "127.0.0.1:5701".to_string());

    eprintln!("[gbwt-sidecar] loading {}", filename);
    let gbz: GBZ = serialize::load_from(filename).map_err(|e| e.to_string())?;
    eprintln!(
        "[gbwt-sidecar] loaded: {} nodes, {} paths",
        gbz.nodes(),
        gbz.paths()
    );
    let gbz = Arc::new(gbz);

    let server = Server::http(&addr).map_err(|e| e.to_string())?;
    eprintln!("[gbwt-sidecar] listening on http://{}", addr);

    for req in server.incoming_requests() {
        let (path, query) = split_url(req.url());
        let resp = match path.as_str() {
            "/health" => text("ok"),
            "/meta" => handle_meta(&gbz),
            "/walk" => handle_walk(&gbz, &query),
            "/count" => handle_count(&gbz, &query),
            _ => text("not found").with_status_code(404),
        };
        let _ = req.respond(resp);
    }
    Ok(())
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

// --- handlers --------------------------------------------------------------

fn handle_meta(gbz: &GBZ) -> Resp {
    let mut samples: Vec<String> = Vec::new();
    let mut path_list: Vec<serde_json::Value> = Vec::new();

    if let Some(md) = gbz.metadata() {
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
            "nodes": gbz.nodes(),
            "paths": gbz.paths(),
            "has_metadata": gbz.has_metadata(),
            "samples": samples,
            "path_list": path_list,
        })
        .to_string(),
    )
}

fn handle_walk(gbz: &GBZ, query: &[(String, String)]) -> Resp {
    let pid: usize = match param(query, "path").and_then(|s| s.parse().ok()) {
        Some(p) => p,
        None => return bad_request("missing or bad ?path="),
    };

    // combined = (segment_id << 1) | orientation_bit, emitted as LE i64.
    let mut buf: Vec<u8> = Vec::new();
    if let Some(iter) = gbz.path(pid, Orientation::Forward) {
        for (node_id, orient) in iter {
            let bit = if orient == Orientation::Reverse { 1 } else { 0 };
            let combined = ((node_id as i64) << 1) | bit;
            buf.extend_from_slice(&combined.to_le_bytes());
        }
    }
    binary(buf)
}

fn handle_count(gbz: &GBZ, query: &[(String, String)]) -> Resp {
    let nid: usize = match param(query, "node").and_then(|s| s.parse().ok()) {
        Some(n) => n,
        None => return bad_request("missing or bad ?node="),
    };
    let count = if gbz.has_node(nid) {
        gbz.search_state(nid, Orientation::Forward)
            .map(|s| s.len())
            .unwrap_or(0)
    } else {
        0
    };
    text(&count.to_string())
}
