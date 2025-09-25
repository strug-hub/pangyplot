.. _subcommands:
.. include:: ../substitutions.rst

|tool| Subcommands
==============================

pangyplot setup
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Sets up the environment by generating a `.env` file used to configure the Neo4j database connection and other variables.

You will be interactively prompted for:

- **DB_USER** – Neo4j username (default: `neo4j`)
- **DB_PASS** – Neo4j password (default: `password`)
- **DB_HOST** – Host address (e.g., `bolt://localhost`)
- **DB_PORT** – Port number (default: `7687`)
- **GA_TAG_ID** – Optional Google Analytics ID

If a `.env` file already exists, you will be prompted whether to overwrite it. Existing values are shown as defaults.

pangyplot status
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Checks the connection and status of the Neo4j database.

pangyplot run
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Launches the PangyPlot web server.

**Options:**

- ``--db``: Database name (default: `default`)
- ``--port``: Port to serve the app (default: `5700`)
- ``--organism``: Genome for predefined cytoband file. One of:
  `none`, `human`, `mouse`, `fruitfly`, `zebrafish`, `chicken`, `rabbit`, `dog`  
- ``--cytoband``: Path to a custom cytoband file
- ``--canonical``: Path to a custom canonical chromosome list

If using a custom cytoband, both `--cytoband` and `--canonical` must be provided.

pangyplot add
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Adds a pangenome dataset to the database.

**Required:**

- ``--ref``: Reference name
- ``--gfa``: Path to the rGFA file
- ``--layout``: Path to the layout TSV file
- ``--positions``: Path to the position TSV file

**Optional:**

- ``--db``: Database name (default: `default`)
- ``--update``: Add data to an existing database instead of replacing it

If the database already exists and `--update` is not used, you'll be prompted to confirm whether to merge or replace.

pangyplot annotate
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Adds gene annotations to a reference genome.

**Required:**

- ``--ref``: Reference name
- ``--gff3``: Path to the GFF3 file

pangyplot drop
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Drops data or structure from the database.

**Options:**

- ``--db``: Target database name (default: `default`)
- ``--drop-db``: Drop the entire database (confirmation required)
- ``--collection``: Drop a specific collection by ID
- ``--annotations``: Drop annotation data only
- ``--all``: Drop all data including graph and annotations (confirmation required)
