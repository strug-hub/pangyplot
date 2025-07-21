import pangyplot.db.db_utils as utils
from pangyplot.objects.Annotation import Annotation

DB_NAME = "annotations.db"

def get_connection(ann_dir):
    return utils.get_connection(ann_dir, DB_NAME)

def create_annotation_table(dir):
    conn = utils.get_connection(dir, DB_NAME, clear_existing=True)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            chrom TEXT NOT NULL,
            start INTEGER NOT NULL,
            end INTEGER NOT NULL,
            strand TEXT,
            source TEXT,
            gene_name TEXT,
            exon_number INTEGER,
            parent TEXT,
            tag TEXT,
            ensembl_canonical BOOLEAN DEFAULT 0,
            mane_select BOOLEAN DEFAULT 0
        );
    """)

    cur.execute("CREATE INDEX idx_gene_name ON annotations(gene_name, type)")
    cur.execute("CREATE INDEX idx_chrom_start_end ON annotations(chrom, start, end)")
    conn.commit()
    return conn

def insert_annotation(cur, annotation):
    cur.execute("""
        INSERT INTO annotations (id, type, chrom, start, end, strand, source, gene_name, exon_number, parent, tag, ensembl_canonical, mane_select)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        annotation.id,
        annotation.type,
        annotation.chrom,
        annotation.start,
        annotation.end,
        annotation.strand,
        annotation.source,
        annotation.gene_name,
        annotation.exon_number,
        annotation.parent,
        annotation.tag,
        annotation.ensembl_canonical,
        annotation.mane_select
    ))

def annotation_from_row(row, step_index=None):
    a = Annotation()
    a.id = row["id"]
    a.type = row["type"]
    a.chrom = row["chrom"]
    a.start = row["start"]
    a.end = row["end"]
    a.strand = row["strand"]
    a.source = row["source"]
    a.gene_name = row["gene_name"]
    a.exon_number = row["exon_number"]
    a.parent = row["parent"]
    a.tag = row["tag"]
    a.ensembl_canonical = bool(row["ensembl_canonical"])
    a.mane_select = bool(row["mane_select"])

    if step_index:
        a.add_step(step_index)

    return a

def get_genes(dir):
    cur = get_connection(dir).cursor()
    cur.execute("SELECT DISTINCT gene_name FROM annotations WHERE gene_name IS NOT NULL ORDER BY gene_name;")
    return [row["gene_name"] for row in cur.fetchall()]

def get_by_gene_name(dir, gene_name, step_index=None, type=None):
    cur = get_connection(dir).cursor()
    if type:
        cur.execute("SELECT * FROM annotations WHERE gene_name = ? AND type = ?", (gene_name, type))
    else:
        cur.execute("SELECT * FROM annotations WHERE gene_name = ?", (gene_name,))
    return [annotation_from_row(row, step_index) for row in cur.fetchall()]

def get_by_range(dir, chrom, start, end, step_index=None, type=None):
    cur = get_connection(dir).cursor()
    if type:
        cur.execute("SELECT * FROM annotations WHERE chrom = ? AND start >= ? AND end <= ? AND type = ?", (chrom, start, end, type))
    else:
        cur.execute("SELECT * FROM annotations WHERE chrom = ? AND start >= ? AND end <= ?", (chrom, start, end))
    rows = cur.fetchall()
    return [annotation_from_row(row, step_index) for row in rows]

