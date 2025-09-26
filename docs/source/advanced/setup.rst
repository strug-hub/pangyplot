.. include:: ../substitutions.rst
.. _setup:

Dotenv Setup
==============================

Sets up the environment by generating a `.env` file used to configure the database connection and other variables.

You will be interactively prompted for:

- **DB_USER** – Neo4j username (default: `neo4j`)
- **DB_PASS** – Neo4j password (default: `password`)
- **DB_HOST** – Host address (e.g., `bolt://localhost`)
- **DB_PORT** – Port number (default: `7687`)
- **GA_TAG_ID** – Optional Google Analytics ID

If a `.env` file already exists, you will be prompted whether to overwrite it. Existing values are shown as defaults.

