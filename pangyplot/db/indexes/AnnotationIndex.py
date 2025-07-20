import pangyplot.db.sqlite.annotation_db as db

class AnnotationIndex:
    def __init__(self, name, ann_dir):
        self.dir = ann_dir
        self.name = name
        self.genes = db.get_genes(self.dir)

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