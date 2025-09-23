import os
from pathlib import Path
from dotenv import load_dotenv
import pangyplot.organisms as organisms

def pangyplot_setup(args):

    env_path = Path(__file__).resolve().parents[2] / ".env"

    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        overwrite = input("Environment file already exists. Remake? (y/n): ").strip().lower()
        if overwrite != 'y':
            exit(0)

    new_env_values = {}

    def prompt_env_var(var_name, prompt_text, default=None, optional=False):
        existing = os.getenv(var_name)
        current_default = existing or default
        prompt = f"{prompt_text} [{current_default}]: "
        value = input(prompt).strip()

        final_value = value or existing or default

        if optional and (not final_value or final_value.lower() == "none"):
            return 
        
        new_env_values[var_name] = final_value

    # Analytics
    prompt_env_var("GA_TAG_ID", "Google Analytics tag ID (optional)", default="None", optional=True)

    # Cytoband setup
    valid_organisms = organisms.VALID_ORGANISMS.keys()

    new_env_values["ORGANISM"] = None
    while new_env_values["ORGANISM"] is None:
        prompt_env_var("ORGANISM",
                       f"Choose organism: [{organisms.NO_ORGANISM}, {organisms.CUSTOM_ORGANISM}, {', '.join(valid_organisms)}]: ",
                       default=organisms.DEFAULT_ORGANISM)
        if new_env_values["ORGANISM"] not in valid_organisms:
            new_env_values["ORGANISM"] = None
            print(f"Invalid organism. Please choose one of from list")

    if new_env_values["ORGANISM"] == organisms.CUSTOM_ORGANISM:
        prompt_env_var("CYTOBAND_PATH", "Path to custom cytoband file")
        prompt_env_var("CANONICAL_PATH", "Path to canonical chromosome file")


    print("PangyPlot Production Environment Setup...")
    # Database setup
    prompt_env_var("PANGYPLOT_DATA", "Path to database directory", default="./datastore")
    prompt_env_var("PANGYPLOT_DB", "Database name", default="_default_")
    prompt_env_var("PANGYPLOT_ANNOTATION", "Annotation dataset name", default="None", optional=True)
    prompt_env_var("PANGYPLOT_REF", "Reference genome", default="None", optional=True)
    prompt_env_var("PANGYPLOT_PORT", "Port for the app", default="5700")

    with open(env_path, "w") as f:
        for k, v in new_env_values.items():
            f.write(f"{k}={v}\n")

    print(f"Environment file written to {env_path}")
