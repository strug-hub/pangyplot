import pangyplot.db.sqlite.annotation_db as db
import pangyplot.db.db_utils as utils

QUICK_INDEX = "annotations.quickindex.json"

class AnnotationIndex:
    def __init__(self, name, ann_dir):
        self.dir = ann_dir
        self.name = name
        self.step_index = None

        if not self.load_quick_index():
            self.genes = db.get_genes(self.dir)
            self.save_quick_index()

    def set_step_index(self, step_index):
        self.step_index = step_index

    def serialize(self):
        return { "genes": self.genes }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False

        self.genes = quick_index.get("genes", [])
        return True

    def construct_genes(self, annotations):
        genes = dict()
        transcripts = dict()
        exons = [] 
        for annotation in annotations:
            if annotation.type == "gene":
                genes[annotation.id] = annotation
            elif annotation.type == "transcript":
                transcripts[annotation.id] = annotation
            elif annotation.type == "exon":
                exons.append(annotation)
        
        for exon in exons:
            if exon.parent in transcripts:
                transcripts[exon.parent].exons.append(exon)

        for _, transcript in transcripts.items():
            if transcript.parent in genes:
                genes[transcript.parent].transcripts.append(transcript)

        return [gene for _,gene in genes.items()]

    def __getitem__(self, gene_name):
        annotations = db.get_by_gene_name(self.dir, gene_name, self.step_index, type="gene")
        gene_annotations = self.construct_genes(annotations)
        if len(gene_annotations) == 0:
            return None
        return gene_annotations[0]

    def query_gene_range(self, chrom, start, end, type=None):
        annotations = db.get_by_range(self.dir, chrom, start, end, self.step_index, type=type)
        return self.construct_genes(annotations)

    def gene_search(self, query, max_results=20):
        results = []
        for gene in self.genes:
            if query.lower() in gene.lower():
                results.extend(db.get_by_gene_name(self.dir, gene, step_index=None, type="gene"))
        return results[:max_results]