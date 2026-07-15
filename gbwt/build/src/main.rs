// Native GBWT builder for PangyPlot (GBWT migration Stage 3).
//
// Reads a PangyPlot "pathdata" intermediate (paths as `combined` node handles +
// metadata, emitted by pangyplot/preprocess/gbwt_build.py) and builds a compact,
// bidirectional GBWT with metadata, then serializes it to <output>.gbwt.
//
// No vg. No chopping. PangyPlot's segment ids are already compact and its
// `combined = (segment_id << 1) | orientation_bit` value IS the GBWT node handle
// (encode_node(id, orient) = 2*id + orient, Forward=0/Reverse=1). So node id ==
// segment id with no node->segment translation, and the built GBWT serves walks
// byte-identical to the binpaths it is built from.
//
// pathdata format (little-endian):
//   magic "PPGB", u32 version(=1), u64 num_paths
//   per path: u32 sample_len, sample bytes (utf8)
//             u32 contig_len, contig bytes (utf8)
//             u64 haplotype, u64 fragment
//             u64 num_steps, num_steps x i64 combined (node handles)
//
// Usage: gbwt-build <input.pathdata> <output.gbwt>

use std::env;
use std::fs::File;
use std::io::{self, BufReader, Read};

use gbz::{FullPathName, GBWTBuilder};
use simple_sds::serialize;

fn read_exact_n<const N: usize>(r: &mut impl Read) -> io::Result<[u8; N]> {
    let mut b = [0u8; N];
    r.read_exact(&mut b)?;
    Ok(b)
}

fn read_u32(r: &mut impl Read) -> io::Result<u32> {
    Ok(u32::from_le_bytes(read_exact_n::<4>(r)?))
}

fn read_u64(r: &mut impl Read) -> io::Result<u64> {
    Ok(u64::from_le_bytes(read_exact_n::<8>(r)?))
}

fn read_i64(r: &mut impl Read) -> io::Result<i64> {
    Ok(i64::from_le_bytes(read_exact_n::<8>(r)?))
}

fn read_str(r: &mut impl Read) -> io::Result<String> {
    let n = read_u32(r)? as usize;
    let mut b = vec![0u8; n];
    r.read_exact(&mut b)?;
    Ok(String::from_utf8_lossy(&b).into_owned())
}

fn run(input: &str, output: &str) -> Result<(), String> {
    let f = File::open(input).map_err(|e| format!("open {}: {}", input, e))?;
    let mut r = BufReader::new(f);

    let magic = read_exact_n::<4>(&mut r).map_err(|e| e.to_string())?;
    if &magic != b"PPGB" {
        return Err("bad magic; not a PangyPlot pathdata file".into());
    }
    let version = read_u32(&mut r).map_err(|e| e.to_string())?;
    if version != 1 {
        return Err(format!("unsupported pathdata version {}", version));
    }
    let num_paths = read_u64(&mut r).map_err(|e| e.to_string())?;

    // Bidirectional + with metadata, matching the vg GBZ path indexes the engine
    // otherwise adopts. Buffer sized generously; it grows to fit a longer path.
    let mut builder = GBWTBuilder::new(true, true, 64 * 1024 * 1024);

    for i in 0..num_paths {
        let sample = read_str(&mut r).map_err(|e| e.to_string())?;
        let contig = read_str(&mut r).map_err(|e| e.to_string())?;
        let haplotype = read_u64(&mut r).map_err(|e| e.to_string())? as usize;
        let fragment = read_u64(&mut r).map_err(|e| e.to_string())? as usize;
        let num_steps = read_u64(&mut r).map_err(|e| e.to_string())? as usize;

        let mut steps = Vec::with_capacity(num_steps);
        for _ in 0..num_steps {
            let combined = read_i64(&mut r).map_err(|e| e.to_string())?;
            // Valid handles are >= 2 (segment id >= 1). Handle 0 is the GBWT
            // endmarker; 0/1 would mean segment id 0, which PangyPlot never uses.
            if combined < 2 {
                return Err(format!(
                    "path {}: node handle {} < 2 (segment id 0 collides with the GBWT endmarker)",
                    i, combined
                ));
            }
            steps.push(combined as usize);
        }

        let name = FullPathName { sample, contig, haplotype, fragment };
        builder.insert(&steps, Some(name))?;
    }

    let gbwt = builder.build()?;
    serialize::serialize_to(&gbwt, output).map_err(|e| e.to_string())?;
    eprintln!("[gbwt-build] wrote {} ({} paths)", output, num_paths);
    Ok(())
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: {} <input.pathdata> <output.gbwt>", args[0]);
        std::process::exit(1);
    }
    if let Err(e) = run(&args[1], &args[2]) {
        eprintln!("[gbwt-build] error: {}", e);
        std::process::exit(1);
    }
}
