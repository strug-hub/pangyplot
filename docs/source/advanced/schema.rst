.. _schema:

Storing data with SQLite
==============================

`SQLite <https://www.sqlite.org/>`_ is a lightweight, file-based database that is easy to set up and use.
During setup of PangyPlot, Layout coordinates are parsed, a GFA file is parsed and the ``S``, ``L``, ``P``, ``W`` lines are extracted.
``Bubble`` and ``Chain`` superstructures are enumerated by BubbleGun.
are calculated by odgi. These are all fed into the SQLite databases.


Schemas
~~~~~~~

By default, PangyPlot creates a database named ``_default_`` in a directory named ``datastore/graphs``.
Inside this directory are chromosome-specific directories, for example ``datastore/graphs/_default_/chr1``.
Inside each chromosome directory is a set of SQLite databases:

.. raw:: html

  <div class="icon-list">
    <div class="icon-item">
      <i class="fa-regular fa-square"></i>
      <div class="icon-text">
        <div class="icon-label">segments.db</div>
        <div class="icon-description">Contains <code>S</code> line information from GFA and layout coordinates.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-chain"></i>
      <div class="icon-text">
        <div class="icon-label">links.db</div>
        <div class="icon-description">Contains <code>L</code> line information from GFA.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-regular fa-circle"></i>
      <div class="icon-text">
        <div class="icon-label">bubbles.db</div>
        <div class="icon-description">Contains information about identified bubbles and their content.</div>
      </div>
    </div>
    <div class="icon-item">
      <i class="fa-solid fa-stairs"></i>
      <div class="icon-text">
        <div class="icon-label">step_index.db</div>
        <div class="icon-description">Contains the path information for the primary reference.</div>
      </div>
    </div>
  </div>


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


Paths
~~~~~~~~~~~~~

Inside each chromosome-specific directory is a directory named ``paths/``.
This contains a set of JSON files, one per ``P`` or ``W`` line in the GFA file. 
Each contains the path information in raw JSON.

.. note::
  Future work may move this information into a more efficient structure.


Quick Indices
~~~~~~~~~~~~~

Inside each chromosome-specific directory is also set of JSON files that contain summarized information about each ``*.db`` file,

For example, ``segments.quickindex.json`` contains: 

- **length**
- **x1**
- **y1**
- **x2**
- **y2**

for each segment. This enables quick lookup of segment positioning without needing to query the full database.
These quick indices read and held in memory when starting up PangyPlot.
