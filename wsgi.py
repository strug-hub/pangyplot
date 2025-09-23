from pangyplot.app import create_app
from dotenv import load_dotenv
import os

load_dotenv()

data_dir = os.getenv("PANGYPLOT_DATA", "./datastore")
db_name = os.getenv("PANGYPLOT_DB", "_default_")
annotation_name = os.getenv("PANGYPLOT_ANNOTATION")
ref = os.getenv("PANGYPLOT_REF")
port = int(os.getenv("PANGYPLOT_PORT", 5700))

app = create_app(data_dir, db_name, annotation_name, ref, port, development=False)
