import pangyplot.db.sqlite.annotation_db as db
import pangyplot.db.sqlite.db_utils as utils

QUICK_INDEX = "annotations.quickindex.json"

class AnnotationIndex:
    def __init__(self, name, ann_dir):
        self.dir = ann_dir
        self.name = name

        if not self.load_quick_index():
            self.annotations = db.get_genes(self.dir)
            self.save_quick_index()

    def serialize(self):
        return { "annotations": self.annotations }

    def save_quick_index(self):
        utils.dump_json(self.serialize(), f"{self.dir}/{QUICK_INDEX}")

    def load_quick_index(self):
        quick_index = utils.load_json(f"{self.dir}/{QUICK_INDEX}")
        if quick_index is None:
            return False
        
        self.annotations = quick_index.get("annotations", [])
        return True

    def __getitem__(self, gene_name):
        return db.get_gene_by_name(self.dir, gene_name)

    def query_gene_range(self, chrom, start, end, type=None):
        return db.get_by_range(self.dir, chrom, start, end, type)

    def gene_search(self, query, max_results=20):
        results = []
        for gene in self.genes:
            if query.lower() in gene.lower():
                results.extend(self[gene])
        return results[:max_results]