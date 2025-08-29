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
        self.deletion_bubble_id = None
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
            "is_deletion": self.deletion_bubble_id is not None,
            "bubble_id": f"b{self.deletion_bubble_id}" if self.deletion_bubble_id is not None else None
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
        link.deletion_bubble_id = self.deletion_bubble_id
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

    def flip(self):
        self.from_id, self.to_id = self.to_id, self.from_id
        self.from_strand, self.to_strand = self.to_strand, self.from_strand
        self.from_type, self.to_type = self.to_type, self.from_type
    def flip_from_strand(self):
        self.from_strand = "-" if self.from_strand == "+" else "+"
    def flip_to_strand(self):
        self.to_strand = "-" if self.to_strand == "+" else "+"
        
    def set_from_type(self, x):
        self.from_type = x
    def set_to_type(self, x):
        self.to_type = x

    def update_to_pop_link(self):
        self.link_type = "pop"
        self.is_pop_link = True

    def is_deletion(self):
        return self.deletion_bubble_id is not None
        
    def id(self):
        return f"{self.from_type}{self.from_id}{self.from_strand}{self.to_type}{self.to_id}{self.to_strand}"
    def reverse_id(self):
        return f"{self.to_id}{'-' if self.to_strand == '+' else '+'}{self.from_id}{'-' if self.from_strand == '+' else '+'}"

    def add_to_suffix(self, suffix):
        self.to_id = f"{self.to_id}:{suffix}"
    def add_from_suffix(self, suffix):
        self.from_id = f"{self.from_id}:{suffix}"
    def remove_to_suffix(self):
        if type(self.to_id) is str:
            self.to_id = self.to_id.split(":")[0]
    def remove_from_suffix(self):
        if type(self.from_id) is str:
            self.from_id = self.from_id.split(":")[0]

    def update_to_chain_link(self, new_ids=None, contained=[], length=0):
        if new_ids is not None:
            self.from_id = new_ids[0]
            self.to_id = new_ids[1]
        self.contained = contained
        self.length = length
        self.link_type = "chain"

    def update_to_deletion_link(self, new_ids, bubble_id):
        self.from_id = new_ids[0]
        self.to_id = new_ids[1]
        self.deletion_bubble_id = bubble_id

    def make_bubble_to_bubble(self):
        self.from_type = "b"
        self.to_type = "b"
        self.from_strand = "+"
        self.to_strand = "+"
        
    def get_haplotype_presence(self, sample_idx):
        #todo: test and verify
        hap_int = int(self.haplotype, 16)
        return ((hap_int >> sample_idx) & 1) == 1

    def combine_links(self, other):
        self.haplotype += other.haplotype
        self.frequency += other.frequency
        self.contained.extend(other.contained)
        self.length += other.length

    def __str__(self):
        return f"Link(id={self.id()}, from={self.from_id}{self.from_strand}, to={self.to_id}{self.to_strand})"

    def __repr__(self):
        return f"Link({self.id()})"