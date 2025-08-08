from neo4j import exceptions

def create_index(session, type, properties):
    if isinstance(properties, str):
        properties = [properties]

    properties_str = ', '.join([f'n.{prop}' for prop in properties])
    try:
        session.run(f"CREATE INDEX FOR (n:{type}) ON ({properties_str})")
    except exceptions.ClientError as e:
        if "EquivalentSchemaRuleAlreadyExists" in e.code:
            # Index already exists.
            pass
        else:
            raise

def create_restraint(session, type, properties):
    if isinstance(properties, str):
        properties = [properties]

    properties_str = ', '.join([f'n.{prop}' for prop in properties])
    try:
        session.run(f"CREATE CONSTRAINT FOR (n:{type}) REQUIRE ({properties_str}) IS UNIQUE")
    except exceptions.ClientError as e:
        if "EquivalentSchemaRuleAlreadyExists" in e.code:
            # Restraint already exists.
            pass
        else:
            raise

def drop_index(session, indexName):
    session.run(f"DROP INDEX {indexName}")

def drop_all_constraints(session):
    constraints = session.run("SHOW CONSTRAINTS")
    for constraint in constraints:
        try:
            constraintName = constraint["name"]
            session.run(f"DROP CONSTRAINT {constraintName}")
            print(f"Constraint {constraintName} dropped.")
        except exceptions.ClientError as e:
            print(f"Failed to drop constraint {constraintName}: {e}")
            
def drop_all_index(session):
    indexes = session.run("SHOW INDEXES")
    for index in indexes:
        try:
            indexName = index["name"]
            session.run(f"DROP INDEX {indexName}")
            print(f"Index {indexName} dropped.")
        except exceptions.ClientError as e:
            print(f"Failed to drop index {indexName}: {e}")

def print_all_index(session):
    result = session.run("SHOW INDEXES")
    for record in result:
        print(record["name"], record["labelsOrTypes"], record["properties"], record["state"])


def create_fulltext_node_index(session, nodeType, indexName, properties):
    properties_string = ', '.join([f'n.{prop}' for prop in properties])

    def _create_ft_index(tx):
        query = f"""
                CREATE FULLTEXT INDEX {indexName} IF NOT EXISTS
                FOR (n:{nodeType})
                ON EACH [{properties_string}]
                """
        tx.run(query)

    session.write_transaction(_create_ft_index)
