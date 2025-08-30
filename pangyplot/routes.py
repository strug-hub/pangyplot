import os
from flask import Blueprint, current_app, render_template, request, jsonify, make_response
from dotenv import load_dotenv
import pangyplot.db.query as query

bp = Blueprint("routes", __name__)

@bp.route('/')
def index():
    content = dict()
    response = make_response(render_template("index.html", **content ))
    return response

@bp.context_processor
def inject_ga_tag_id():
    load_dotenv()
    # Get the Google Analytics tag ID from the environment variable
    ga_tag_id = os.getenv('GA_TAG_ID', '')
    return dict(ga_tag_id=ga_tag_id)

@bp.route('/default-genome', methods=['GET'])
def get_default_genome():
    return jsonify({"genome": current_app.genome})

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
            "order": current_app.cytoband["chromosomes"],
            "organism": current_app.cytoband["organism"]
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

@bp.route('/subgraph', methods=["GET"])
def subgraph():
    id = request.args.get("id")
    genome = request.args.get("genome")
    chrom = request.args.get("chromosome")
    #start = int(request.args.get("start"))
    #end = int(request.args.get("end"))

    print(f"Getting subgraph for node {id} in {genome}#{chrom}...")
    
    if id.startswith("s"):
        subgraph = {"nodes": [], "links": []}
    if id.startswith("b"):
        if ":" in id:
            subgraph = query.get_bubble_end(current_app, id, genome, chrom)
        else:
            subgraph = query.pop_bubble(current_app, id, genome, chrom)

    return jsonify(subgraph)

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

