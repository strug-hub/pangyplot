// GBWT Stage 3 spike — measures the numbers that gate GBWT adoption.
// See ../../context/gbwt-migration.md, "Stage 3 spike — runbook".
//
// Covers spike steps (2) extract latency [Query B] and (3) presence-count
// latency over a node window [Query A]. Step (1) storage is a plain `du`; step
// (4) wire-shape is estimated from (2)+(3). NOT built or run in-repo (needs a
// real .gbz + memory); run when free.
//
// Usage:
//   gbwt-spike <graph.gbz> [win_lo win_hi]
//   win_lo/win_hi: node-id window to probe for presence (default: a ~5% slice).
//
// API note (verified against gbwt-rs 2026-07-15): gbwt-rs exposes extract
// (Query B) and presence COUNTS (find/search_state -> len). It does NOT expose
// the sample SET (it cannot interpret the C++ document-array samples). Exact
// set-membership therefore needs C++ `locate` or a precomputed index; see
// context/gbwt-migration.md §7a. This harness measures only what Rust can do.

use gbz::{GBZ, Orientation};
use simple_sds::serialize;
use std::env;
use std::time::Instant;

fn main() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: {} <graph.gbz> [win_lo win_hi]", args[0]);
        std::process::exit(1);
    }
    let filename = &args[1];

    // --- load ---
    let t = Instant::now();
    let gbz: GBZ = serialize::load_from(filename).map_err(|e| e.to_string())?;
    println!("loaded {} in {:?}", filename, t.elapsed());
    println!("nodes: {}, paths: {}", gbz.nodes(), gbz.paths());

    // node-id window to probe for presence
    let (lo, hi) = if args.len() >= 4 {
        (
            args[2].parse().map_err(|_| "bad win_lo")?,
            args[3].parse().map_err(|_| "bad win_hi")?,
        )
    } else {
        let (min, max) = (gbz.min_node(), gbz.max_node());
        let span = ((max - min) / 20).max(1); // ~5% of the id space
        (min + span, min + 2 * span)
    };
    println!("presence window: node ids [{}, {}] ({} ids)", lo, hi, hi - lo + 1);

    // --- (2) extract latency [Query B]: full-walk extraction, upper bound ---
    let k = gbz.paths().min(8);
    let t = Instant::now();
    let mut node_steps = 0usize;
    for pid in 0..k {
        if let Some(iter) = gbz.path(pid, Orientation::Forward) {
            node_steps += iter.count();
        }
    }
    println!(
        "(2) extract {} whole paths: {:?}  ({} node-steps)",
        k,
        t.elapsed(),
        node_steps
    );

    // --- (3) presence COUNTS [Query A]: search_state(node).len() over window ---
    let t = Instant::now();
    let mut probed = 0usize;
    let mut total_occ = 0usize;
    for nid in lo..=hi {
        if !gbz.has_node(nid) {
            continue;
        }
        if let Some(state) = gbz.search_state(nid, Orientation::Forward) {
            total_occ += state.len();
            probed += 1;
        }
    }
    println!(
        "(3) presence-count over {} window nodes: {:?}  ({} total occurrences)",
        probed,
        t.elapsed(),
        total_occ
    );
    println!("    counts only; exact sample SET is out of scope for gbwt-rs (see §7a).");

    Ok(())
}
