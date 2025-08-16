class Link:
    def __init__(self):
        self.from_id = None
        self.to_id = None
        self.from_strand = "+"
        self.to_strand = "+"
        self.haplotype = 0
        self.reverse = 0
        self.frequency = 0
        self.from_type = "s"
        self.to_type = "s"
        self.link_type = "link"
        self.contained = []
        self.length = 0
        self.deletionBubbleId = None
        self.is_pop_link = False

    def serialize(self):
        return {
            "id": self.id(),
            "type": self.link_type,
            "source": f"{self.from_type}{self.from_id}",
            "target": f"{self.to_type}{self.to_id}",
            "from_strand": self.from_strand,
            "to_strand": self.to_strand,
            "haplotype": self.haplotype,
            "reverse": self.reverse,
            "frequency": self.frequency,
            "contained": self.contained,
            "length": self.length,
            "is_deletion": self.deletionBubbleId is not None,
            "is_pop_link": self.is_pop_link,
            "bubble_id": f"b{self.deletionBubbleId}" if self.deletionBubbleId is not None else None
        }
    
    def clone(self):
        link = Link()
        link.from_id = self.from_id
        link.to_id = self.to_id
        link.from_strand = self.from_strand
        link.to_strand = self.to_strand
        link.haplotype = self.haplotype
        link.reverse = self.reverse
        link.frequency = self.frequency
        link.from_type = self.from_type
        link.to_type = self.to_type
        link.deletionBubbleId = self.deletionBubbleId
        link.link_type = self.link_type
        link.contained = self.contained[:]
        link.length = self.length
        return link

    def contains(self, id):
        return self.from_id == id or self.to_id == id
    def other_id(self, id):
        if self.from_id == id:
            return self.to_id
        elif self.to_id == id:
            return self.from_id
        return None

    def make_chain_link(self, contained=[], length=0):
        self.from_type = "b"
        self.to_type = "b"
        self.contained = contained
        self.length = length
        self.link_type = "chain"

    def set_from_type(self, x):
        self.from_type = x
    def set_to_type(self, x):
        self.to_type = x

    def make_pop_link(self):
        self.link_type = "pop"
        self.is_pop_link = True

    def make_segment_to_bubble(self):   
        self.from_type = "s"
        self.to_type = "b"

    def make_bubble_to_segment(self):
        self.from_type = "b"
        self.to_type = "s"

    def set_as_deletion(self, bubble_id):
        self.deletionBubbleId = bubble_id
    def is_deletion(self):
        return self.deletionBubbleId is not None
        
    def id(self):
        return f"{self.from_type}{self.from_id}{self.from_strand}{self.to_type}{self.to_id}{self.to_strand}"
    
    def update_to_bubble(self, current_id, bubble_id, orientation=None):
        if self.from_id == current_id:
            self.from_id = bubble_id
            self.from_type = "b"
            if orientation is not None:
                self.from_strand = orientation
        elif self.to_id == current_id:
            self.to_id = bubble_id
            self.to_type = "b"
            if orientation is not None:
                self.to_strand = orientation

    def get_haplotype_presence(self, sample_idx):
        #todo: test and verify
        hap_int = int(self.haplotype, 16)
        return ((hap_int >> sample_idx) & 1) == 1

    def __str__(self):
        return f"Link(id={self.id()}, from={self.from_id}{self.from_strand}, to={self.to_id}{self.to_strand})"

    def __repr__(self):
        return f"Link({self.id()})"