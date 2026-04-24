.. _schema:

On-Disk Data Layout
==============================

PangyPlot preprocesses a pangenome graph into a mix of `SQLite <https://www.sqlite.org/>`_ databases, memory-mapped numpy arrays, and compressed binary path files. The ``S``, ``L``, ``P``, and ``W`` lines from a GFA file are parsed into the SQLite tables described below, ``Bubble`` and ``Chain`` superstructures are enumerated by BubbleGun, and 2D coordinates come from an ODGI layout TSV.

Directory Layout
~~~~~~~~~~~~~~~~

By default, the database lives in ``datastore/graphs/_default_/``. Inside that directory are chromosome-specific subdirectories (e.g. ``datastore/graphs/_default_/chr1/``), each holding:

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-regular fa-square"></i>
      <div class="icon-text">
        <div class="icon-label">segments.db</div>
        <div class="icon-description">SQLite — <code>S</code> line information from GFA and layout coordinates.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-chain"></i>
      <div class="icon-text">
        <div class="icon-label">links.db</div>
        <div class="icon-description">SQLite — <code>L</code> line information from GFA.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-regular fa-circle"></i>
      <div class="icon-text">
        <div class="icon-label">bubbles.db</div>
        <div class="icon-description">SQLite — identified bubbles and their content.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-stairs"></i>
      <div class="icon-text">
        <div class="icon-label">step_index.db</div>
        <div class="icon-description">SQLite — reference-path step information per genome.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-database"></i>
      <div class="icon-text">
        <div class="icon-label">*.mmapindex/</div>
        <div class="icon-description">Memory-mapped numpy array indexes for fast startup.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-code-branch"></i>
      <div class="icon-text">
        <div class="icon-label">paths/</div>
        <div class="icon-description">Compressed per-haplotype step sequences (<code>.binpath</code>) and a JSON index.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-bone"></i>
      <div class="icon-text">
        <div class="icon-label">skeleton/</div>
        <div class="icon-description">Chromosome-scale polylines and spines (generated at server startup).</div>
      </div>
    </div>
  </div>


SQLite Databases
~~~~~~~~~~~~~~~~

Four SQLite databases hold the authoritative data for each chromosome. Everything else in the chromosome directory is derived from these files plus the BubbleGun output.

segments.db
-----------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Property
     - Type
     - Description
   * - **id**
     - integer
     - Primary key. Segment identifier.
   * - **gc_count**
     - integer
     - Number of ``G`` or ``C`` bases in the DNA sequence.
   * - **n_count**
     - integer
     - Number of ambiguous bases (``N``) in the DNA sequence.
   * - **length**
     - integer
     - Length of the DNA sequence.
   * - **x1**
     - real
     - Layout x-coordinate for the start position.
   * - **y1**
     - real
     - Layout y-coordinate for the start position.
   * - **x2**
     - real
     - Layout x-coordinate for the end position.
   * - **y2**
     - real
     - Layout y-coordinate for the end position.
   * - **seq**
     - text
     - DNA sequence (empty string if node represents a deletion).


links.db
-----------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Property
     - Type
     - Description
   * - **id**
     - text
     - Primary key. Unique identifier constructed from ``from_id + from_strand + to_id + to_strand``.
   * - **from_id**
     - integer
     - Source segment ID.
   * - **from_strand**
     - text
     - Orientation of the source segment (``+`` or ``-``).
   * - **to_id**
     - integer
     - Target segment ID.
   * - **to_strand**
     - text
     - Orientation of the target segment (``+`` or ``-``).
   * - **haplotype**
     - text
     - Set of paths that include this link.
   * - **reverse**
     - text
     - Complementary to haplotype, whether link is traversed in reverse.
   * - **frequency**
     - real
     - Fraction of samples that include this link.

bubbles.db
-----------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Property
     - Type
     - Description
   * - **id**
     - integer
     - Primary key. Bubble identifier.
   * - **chain**
     - integer
     - Identifier of the bubble chain this bubble belongs to.
   * - **chain_step**
     - integer
     - Position/order of this bubble within its chain.
   * - **subtype**
     - text
     - Bubble subtype.
   * - **parent**
     - integer
     - ID of parent bubble (``NULL`` if root).
   * - **children**
     - text (JSON)
     - List of child bubble IDs.
   * - **siblings**
     - text (JSON)
     - List of sibling bubble IDs.
   * - **source**
     - text (JSON)
     - List of source segment IDs.
   * - **sink**
     - text (JSON)
     - List of sink segment IDs.
   * - **inside**
     - text (JSON)
     - List of internal segment IDs.
   * - **range_exclusive**
     - text (JSON)
     - Exclusive range of segment IDs between source and sink.
   * - **range_inclusive**
     - text (JSON)
     - Inclusive range of segment IDs from source to sink.
   * - **length**
     - integer
     - Cumulative length of bubble in bases.
   * - **gc_count**
     - integer
     - Number of ``G`` or ``C`` bases inside the bubble.
   * - **n_count**
     - integer
     - Number of ambiguous bases (``N``) inside the bubble.
   * - **x1**
     - float
     - Layout x-coordinate (start).
   * - **x2**
     - float
     - Layout x-coordinate (end).
   * - **y1**
     - float
     - Layout y-coordinate (start).
   * - **y2**
     - float
     - Layout y-coordinate (end).
   * - **link_data**
     - text (JSON)
     - Links connecting to the bubble directly.

step_index.db
---------------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Property
     - Type
     - Description
   * - **step**
     - integer
     - Step index along the genome path (0-based).
   * - **genome**
     - text
     - Genome name. Together with ``step`` forms the primary key.
   * - **seg_id**
     - integer
     - Segment ID associated with this step.
   * - **start**
     - integer
     - Start coordinate of the segment on this genome path (1-based).
   * - **end**
     - integer
     - End coordinate of the segment on this genome path.


Memory-Mapped Indexes (``*.mmapindex/``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The hot subset of each SQLite table is replicated into a directory of
numpy ``.npy`` files alongside a ``meta.json`` describing the dataset
version and row counts. These arrays are memory-mapped at startup, so
querying segment/link/bubble/step properties is O(1) without going
through SQLite.

``segments.mmapindex/``
    ``length``, ``gc_count``, ``x1``, ``y1``, ``x2``, ``y2``, ``valid``

``links.mmapindex/``
    ``from_ids``, ``to_ids``, ``from_strands``, ``to_strands``, plus a
    CSR-style adjacency built from ``seg_index_flat``,
    ``seg_index_offsets``, ``seg_index_counts`` for fast neighbor
    lookups.

``bubbles.mmapindex/``
    ``ids``, ``start_steps``, ``end_steps``, ``bubble_to_parent``,
    ``segment_to_bubble`` (reverse lookup), and a compact layout
    representation in ``layout_ids``, ``layout_x1``, ``layout_x2``.

``steps.mmapindex/``
    ``starts``, ``ends``, ``segments`` — sorted arrays used for
    basepair-to-segment lookup on the reference path.

Each ``meta.json`` also records the PangyPlot ``version`` that wrote
the index. Indexes stamped with versions listed in
``pangyplot.version.COMPATIBLE_VERSIONS`` are accepted on load;
otherwise the index is regenerated.


Paths (``paths/``)
~~~~~~~~~~~~~~~~~~

Each chromosome directory has a ``paths/`` subdirectory containing one
``.binpath`` file per ``P``/``W`` line from the GFA file. Each
``.binpath`` is a gzipped delta-zigzag-varint payload of the segment
steps along that haplotype — typically ~20× smaller than the JSON
representation used in earlier versions. See
``pangyplot/db/path_codec.py`` for the codec.

Two JSON files sit alongside the ``.binpath`` files:

``paths/index.json``
    Metadata for all paths (file name, full ID, contig, start coordinate,
    reference flag) keyed by sample name, plus the PangyPlot version
    that wrote the index.

``paths/sample_idx.json``
    Compact sample-name-to-integer mapping used by the frontend for
    color assignment.

Legacy JSON path files and old ``.binpath`` files with embedded headers
are auto-migrated on server startup by
``pangyplot/preprocess/ensure_paths.py``.


Skeleton and Polychain (``skeleton/`` and ``polychain.mmapindex/``)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Unlike the files above — which are produced by ``pangyplot add`` — the
skeleton pipeline runs automatically on the first ``pangyplot run``
startup after a dataset is added or the PangyPlot version changes. The
outputs support the chromosome-scale :ref:`chromosome-view`.

``skeleton/polylines.bin.gz``
    Gzipped binary encoding of chain polylines at multiple simplification
    levels.

``skeleton/meta.json.gz``
    Metadata describing what is inside ``polylines.bin.gz``, including
    the PangyPlot version used to generate it.

``skeleton/spine-{ref}.json.gz``
    Per-reference spine data — a linearized backbone through the graph
    used to anchor chain polylines on the reference genome.

``polychain-data.json.gz``
    Decomposition of chains into polychains (runs of bubble-free
    segments), used by the detail-tier force simulation.

``polychain.mmapindex/``
    Memory-mapped companion to ``polychain-data.json.gz`` for fast
    lookups.

See :ref:`rendering` for how these artifacts feed into the skeleton and
detail rendering tiers.


Annotations
~~~~~~~~~~~

Annotations/genomic features (e.g., genes, transcripts, exons) are
stored in genome-specific folders under
``datastore/annotations/{ref}/{name}/``. Inside each folder is a
SQLite database that roughly follows the GFF3 specification.

annotations.db
---------------

.. list-table::
   :header-rows: 1
   :widths: 20 10 70

   * - Property
     - Type
     - Description
   * - **id**
     - text
     - Primary key. Unique identifier for the annotation feature.
   * - **type**
     - text
     - Feature type (e.g., gene, transcript, exon).
   * - **chrom**
     - text
     - Chromosome or contig name.
   * - **start**
     - integer
     - Genomic start coordinate (1-based, inclusive).
   * - **end**
     - integer
     - Genomic end coordinate (1-based, inclusive).
   * - **strand**
     - text
     - Feature strand: ``+`` or ``-``.
   * - **source**
     - text
     - Origin of the annotation (e.g., GENCODE, RefSeq).
   * - **gene_name**
     - text
     - Associated gene symbol/name.
   * - **exon_number**
     - integer
     - Exon number (if feature is an exon).
   * - **parent**
     - text
     - Parent feature ID (e.g., transcript for an exon).
   * - **tag**
     - text
     - Free-form tag or attribute from source annotation.
   * - **ensembl_canonical**
     - boolean
     - Flag indicating Ensembl canonical transcript (default 0 = false).
   * - **mane_select**
     - boolean
     - Flag indicating MANE Select transcript (default 0 = false).
