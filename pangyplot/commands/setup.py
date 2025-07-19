import os
from pathlib import Path
from dotenv import load_dotenv

def pangyplot_setup(args):

    env_path = Path(__file__).resolve().parent / ".env"

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
    valid_organisms = ('human', 'mouse', 'fruitfly', 'zebrafish', 'chicken', 'rabbit', 'dog', 'none', 'custom')

    new_env_values["ORGANISM"] = None
    while new_env_values["ORGANISM"] is None:
        prompt_env_var("ORGANISM",
                       f"Select organism: {', '.join(valid_organisms)}: ",
                       default="human")
        if new_env_values["ORGANISM"] not in valid_organisms:
            new_env_values["ORGANISM"] = None
            print(f"Invalid organism. Please choose one of from list")

    if new_env_values["ORGANISM"] == "custom":
        prompt_env_var("CYTOBAND_PATH", "Path to custom cytoband file")
        prompt_env_var("CANONICAL_PATH", "Path to canonical chromosome file")


    with open(env_path, "w") as f:
        for k, v in new_env_values.items():
            f.write(f"{k}={v}\n")

    print(f"Environment file written to {env_path}")
