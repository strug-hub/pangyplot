class Link:
    def __init__(self):
        self.from_id = None
        self.to_id = None
        self.from_strand = None
        self.to_strand = None
        self.haplotype = 0
        self.reverse = 0
        self.frequency = 0

    def serialize(self):
        return {
            "id": self.id,
            "from_id": self.from_id,
            "to_id": self.to_id,
            "from_strand": self.from_strand,
            "to_strand": self.to_strand,
            "haplotype": self.haplotype,
            "reverse": self.reverse,
            "frequency": self.frequency,
            "class": "edge",
            "source": f"s{self.from_id}",
            "target": f"s{self.to_id}"
        }
    
    def id(self):
        return f"{self.from_id}{self.from_strand}{self.to_id}{self.to_strand}"
    
    def get_haplotype_presence(self, sample_idx):
        #todo: test and verify
        hap_int = int(self.haplotype, 16)
        return ((hap_int >> sample_idx) & 1) == 1

    def __str__(self):
        return f"Link(id={self.id}, from={self.from_id}{self.from_strand}, to={self.to_id}{self.to_strand})"

    def __repr__(self):
        return f"Link({self.id})"