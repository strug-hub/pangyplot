import gzip
from pangyplot.objects.Annotation import Annotation
import pangyplot.db.sqlite.annotation_db as db

def get_reader(gff3):
    if gff3.endswith(".gz"):
        return gzip.open(gff3, 'rt')
    return open(gff3)

def parse_line(line, genes=True, exons=True, transcripts=True, cds=False, codons=False, utr=False):
    if line.startswith("#"):
        return None

    cols = line.strip().split("\t")
    if len(cols) < 9:
        return None  # malformed line

    a = Annotation()
    a.chrom = cols[0]
    a.source = cols[1]
    a.type = cols[2]
    a.start = int(cols[3])
    a.end = int(cols[4])
    a.strand = cols[6]

    keep = False
    if genes and a.type.lower() == "gene":
        keep = True
    if exons and a.type.lower() == "exon":
        keep = True
    if transcripts and a.type.lower() == "transcript":
        keep = True
    if cds and a.type.lower() == "cds":
        keep = True
    if codons and a.type.lower() == "codon":
        keep = True
    if utr and a.type.lower() == "utr":
        keep = True

    if not keep:
        return None
    
    # Parse attributes
    for attr in cols[8].split(";"):
        parts = attr.split("=")
        if len(parts) != 2:
            continue
        key, val = parts
        key = key.strip().lower()
        val = val.strip()

        if key == "id":
            a.id = val
            if val.startswith("exon:"):
                try:
                    a.exon_number = int(val.split(":")[-1])
                except ValueError:
                    pass
        elif key == "parent":
            a.parent = val
        elif key == "gene_name":
            a.gene_name = val
        elif key == "exon_number":
            try:
                a.exon_number = int(val)
            except ValueError:
                pass
        elif key == "tag":
            a.tag = val
        else:
            # Optional: handle or ignore unknown keys
            pass

    # Canonical/MANE tagging logic
    if a.type and a.type.lower() == "transcript":
        tag = (a.tag or "").lower()
        a.ensembl_canonical = "ensembl_canonical" in tag
        a.mane_select = "mane_select" in tag

    return a

def parse_gff3(gff3, dir):
    conn = db.create_annotation_table(dir)
    cur = conn.cursor()

    with get_reader(gff3) as file:
        for line in file:
            annotation = parse_line(line)
            if annotation:
                db.insert_annotation(cur, annotation)

    conn.commit()
    conn.close()
