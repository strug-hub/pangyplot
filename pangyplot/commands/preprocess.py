import os
import sys
from datetime import datetime

from pangyplot.version import __version__

# ANSI color codes
BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[36m"
YELLOW = "\033[33m"
GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"


SLURM_HEADER = """#!/bin/bash
#SBATCH --job-name={job_name}
#SBATCH --cpus-per-task={threads}
#SBATCH --mem={mem}
#SBATCH --time={time}
{sbatch_gpu}#SBATCH --output={job_name}_%j.log
"""

SCRIPT_TEMPLATE_HEADER = """{shebang}# PangyPlot {version} preprocessing script
# Generated: {datetime}

THREADS={threads}
OG="{og}"
OUTPUT_DIR="{output_dir}"
PREFIX="${{OUTPUT_DIR}}/{prefix}"

mkdir -p ${{OUTPUT_DIR}}
"""

SCRIPT_SORT = """
# --------------- SORT ----------------------------
SORTED="${{PREFIX}}.sorted.og"
{paths_commands}odgi sort -t $THREADS --optimize -Y{paths_flag} -i $OG -o $SORTED -P
{paths_cleanup}"""

SCRIPT_LAYOUT = """
# --------------- LAYOUT FILE ----------------------------
odgi layout -t $THREADS -i ${{{input_var}}} --tsv ${{PREFIX}}.lay.tsv -o ${{PREFIX}}.lay{gpu_flag}
"""

SCRIPT_GFA = """
# --------------- GFA FILE ----------------------------
odgi view -t $THREADS -i ${{{input_var}}} -g > ${{PREFIX}}.gfa
"""


def prompt_yn(question, default=True):
    suffix = " [Y/n]: " if default else " [y/N]: "
    while True:
        answer = input(question + suffix).strip().lower()
        if answer == "":
            return default
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False


def prompt_str(question, default=None):
    if default:
        answer = input(f"{question} [{default}]: ").strip()
        return answer if answer else default
    while True:
        answer = input(f"{question}: ").strip()
        if answer:
            return answer


def prompt_int(question, default):
    while True:
        answer = input(f"{question} [{default}]: ").strip()
        if answer == "":
            return default
        try:
            return int(answer)
        except ValueError:
            print("  Please enter a number.")


def pangyplot_preprocess(args):
    print(f"{BOLD}{'=' * 50}")
    print(f" PangyPlot preprocessing script generator")
    print(f"{'=' * 50}{RESET}")
    print()

    # OG file
    og = prompt_str("Path to ODGI (.og) file")
    if not os.path.isfile(og):
        print(f"  {YELLOW}Warning: file not found: {og}{RESET}")
        if not prompt_yn("  Continue anyway?", default=True):
            sys.exit(1)

    prefix = os.path.splitext(os.path.basename(og))[0]
    print()

    # Threads
    threads = prompt_int("Number of threads", default=4)
    print()

    # Sort
    do_sort = prompt_yn("Sort graph before layout? (recommended)", default=True)

    paths_commands = ""
    paths = []
    if do_sort:
        print()
        print("Enter path names to prioritize during sort (in order).")
        print("Primary reference path should be first.")
        print(f"  {DIM}Tip: run 'odgi paths -L -i {og}' to see available path names.{RESET}")
        print("Leave empty to skip.")
        i = 1
        while True:
            path = input(f"  Path {i}: ").strip()
            if not path:
                break
            paths.append(path)
            i += 1

        for i, path in enumerate(paths):
            op = ">" if i == 0 else ">>"
            paths_commands += f'odgi paths -L -i $OG | grep "{path}" {op} paths.txt\n'

    print()

    # GPU
    print(f"  {DIM}Tip: run 'odgi layout --help 2>&1 | grep gpu' to check if your odgi supports GPU.{RESET}")
    use_gpu = prompt_yn("Enable GPU acceleration for layout? (recommended for large graphs)", default=False)
    print()

    # SLURM
    use_slurm = prompt_yn("Generate as SLURM job script?", default=False)
    slurm_opts = {}
    if use_slurm:
        slurm_opts["job_name"] = prompt_str("  Job name", default=f"{prefix}_preprocess")
        slurm_opts["mem"] = prompt_str("  Memory (e.g. 16G, 64G)", default="16G")
        slurm_opts["time"] = prompt_str("  Time limit (e.g. 12:00:00)", default="12:00:00")
    print()

    # Output dir
    output_dir = prompt_str("Output directory", default=".")
    print()

    # Save to file
    out_file = None
    if prompt_yn("Save script to file?", default=True):
        out_file = prompt_str("Output filename", default=f"{prefix}_preprocess.sh")

    print()

    # Build script
    input_var = "SORTED" if do_sort else "OG"

    script = ""
    if use_slurm:
        sbatch_gpu = "#SBATCH --gres=gpu:1\n" if use_gpu else ""
        script += SLURM_HEADER.format(
            job_name=slurm_opts["job_name"],
            threads=threads,
            mem=slurm_opts["mem"],
            time=slurm_opts["time"],
            sbatch_gpu=sbatch_gpu,
        )

    script += SCRIPT_TEMPLATE_HEADER.format(
        shebang="" if use_slurm else "#!/bin/bash\n",
        version=__version__,
        datetime=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        threads=threads,
        og=og,
        output_dir=output_dir,
        prefix=prefix,
    )

    if do_sort:
        has_paths = len(paths) > 0
        script += SCRIPT_SORT.format(
            paths_commands=paths_commands,
            paths_flag=" -H paths.txt" if has_paths else "",
            paths_cleanup="rm -f paths.txt\n" if has_paths else "",
        )

    script += SCRIPT_LAYOUT.format(
        input_var=input_var,
        gpu_flag=" --gpu" if use_gpu else "",
    )

    script += SCRIPT_GFA.format(input_var=input_var)

    if out_file:
        with open(out_file, "w") as f:
            f.write(script)
        os.chmod(out_file, 0o755)
        print(f"{GREEN}Script written to {out_file}{RESET}")
    else:
        print(script)
