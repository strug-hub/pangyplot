class Annotation:
    def __init__(self):
        self.id = None
        self.type = None
        self.chrom = None
        self.start = None
        self.end = None
        self.strand = None
        self.source = None
        self.gene_name = None
        self.exon_number = None
        self.parent = None
        self.tag = ""
        self.ensembl_canonical = False
        self.mane_select = False
        self.exons = []
        self.transcripts = []
        self.range = None

    def serialize(self):
        self.sort_transcripts()
        return {
            "id": self.id,
            "type": self.type,
            "chrom": self.chrom,
            "start": self.start,
            "end": self.end,
            "strand": self.strand,
            "source": self.source,
            "gene": self.gene_name,
            "exon_number": self.exon_number,
            "parent": self.parent,
            "tag": self.tag,
            "range": self.range,
            "ensembl_canonical": self.ensembl_canonical,
            "mane_select": self.mane_select,
            "exons": [exon.serialize() for exon in self.exons],
            "transcripts": [transcript.serialize() for transcript in self.transcripts]
        }

    def add_step(self, step_index):
        if self.start is None or self.end is None:
            return
        self.range = step_index.query_coordinates(self.start, self.end, exact=True)

    def sort_transcripts(self):
        def transcript_priority(t, idx):
            return (
                int(bool(t.mane_select)),                 # MANE_Select first
                int(bool(t.ensembl_canonical)),           # then Ensembl canonical
                1 if t.tag and "GENCODE_Primary" in t.tag else 0,
                1 if t.tag and "CCDS" in t.tag else 0,
                -idx  # preserve original order on ties (stable sort)
            )

        self.transcripts = [
            t for _, t in sorted(
                enumerate(self.transcripts),
                key=lambda pair: transcript_priority(pair[1], pair[0]),
                reverse=True
            )
        ]


    def __str__(self):
        tp = self.type
        if self.type == "exon":
            tp = f"exon_{self.exon_number}"
        return f"Annotation({self.gene_name}:{tp} [{self.chrom}:{self.start}-{self.end}])"

    def __repr__(self):
        return f"Annotation({self.id})"
