"""
PangyPlot Setup — Desktop UI for dataset management.
Double-click to launch. No command line needed.

Uses tkinter with custom styling to match PangyPlot's visual identity.
"""

import json
import os
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import ttk, filedialog

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PANGYPLOT_SCRIPT = os.path.join(SCRIPT_DIR, "pangyplot.py")
DEFAULT_DATASTORE = os.path.join(SCRIPT_DIR, "datastore")
STATE_FILE = os.path.join(SCRIPT_DIR, ".setup_state.json")

LAYOUT_EXTENSIONS = {".tsv", ".lay", ".lay.tsv", ".layout", ".layout.tsv"}

# Build reference genome list from available cytobands
CYTOBAND_DIR = os.path.join(SCRIPT_DIR, "pangyplot", "static", "cytoband")

def _discover_genomes():
    """Build genome list from organisms.py mappings + cytoband files."""
    from pangyplot.organisms import ORGANISM_TO_GENOME, VALID_ORGANISMS
    # organism label -> genome assembly
    genomes = []
    for organism, genome in ORGANISM_TO_GENOME.items():
        emoji = VALID_ORGANISMS.get(organism, "")
        label = f"{emoji} {organism} ({genome})"
        genomes.append((label, genome))
    return genomes

try:
    GENOME_OPTIONS = _discover_genomes()
except Exception:
    GENOME_OPTIONS = []

# PangyPlot color palette
COLORS = {
    "bg": "#eeeeee",
    "card": "#ffffff",
    "darker_green": "#384034",
    "dark_green": "#5D6C53",
    "light_green": "#93AC9D",
    "lighter_green": "#BCCCC2",
    "text": "#384034",
    "highlight": "#FFE268",
    "error": "#6c261d",
    "error_bg": "#f8d7da",
    "success_bg": "#d4edda",
    "success_text": "#1a5928",
    "terminal_bg": "#1e2420",
    "terminal_text": "#c8d6cc",
    "terminal_status": "#93AC9D",
    "unselected": "#9ba8a0",
    "input_bg": "#fafafa",
    "input_border": "#BCCCC2",
}

FONT_FAMILY = "Helvetica"
MONO_FAMILY = "Consolas" if sys.platform == "win32" else "Menlo" if sys.platform == "darwin" else "monospace"


def find_layout_files(gfa_path):
    """Find layout files in the same directory as a GFA file."""
    dir_path = os.path.dirname(os.path.abspath(gfa_path))
    matches = []
    try:
        for name in os.listdir(dir_path):
            lower = name.lower()
            if any(lower.endswith(ext) for ext in LAYOUT_EXTENSIONS):
                full = os.path.join(dir_path, name)
                if os.path.isfile(full):
                    matches.append(full)
    except (PermissionError, FileNotFoundError):
        pass
    return sorted(matches)


def is_status_line(line):
    """Detect emoji/arrow status lines."""
    stripped = line.strip()
    if stripped.startswith("\u2192"):
        return True
    for ch in stripped:
        if ord(ch) > 0x2000:
            return True
    return False


class SetupApp:
    def __init__(self, root):
        self.root = root
        self.root.title("PangyPlot Setup")
        self.root.configure(bg=COLORS["bg"])
        self.root.minsize(680, 600)
        self.process = None
        self.running = False

        # Try to set icon
        icon_path = os.path.join(SCRIPT_DIR, "pangyplot", "static", "images", "favicon.svg")
        try:
            # SVG icons not supported in tkinter, but try png if available
            png_path = icon_path.replace(".svg", ".png")
            if os.path.isfile(png_path):
                self.root.iconphoto(True, tk.PhotoImage(file=png_path))
        except Exception:
            pass

        self._setup_styles()
        self._build_ui()
        self._load_state()
        self._center_window(720, 680)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _center_window(self, w, h):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def _on_close(self):
        self._save_state()
        self.root.destroy()

    def _save_state(self):
        state = {}
        for key in self.entries:
            state[key] = self._get_value(key)
        state["retry"] = self.retry_var.get()
        try:
            with open(STATE_FILE, "w") as f:
                json.dump(state, f, indent=2)
        except OSError:
            pass

    def _load_state(self):
        try:
            with open(STATE_FILE, "r") as f:
                state = json.load(f)
        except (OSError, json.JSONDecodeError):
            return
        for key, val in state.items():
            if key == "retry":
                self.retry_var.set(bool(val))
                continue
            entry = self.entries.get(key)
            if entry and val:
                if isinstance(entry, ttk.Combobox):
                    # Find display label matching saved genome name
                    reverse = {g: lbl for lbl, g in self.ref_genome_map.items()}
                    if val in reverse:
                        entry.set(reverse[val])
                    else:
                        entry.set(val)
                    entry._has_placeholder = False
                else:
                    entry._has_placeholder = False
                    entry.configure(fg=COLORS["text"])
                    entry.delete(0, "end")
                    entry.insert(0, val)

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")

        # General
        style.configure(".", background=COLORS["bg"], foreground=COLORS["text"],
                         font=(FONT_FAMILY, 10))

        # Header frame
        style.configure("Header.TFrame", background=COLORS["lighter_green"])
        style.configure("Header.TLabel", background=COLORS["lighter_green"],
                         foreground=COLORS["text"], font=(FONT_FAMILY, 14, "bold"))
        style.configure("HeaderSub.TLabel", background=COLORS["lighter_green"],
                         foreground=COLORS["dark_green"], font=(FONT_FAMILY, 9))

        # Card
        style.configure("Card.TFrame", background=COLORS["card"])
        style.configure("CardTitle.TFrame", background=COLORS["light_green"])
        style.configure("CardTitle.TLabel", background=COLORS["light_green"],
                         foreground=COLORS["text"], font=(FONT_FAMILY, 10, "bold"))
        style.configure("CardBody.TFrame", background=COLORS["card"])

        # Labels
        style.configure("Form.TLabel", background=COLORS["card"],
                         foreground=COLORS["darker_green"], font=(FONT_FAMILY, 10))
        style.configure("Hint.TLabel", background=COLORS["card"],
                         foreground=COLORS["unselected"], font=(FONT_FAMILY, 8))

        # Buttons
        style.configure("Browse.TButton", font=(FONT_FAMILY, 9),
                         padding=(8, 3))
        style.map("Browse.TButton",
                   background=[("active", COLORS["highlight"]),
                              ("!active", COLORS["light_green"])],
                   foreground=[("active", COLORS["text"]),
                              ("!active", COLORS["text"])])

        style.configure("Primary.TButton", font=(FONT_FAMILY, 11, "bold"),
                         padding=(20, 6))
        style.map("Primary.TButton",
                   background=[("disabled", COLORS["unselected"]),
                              ("active", COLORS["darker_green"]),
                              ("!active", COLORS["dark_green"])],
                   foreground=[("disabled", COLORS["unselected"]),
                              ("active", "white"),
                              ("!active", "white")])

        # Checkbutton
        style.configure("Card.TCheckbutton", background=COLORS["card"],
                         foreground=COLORS["text"], font=(FONT_FAMILY, 10))

        # Combobox
        style.configure("Ref.TCombobox", font=(MONO_FAMILY, 10))
        style.map("Ref.TCombobox",
                   fieldbackground=[("readonly", COLORS["input_bg"])],
                   selectbackground=[("readonly", COLORS["input_bg"])],
                   selectforeground=[("readonly", COLORS["text"])])
        self.root.option_add("*TCombobox*Listbox.font", (MONO_FAMILY, 10))
        self.root.option_add("*TCombobox*Listbox.background", COLORS["card"])
        self.root.option_add("*TCombobox*Listbox.foreground", COLORS["text"])
        self.root.option_add("*TCombobox*Listbox.selectBackground", COLORS["highlight"])
        self.root.option_add("*TCombobox*Listbox.selectForeground", COLORS["text"])

        # Suggestion buttons
        style.configure("Suggest.TButton", font=(MONO_FAMILY, 9), padding=(6, 2))
        style.map("Suggest.TButton",
                   background=[("active", COLORS["highlight"]),
                              ("!active", COLORS["card"])],
                   foreground=[("active", COLORS["text"]),
                              ("!active", COLORS["dark_green"])])

        # Status banner
        style.configure("Status.TFrame", background=COLORS["darker_green"])
        style.configure("Status.TLabel", background=COLORS["darker_green"],
                         foreground=COLORS["terminal_status"],
                         font=(MONO_FAMILY, 12))

        # Result
        style.configure("Success.TLabel", background=COLORS["success_bg"],
                         foreground=COLORS["success_text"], font=(FONT_FAMILY, 10, "bold"),
                         padding=(10, 6))
        style.configure("Failure.TLabel", background=COLORS["error_bg"],
                         foreground=COLORS["error"], font=(FONT_FAMILY, 10, "bold"),
                         padding=(10, 6))

    def _build_ui(self):
        # Main container with padding
        main = ttk.Frame(self.root)
        main.pack(fill="both", expand=True, padx=10, pady=10)

        # Header
        header = ttk.Frame(main, style="Header.TFrame")
        header.pack(fill="x", pady=(0, 10))
        header_inner = ttk.Frame(header, style="Header.TFrame")
        header_inner.pack(fill="x", padx=16, pady=10)
        ttk.Label(header_inner, text="PangyPlot Setup", style="Header.TLabel").pack(anchor="w")
        ttk.Label(header_inner, text="Add and manage datasets", style="HeaderSub.TLabel").pack(anchor="w")

        # Card
        card = ttk.Frame(main, style="Card.TFrame")
        card.pack(fill="x", pady=(0, 10))

        # Card title bar
        title_bar = ttk.Frame(card, style="CardTitle.TFrame")
        title_bar.pack(fill="x")
        ttk.Label(title_bar, text="Add Dataset", style="CardTitle.TLabel").pack(
            anchor="w", padx=12, pady=4)

        # Card body
        body = ttk.Frame(card, style="CardBody.TFrame")
        body.pack(fill="x", padx=16, pady=12)

        # Form fields
        self.entries = {}
        self.ref_genome_map = {}  # display label -> genome assembly name

        fields = [
            ("db", "Database name", "e.g. hprc", False),
            ("ref", "Reference genome", "e.g. GRCh38", False),
            ("chr", "Chromosome", "e.g. chrY", False),
            ("gfa", "GFA file", "/path/to/graph.gfa", True),
            ("layout", "Layout file", "/path/to/layout.tsv", True),
        ]

        for i, (key, label, placeholder, browsable) in enumerate(fields):
            ttk.Label(body, text=label, style="Form.TLabel").grid(
                row=i, column=0, sticky="w", pady=4, padx=(0, 10))

            if key == "ref" and GENOME_OPTIONS:
                # Combobox for reference genome
                combo_values = [lbl for lbl, _ in GENOME_OPTIONS]
                self.ref_genome_map = {lbl: genome for lbl, genome in GENOME_OPTIONS}

                combo = ttk.Combobox(body, values=combo_values, style="Ref.TCombobox",
                                      state="readonly", font=(MONO_FAMILY, 10))
                combo.grid(row=i, column=1, sticky="ew", pady=4, columnspan=2)
                combo.set("")
                combo._placeholder = placeholder
                combo._has_placeholder = True
                self.entries[key] = combo
            else:
                entry = tk.Entry(body, font=(MONO_FAMILY, 10), relief="solid",
                                 bd=1, highlightthickness=0,
                                 bg=COLORS["input_bg"], fg=COLORS["text"],
                                 insertbackground=COLORS["text"])
                entry.insert(0, "")
                entry._placeholder = placeholder
                entry._has_placeholder = True
                self._setup_placeholder(entry, placeholder)

                if browsable:
                    entry.grid(row=i, column=1, sticky="ew", pady=4, padx=(0, 6))
                    file_type = "gfa" if key == "gfa" else "layout"
                    btn = ttk.Button(body, text="Browse", style="Browse.TButton",
                                     command=lambda k=key, ft=file_type: self._browse(k, ft))
                    btn.grid(row=i, column=2, pady=4)
                else:
                    entry.grid(row=i, column=1, sticky="ew", pady=4, columnspan=2)

                self.entries[key] = entry

        body.columnconfigure(1, weight=1)

        # Layout suggestions
        self.suggest_frame = ttk.Frame(body, style="CardBody.TFrame")
        self.suggest_frame.grid(row=len(fields), column=0, columnspan=3, sticky="ew", pady=(2, 4))
        self.suggest_label = ttk.Label(self.suggest_frame, text="Layout files found:",
                                        style="Hint.TLabel")
        self.suggest_frame.grid_remove()

        # Advanced options (collapsible)
        self.advanced_visible = tk.BooleanVar(value=False)
        adv_toggle = ttk.Frame(body, style="CardBody.TFrame")
        adv_toggle.grid(row=len(fields) + 1, column=0, columnspan=3, sticky="w", pady=(6, 0))

        self.adv_arrow = ttk.Label(adv_toggle, text="\u25b6 Advanced options",
                                    style="Hint.TLabel", cursor="hand2",
                                    font=(FONT_FAMILY, 9, "bold"))
        self.adv_arrow.pack(anchor="w")
        self.adv_arrow.bind("<Button-1>", self._toggle_advanced)

        self.adv_frame = ttk.Frame(body, style="CardBody.TFrame")
        self.adv_frame.grid(row=len(fields) + 2, column=0, columnspan=3, sticky="ew")
        self.adv_frame.grid_remove()

        adv_fields = [
            ("dir", "Storage directory", "(default: datastore/)"),
            ("path", "Reference path name", "(optional)"),
            ("offset", "BP offset", "0"),
            ("sep", "Path separator", "(optional)"),
        ]
        for i, (key, label, placeholder) in enumerate(adv_fields):
            ttk.Label(self.adv_frame, text=label, style="Form.TLabel").grid(
                row=i, column=0, sticky="w", pady=3, padx=(0, 10))
            entry = tk.Entry(self.adv_frame, font=(MONO_FAMILY, 10), relief="solid",
                             bd=1, highlightthickness=0,
                             bg=COLORS["input_bg"], fg=COLORS["text"],
                             insertbackground=COLORS["text"])
            self._setup_placeholder(entry, placeholder)
            entry.grid(row=i, column=1, sticky="ew", pady=3, columnspan=2)
            self.entries[key] = entry
        self.adv_frame.columnconfigure(1, weight=1)

        # Retry checkbox
        self.retry_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(self.adv_frame, text="Retry (reuse existing GFA index)",
                         variable=self.retry_var, style="Card.TCheckbutton").grid(
            row=len(adv_fields), column=0, columnspan=3, sticky="w", pady=(4, 0))

        # Submit button + error label
        btn_frame = ttk.Frame(body, style="CardBody.TFrame")
        btn_frame.grid(row=len(fields) + 3, column=0, columnspan=3, sticky="w", pady=(12, 0))

        self.run_btn = ttk.Button(btn_frame, text="Add Dataset", style="Primary.TButton",
                                   command=self._run_add)
        self.run_btn.pack(side="left")

        self.error_label = tk.Label(btn_frame, text="", fg=COLORS["error"],
                                     bg=COLORS["card"], font=(FONT_FAMILY, 9))
        self.error_label.pack(side="left", padx=(12, 0))

        # Command preview
        cmd_frame = ttk.Frame(body, style="CardBody.TFrame")
        cmd_frame.grid(row=len(fields) + 4, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        ttk.Label(cmd_frame, text="Command:", style="Hint.TLabel").pack(anchor="w")
        self.cmd_preview = tk.Text(cmd_frame, font=(MONO_FAMILY, 9), relief="solid",
                                    bd=1, highlightthickness=0, bg=COLORS["bg"],
                                    fg=COLORS["dark_green"], wrap="word",
                                    height=3, cursor="xterm", padx=4, pady=4)
        self.cmd_preview.pack(fill="x", pady=(2, 0))
        self.cmd_preview.configure(state="disabled")
        self._update_cmd_preview()

        # Bind all entries to update preview on change
        for key, entry in self.entries.items():
            if isinstance(entry, ttk.Combobox):
                entry.bind("<<ComboboxSelected>>", lambda e: self._update_cmd_preview())
            else:
                entry.bind("<KeyRelease>", lambda e: self._update_cmd_preview())
                entry.bind("<FocusOut>", lambda e: self._update_cmd_preview())
        self.retry_var.trace_add("write", lambda *a: self._update_cmd_preview())

        # Output section
        output_frame = ttk.Frame(main)
        output_frame.pack(fill="both", expand=True)

        # Status banner
        self.status_frame = ttk.Frame(output_frame, style="Status.TFrame")
        self.status_label = ttk.Label(self.status_frame, text="", style="Status.TLabel")
        self.status_label.pack(fill="x", padx=12, pady=8)

        # Terminal
        self.terminal = tk.Text(output_frame, bg=COLORS["terminal_bg"],
                                 fg=COLORS["terminal_text"],
                                 font=(MONO_FAMILY, 10), relief="flat",
                                 wrap="word", state="disabled",
                                 insertbackground=COLORS["terminal_text"],
                                 selectbackground=COLORS["dark_green"],
                                 highlightthickness=0, padx=12, pady=8)
        self.terminal.tag_configure("cmd", foreground=COLORS["highlight"])
        self.terminal.tag_configure("status", foreground=COLORS["terminal_status"],
                                     font=(MONO_FAMILY, 10, "bold"))
        self.terminal.tag_configure("error", foreground="#e88")

        # Result banner
        self.result_label = tk.Label(output_frame, text="", font=(FONT_FAMILY, 10, "bold"),
                                      pady=6, padx=10, anchor="w")

        # Bind GFA entry change to layout search
        self.entries["gfa"].bind("<FocusOut>", lambda e: self._search_layouts())

    def _setup_placeholder(self, entry, text):
        entry._placeholder = text
        entry._has_placeholder = True
        entry.insert(0, text)
        entry.configure(fg=COLORS["unselected"])

        def on_focus_in(e):
            if entry._has_placeholder:
                entry.delete(0, "end")
                entry.configure(fg=COLORS["text"])
                entry._has_placeholder = False

        def on_focus_out(e):
            if not entry.get():
                entry.insert(0, entry._placeholder)
                entry.configure(fg=COLORS["unselected"])
                entry._has_placeholder = True

        entry.bind("<FocusIn>", on_focus_in)
        entry.bind("<FocusOut>", on_focus_out)

    def _get_value(self, key):
        entry = self.entries[key]
        if isinstance(entry, ttk.Combobox):
            val = entry.get().strip()
            # Resolve display label to genome assembly name
            return self.ref_genome_map.get(val, val)
        if entry._has_placeholder:
            return ""
        return entry.get().strip()

    def _build_cmd_string(self):
        parts = ["python pangyplot.py add"]
        for key, flag in [("db", "--db"), ("ref", "--ref"), ("chr", "--chr"),
                          ("gfa", "--gfa"), ("layout", "--layout")]:
            val = self._get_value(key)
            if val:
                parts.append(f"{flag} {val}")
        dir_val = self._get_value("dir")
        if dir_val:
            parts.append(f"--dir {dir_val}")
        for key, flag in [("path", "--path"), ("offset", "--offset"), ("sep", "--sep")]:
            val = self._get_value(key)
            if val:
                parts.append(f"{flag} {val}")
        if self.retry_var.get():
            parts.append("--retry")
        return " ".join(parts)

    def _update_cmd_preview(self):
        cmd = self._build_cmd_string()
        self.cmd_preview.configure(state="normal")
        self.cmd_preview.delete("1.0", "end")
        self.cmd_preview.insert("1.0", cmd)
        self.cmd_preview.configure(state="disabled")

    def _toggle_advanced(self, event=None):
        if self.advanced_visible.get():
            self.adv_frame.grid_remove()
            self.adv_arrow.configure(text="\u25b6 Advanced options")
            self.advanced_visible.set(False)
        else:
            self.adv_frame.grid()
            self.adv_arrow.configure(text="\u25bc Advanced options")
            self.advanced_visible.set(True)

    def _browse(self, field_key, file_type):
        if file_type == "gfa":
            filetypes = [("GFA files", "*.gfa *.gfa.gz"), ("All files", "*.*")]
            title = "Select GFA File"
        else:
            filetypes = [("Layout files", "*.tsv *.lay *.layout"), ("All files", "*.*")]
            title = "Select Layout File"

        path = filedialog.askopenfilename(title=title, filetypes=filetypes)
        if path:
            entry = self.entries[field_key]
            entry._has_placeholder = False
            entry.configure(fg=COLORS["text"])
            entry.delete(0, "end")
            entry.insert(0, path)
            self._update_cmd_preview()
            if field_key == "gfa":
                self._search_layouts()

    def _search_layouts(self):
        gfa_path = self._get_value("gfa")
        # Clear old suggestions
        for w in self.suggest_frame.winfo_children():
            w.destroy()
        self.suggest_frame.grid_remove()

        if not gfa_path or not os.path.isfile(gfa_path):
            return

        layouts = find_layout_files(gfa_path)
        if not layouts:
            return

        ttk.Label(self.suggest_frame, text="Layout files found:",
                   style="Hint.TLabel").pack(side="left", padx=(0, 6))

        for lpath in layouts:
            name = os.path.basename(lpath)
            btn = ttk.Button(self.suggest_frame, text=name, style="Suggest.TButton",
                             command=lambda p=lpath: self._use_layout(p))
            btn.pack(side="left", padx=2)

        self.suggest_frame.grid()

        # Auto-fill if layout is empty and only one match
        if not self._get_value("layout") and len(layouts) == 1:
            self._use_layout(layouts[0])

    def _use_layout(self, path):
        entry = self.entries["layout"]
        entry._has_placeholder = False
        entry.configure(fg=COLORS["text"])
        entry.delete(0, "end")
        entry.insert(0, path)
        self._update_cmd_preview()
        for w in self.suggest_frame.winfo_children():
            w.destroy()
        self.suggest_frame.grid_remove()

    def _show_error(self, msg):
        self.error_label.configure(text=msg)

    def _clear_error(self):
        self.error_label.configure(text="")

    def _validate(self):
        required = ["db", "ref", "chr", "gfa", "layout"]
        for key in required:
            val = self._get_value(key)
            if not val:
                self._show_error(f"Missing: {key}")
                self.entries[key].focus_set()
                return False
        for key in ["gfa", "layout"]:
            val = self._get_value(key)
            if not os.path.isfile(val):
                self._show_error(f"File not found: {val}")
                self.entries[key].focus_set()
                return False
        return True

    def _run_add(self):
        self._clear_error()
        if not self._validate():
            return

        self._save_state()

        # Build command
        cmd = [sys.executable, "-u", PANGYPLOT_SCRIPT, "add", "--force"]
        cmd += ["--db", self._get_value("db")]
        cmd += ["--ref", self._get_value("ref")]
        cmd += ["--chr", self._get_value("chr")]
        cmd += ["--gfa", self._get_value("gfa")]
        cmd += ["--layout", self._get_value("layout")]
        cmd += ["--dir", self._get_value("dir") or DEFAULT_DATASTORE]

        if self._get_value("path"):
            cmd += ["--path", self._get_value("path")]
        if self._get_value("offset"):
            cmd += ["--offset", self._get_value("offset")]
        if self._get_value("sep"):
            cmd += ["--sep", self._get_value("sep")]
        if self.retry_var.get():
            cmd += ["--retry"]

        self.running = True
        self.run_btn.state(["disabled"])

        # Reset output
        self.terminal.configure(state="normal")
        self.terminal.delete("1.0", "end")
        self.terminal.configure(state="disabled")
        self.result_label.pack_forget()

        # Show status + terminal
        self.status_frame.pack(fill="x")
        self.status_label.configure(text="Starting...")
        self.terminal.pack(fill="both", expand=True)

        # Show command
        cmd_display = " ".join(cmd[2:])
        self._append_terminal(f"$ {cmd_display}\n", "cmd")

        # Run subprocess in thread
        self.process = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1)

        threading.Thread(target=self._read_output, daemon=True).start()

    def _read_output(self):
        for line in self.process.stdout:
            self.root.after(0, self._handle_line, line)
        self.process.wait()
        self.root.after(0, self._on_done, self.process.returncode)

    def _handle_line(self, line):
        stripped = line.rstrip("\n\r")
        if is_status_line(stripped):
            self.status_label.configure(text=stripped.strip())
            self._append_terminal(line, "status")
        elif "error" in stripped.lower() or "traceback" in stripped.lower():
            self._append_terminal(line, "error")
        else:
            self._append_terminal(line)

    def _append_terminal(self, text, tag=None):
        self.terminal.configure(state="normal")
        if tag:
            self.terminal.insert("end", text, tag)
        else:
            self.terminal.insert("end", text)
        self.terminal.see("end")
        self.terminal.configure(state="disabled")

    def _on_done(self, returncode):
        self.running = False
        self.run_btn.state(["!disabled"])

        if returncode == 0:
            self.status_label.configure(text="Done!")
            self.result_label.configure(text="Dataset added successfully.",
                                         bg=COLORS["success_bg"], fg=COLORS["success_text"])
        else:
            self.status_label.configure(text="Failed")
            self.result_label.configure(
                text=f"Process exited with code {returncode}. Check the output above.",
                bg=COLORS["error_bg"], fg=COLORS["error"])
        self.result_label.pack(fill="x", pady=(4, 0))


def main():
    root = tk.Tk()
    app = SetupApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
