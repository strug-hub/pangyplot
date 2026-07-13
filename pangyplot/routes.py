import gzip
import os
import re
from flask import Blueprint, current_app, render_template, request, jsonify, make_response, Response, abort
from flask_babel import _,get_locale
from dotenv import load_dotenv
from pangyplot.version import __version__,__version_name__
import pangyplot.organisms as organisms
import pangyplot.db.query as query

bp = Blueprint("routes", __name__)

# Tokens that are interpolated into filesystem paths (a reference genome name,
# a client session id). Anything outside this set could smuggle a path
# separator or a parent-directory reference and escape the datastore.
_SAFE_TOKEN = re.compile(r"[A-Za-z0-9._-]+")


def _safe_chrom(chrom):
    """Validate a client-supplied chromosome against the loaded set.

    The value flows into ``os.path.join`` for several file-serving routes, so
    an unchecked ``../..`` would read files outside the datastore. Restricting
    it to a known chromosome is airtight because the valid set is finite and
    already in memory.
    """
    if not chrom or chrom not in current_app.chromosomes:
        abort(400, description="Unknown or missing chromosome")
    return chrom


def _safe_ref(ref):
    """Validate a reference-genome name that is interpolated into a filename."""
    if not ref or ".." in ref or not _SAFE_TOKEN.fullmatch(ref):
        abort(400, description="Invalid reference genome")
    return ref

@bp.route('/')
def index():
    return render_template("index.html", genome=current_app.genome)

@bp.route('/simplify')
def simplify_redirect():
    from flask import redirect
    return redirect('/', code=301)

@bp.context_processor
def inject_ga_tag_id():
    load_dotenv()
    # Get the Google Analytics tag ID from the environment variable
    ga_tag_id = os.getenv('GA_TAG_ID', '')
    return dict(ga_tag_id=ga_tag_id)

@bp.context_processor
def inject_version():
    return {
        "version": __version__,
        "version_name": __version_name__
    }

@bp.context_processor
def inject_locale():
    return dict(current_locale=get_locale())

@bp.context_processor
def inject_default_genome():
    return { "genome": current_app.genome }

@bp.context_processor
def inject_debug_mode():
    return { "debug_mode": "true" if current_app.debug_mode else "false" }

@bp.context_processor
def inject_organism():
    organism = current_app.cytoband["organism"]
    emoji = organisms.VALID_ORGANISMS.get(organism, "")
    genome = organisms.ORGANISM_TO_GENOME.get(organism, "")
    return { "organism": organism, "organism_emoji": emoji, "organism_genome": genome }

@bp.route('/chromosomes', methods=["GET"])
def chromosomes():
    show_noncanonical = request.args.get('noncanonical', 'false').lower() == 'true'

    if show_noncanonical:
        canonical = set(current_app.cytoband["chromosomes"])
        all_chroms = current_app.chromosomes
        result = [chrom for chrom in all_chroms if chrom not in canonical]
    else:
        result = current_app.cytoband["chromosomes"]

    return jsonify(result)

@bp.route('/cytoband', methods=["GET"])
def cytobands():
    chromosome = request.args.get("chromosome")

    if not chromosome:
        return jsonify({
            "chromosome": current_app.cytoband["cytobands"],
            "order": current_app.cytoband["chromosomes"]
        })

    bands = current_app.cytoband["cytobands"].get(chromosome)
    if bands is None:
        return jsonify({"error": f"Chromosome '{chromosome}' not found"}), 404

    return jsonify(bands)

@bp.route('/samples', methods=["GET"])
def get_samples():
    firstchrom = current_app.chromosomes[0] if current_app.chromosomes else None
    if not firstchrom:
        return jsonify({"error": "No data"}), 404
    samples = current_app.gfa_index[firstchrom].get_samples()
    return jsonify(samples)

@bp.route('/genes', methods=["GET"])
def genes():
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    start = request.args.get("start", 0, type=int)
    end = request.args.get("end", 2_000_000_000, type=int)
    mane_only = request.args.get("mane_only", "false").lower() == "true"

    if genome not in current_app.annotation_index:
        return jsonify({"error": f"Genome '{genome}' not found"}), 404

    annidx = current_app.annotation_index[genome]
    annidx.set_step_index(None)
    genes = annidx.query_gene_range(chrom, start, end, type="gene", mane_only=mane_only)

    return jsonify({"genes": [gene.serialize() for gene in genes]}), 200

@bp.route('/search')
def search():
    type = request.args.get('type')
    query_string = request.args.get('query')
    
    results = []
    genome = current_app.genome
    if type == "gene":
        annotations = current_app.annotation_index[genome].gene_search(query_string)
        results = [gene.serialize() for gene in annotations]
        print(results)

    return jsonify(results)

@bp.route('/skeleton')
def skeleton():
    chrom = _safe_chrom(request.args.get('chromosome'))
    skel_dir = os.path.join(current_app.data_dir, "graphs", current_app.db_name, chrom, "skeleton")
    meta_path = os.path.join(skel_dir, "meta.json.gz")
    if not os.path.exists(meta_path):
        return jsonify({"error": "No precomputed skeleton data for this chromosome."}), 404
    with open(meta_path, 'rb') as f:
        data = f.read()
    return Response(data, mimetype='application/json',
                    headers={'Content-Encoding': 'gzip'})

@bp.route('/skeleton-bin')
def skeleton_bin():
    chrom = _safe_chrom(request.args.get('chromosome'))
    bin_path = os.path.join(current_app.data_dir, "graphs", current_app.db_name, chrom, "skeleton", "polylines.bin.gz")
    if not os.path.exists(bin_path):
        return jsonify({"error": "No precomputed skeleton data for this chromosome."}), 404
    with open(bin_path, 'rb') as f:
        data = f.read()
    return Response(data, mimetype='application/octet-stream',
                    headers={'Content-Encoding': 'gzip'})

@bp.route('/spine')
def spine():
    chrom = _safe_chrom(request.args.get('chromosome'))
    ref = _safe_ref(request.args.get('ref', current_app.genome))
    from pangyplot.preprocess.spine.spine_builder import spine_filename
    skel_dir = os.path.join(current_app.data_dir, "graphs", current_app.db_name, chrom, "skeleton")
    gz_path = os.path.join(skel_dir, spine_filename(ref))
    if not os.path.exists(gz_path):
        return jsonify({"error": f"No spine data for {chrom} ({ref})."}), 404
    with open(gz_path, 'rb') as f:
        data = f.read()
    return Response(data, mimetype='application/json',
                    headers={'Content-Encoding': 'gzip'})

@bp.route('/polychain-data')
def polychain_data_file():
    chrom = _safe_chrom(request.args.get('chromosome'))
    gz_path = os.path.join(current_app.data_dir, "graphs", current_app.db_name, chrom, "polychain-data.json.gz")
    if not os.path.exists(gz_path):
        return jsonify({}), 200
    with open(gz_path, 'rb') as f:
        data = f.read()
    return Response(data, mimetype='application/json',
                    headers={'Content-Encoding': 'gzip'})

@bp.route('/graph-meta')
def graph_meta():
    chrom = _safe_chrom(request.args.get('chromosome'))
    meta_path = os.path.join(current_app.data_dir, "graphs", current_app.db_name, chrom, "meta.json")
    if not os.path.exists(meta_path):
        return jsonify({}), 200
    with open(meta_path, 'r') as f:
        return Response(f.read(), mimetype='application/json')

@bp.route('/chains', methods=["GET"])
def chains():
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    start = int(request.args.get("start"))
    end = int(request.args.get("end"))
    expand = request.args.get("expand", type=int, default=None)
    bubble = request.args.get("bubble", type=int, default=None)

    print(f"Getting chains for {genome}#{chrom}:{start}-{end} expand={expand} bubble={bubble}...")
    try:
        result = query.get_chains(current_app, genome, chrom, start, end,
                                  expand_threshold=expand, bubble_threshold=bubble)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    # Strip internal fields not meant for this endpoint's response
    for c in result.get("chains", []):
        c.pop("_bubble_ids", None)
        c.pop("_layout_span", None)

    return jsonify(result)

@bp.route('/detail-tiles', methods=["GET"])
def detail_tiles():
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    start = int(request.args.get("start"))
    end = int(request.args.get("end"))
    ppbp = float(request.args.get("ppbp"))
    expand = request.args.get("expand", type=int, default=None)
    layout_min_x = request.args.get("layout_min_x", type=float, default=None)
    layout_max_x = request.args.get("layout_max_x", type=float, default=None)

    import time as _time
    print(f"Getting detail tile for {genome}#{chrom}:{start}-{end} ppbp={ppbp:.6f} expand={expand} layout_x=[{layout_min_x},{layout_max_x}]...")
    t0 = _time.perf_counter()
    try:
        result = query.get_detail_tile(current_app, genome, chrom, start, end,
                                       ppbp, expand_threshold=expand,
                                       layout_min_x=layout_min_x,
                                       layout_max_x=layout_max_x)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    t1 = _time.perf_counter()
    resp = jsonify(result)
    t2 = _time.perf_counter()
    n_chains = len(result.get("chains", []))
    jg = result.get("junction_graph", {})
    n_jn = len(jg.get("nodes", []))
    n_jl = len(jg.get("links", []))
    payload_kb = resp.content_length / 1024 if resp.content_length else len(resp.get_data()) / 1024
    print(f"  ⏱ detail-tile total={t2-t0:.3f}s  query={t1-t0:.3f}s  jsonify={t2-t1:.3f}s  chains={n_chains} jnodes={n_jn} jlinks={n_jl} payload={payload_kb:.0f}KB")
    return resp

@bp.route('/chain-graph', methods=["GET"])
def chain_graph():
    raw_id = request.args.get("id", "")
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")

    # Connector chains: synthetic IDs with _r, use explicit bubble IDs
    if '_r' in raw_id:
        bubbles_param = request.args.get("bubbles", "")
        if not bubbles_param:
            return jsonify({"error": "Connector chains require &bubbles= parameter"}), 400
        try:
            bubble_ids = [int(x) for x in bubbles_param.split(",")]
        except ValueError:
            return jsonify({"error": "Invalid bubble IDs"}), 400

        print(f"Getting connector subgraph for {raw_id} ({len(bubble_ids)} bubbles) in {genome}#{chrom}...")
        try:
            graph = query.get_bubbles_subgraph(current_app, bubble_ids, genome, chrom)
        except ValueError as e:
            return jsonify({"error": str(e)}), 404
        return jsonify(graph)

    # Strip "c" prefix to get integer chain ID
    chain_id = int(raw_id.lstrip("c"))

    start_pos = request.args.get("start_pos", type=int, default=None)
    end_pos = request.args.get("end_pos", type=int, default=None)

    print(f"Getting chain graph for chain {chain_id} in {genome}#{chrom} (pos={start_pos}-{end_pos})...")
    try:
        graph = query.get_chain_graph(current_app, chain_id, genome, chrom,
                                      start_pos=start_pos, end_pos=end_pos)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    return jsonify(graph)

@bp.route('/bubble-meta', methods=["GET"])
def bubble_meta():
    chain_id = request.args.get("chain_id", "")
    chrom = request.args.get("chromosome", "")
    genome = current_app.genome
    if not chain_id or not chrom:
        return jsonify({"error": "Missing chain_id or chromosome"}), 400
    try:
        result = query.get_bubble_meta(current_app, genome, chrom, chain_id)
    except (ValueError, KeyError) as e:
        return jsonify({"error": str(e)}), 404
    return jsonify({"bubbles": result})

@bp.route('/bubble-meta-batch', methods=["POST"])
def bubble_meta_batch():
    data = request.get_json(silent=True) or {}
    chain_ids = data.get("chain_ids", [])
    chrom = data.get("chromosome", "")
    genome = current_app.genome
    if not chain_ids or not chrom:
        return jsonify({"error": "Missing chain_ids or chromosome"}), 400
    result = {}
    for cid in chain_ids:
        try:
            result[cid] = query.get_bubble_meta(current_app, genome, chrom, cid)
        except (ValueError, KeyError):
            result[cid] = []
    return jsonify(result)

@bp.route('/select', methods=["GET"])
def select():
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    start = int(request.args.get("start"))
    end = int(request.args.get("end"))

    print(f"Making graph for {genome}#{chrom}:{start}-{end}...")
    try:
        graph = query.get_bubble_graph(current_app, genome, chrom, start, end)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    return jsonify(graph)

@bp.route('/pop', methods=["GET"])
def pop():
    id = request.args.get("id")
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")

    print(f"Popping node {id} in {genome}#{chrom}...")

    result = query.pop_bubble(current_app, id, genome, chrom)
    return jsonify(result)

@bp.route('/path', methods=["GET"])
def path():
    
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    start = int(request.args.get("start"))
    end = int(request.args.get("end"))
    sample = request.args.get("sample")

    print(f"Getting path for {sample}, {genome}#{chrom}:{start}-{end}...")
    try:
        path = query.get_path(current_app, genome, chrom, start, end, sample)
    except ValueError as e:
        print(f"Path query failed: {e}")
        return jsonify({"error": str(e)}), 404

    return jsonify(path)

@bp.route('/path-meta', methods=["GET"])
def path_meta():
    chrom = request.args.get("chromosome")
    sample = request.args.get("sample")

    try:
        meta = query.get_path_meta(current_app, chrom, sample)
    except (ValueError, KeyError) as e:
        return jsonify({"error": str(e)}), 404

    return jsonify(meta)


@bp.route('/path-data', methods=["GET"])
def path_data():
    chrom = request.args.get("chromosome")
    sample = request.args.get("sample")
    file_index = int(request.args.get("index", 0))

    try:
        raw = query.get_path_raw(current_app, chrom, sample, file_index)
    except (ValueError, KeyError) as e:
        return jsonify({"error": str(e)}), 404

    if raw is None:
        return jsonify({"error": "Path file not found"}), 404

    return Response(raw, mimetype='application/octet-stream',
                    headers={'Content-Encoding': 'gzip'})


@bp.route('/pathorder', methods=["GET"])
def path_order():

    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    print(genome, chrom)
    print(f"Getting path order...")
    try:
        order = query.get_path_order(current_app, genome, chrom)
    except ValueError as e:
        print(f"Path order query failed: {e}")
        return jsonify({"error": str(e)}), 404

    return jsonify(order)


@bp.route('/gfa', methods=["POST"])
def gfa():
    data = request.get_json(silent=True) or {}
    genome = data.get("genome")
    chromosome = data.get("chromosome")
    bubble_ids = data.get("bubble_ids", [])
    segment_ids = data.get("segment_ids", [])

    if not genome or not chromosome or (not bubble_ids and not segment_ids):
        return jsonify({"error": "Missing genome, chromosome, or node IDs"}), 400

    try:
        gen = query.generate_gfa(current_app, genome, chromosome, bubble_ids,
                                 segment_ids=segment_ids)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404

    filename = f"{chromosome}_export.gfa"
    return Response(
        gen,
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment; filename={filename}'}
    )

# ---------------------------------------------------------------
# Debug log endpoint — writes structured pop/undo events to session files
# ---------------------------------------------------------------
_DEBUG_LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'pop-debug-logs')

@bp.route('/debug-log', methods=["POST"])
def debug_log():
    # Developer-only: never accept unsolicited disk writes on a public server.
    if not current_app.debug_mode:
        abort(404)
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"ok": False}), 400
    # The session id becomes a filename; strip it to a safe token so it cannot
    # traverse out of the log directory.
    raw_session = str(data.pop('sessionId', 'unknown'))
    session_id = "".join(_SAFE_TOKEN.findall(raw_session)).replace("..", "")[:64] or 'unknown'
    os.makedirs(_DEBUG_LOG_DIR, exist_ok=True)
    import json, time
    line = json.dumps({"ts": time.time(), **data})
    path = os.path.join(_DEBUG_LOG_DIR, f'session-{session_id}.jsonl')
    with open(path, 'a') as f:
        f.write(line + '\n')
    return jsonify({"ok": True})

