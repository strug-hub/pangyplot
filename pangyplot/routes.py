import gzip
import os
from flask import Blueprint, current_app, render_template, request, jsonify, make_response, Response
from flask_babel import _,get_locale
from dotenv import load_dotenv
from pangyplot.version import __version__,__version_name__
import pangyplot.organisms as organisms
import pangyplot.db.query as query

bp = Blueprint("routes", __name__)

@bp.route('/')
def index():
    return render_template("index.html")

@bp.route('/simplify')
def simplify_viewer():
    return render_template("simplify.html", genome=current_app.genome)

@bp.route('/simplify-data')
def simplify_data():
    gz_path = os.path.join(current_app.static_folder, 'data', 'simplify', 'chrY.json.gz')
    if not os.path.exists(gz_path):
        return jsonify({"error": "No precomputed data. Run graph_simplify.py --export-json first."}), 404
    with open(gz_path, 'rb') as f:
        data = f.read()
    return Response(data, mimetype='application/json',
                    headers={'Content-Encoding': 'gzip'})

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
def inject_organism():
    organism = current_app.cytoband["organism"]
    emoji = organisms.VALID_ORGANISMS.get(organism, "")
    genome = organisms.ORGANISM_TO_GENOME.get(organism, "")
    print("GENOME", genome)
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

    print(f"Getting cytobands for {chromosome}...")

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
    start = request.args.get("start")
    end = request.args.get("end")
    
    start = int(start)
    end = int(end)
    
    print(f"Getting genes in: {genome}#{chrom}:{start}-{end}")

    if genome not in current_app.annotation_index:
        return jsonify({"error": f"Genome '{genome}' not found"}), 404

    annidx = current_app.annotation_index[genome]
    annidx.set_step_index(current_app.step_index[(chrom, genome)])
    genes = annidx.query_gene_range(chrom, start, end)
    print(f"   Genes: {len(genes)}")

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


@bp.route('/gfa', methods=["GET"])
def gfa():
    genome = request.args.get("genome")
    chromosome = request.args.get("chromosome")
    start = request.args.get("start")
    end = request.args.get("end")

    ''''
    nodes, links = [], [] #get_segments_in_range(genome, chromosome, start, end)
    gfa_lines = [] # [gfaer.get_gfa_header()]

    for node in nodes:
        gfa_lines.append(gfaer.get_s_line(node))

    for link in links:
        gfa_lines.append(gfaer.get_l_line(link))

    node_ids = {n["id"] for n in nodes}
    collection = nodes[0]["collection"] if nodes else None
    paths = query_paths(node_ids, collection)

    for path in paths:
        gfa_lines.append(gfaer.get_p_line(path))
        
    gfa_text = "\n".join(gfa_lines)
    '''
    response = make_response("") #gfa_text
    response.headers['Content-Type'] = 'text/plain'
    response.headers['Content-Disposition'] = 'attachment; filename=graph.gfa'
    return response

