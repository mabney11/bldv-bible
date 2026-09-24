#!/usr/bin/env python
"""
observability_widget.pyw

Python/tkinter rewrite of paleo-studio's desktop observability widget,
replacing observability-widget.ps1 (WPF/PowerShell). Reads the SAME
server/.observability/status.json written every ~20s by the unchanged
Node collector (scripts/observability-status.mjs), and offers the same
one-click Actions panel wired to the SAME already-trusted scripts this
project already runs unattended (lexicon-sync.sh, studio-sync.sh,
deploy-blue-green.sh, sync-corpus-to-prod.sh) -- nothing about what the
widget DOES changed, only how it's built.

fieldy, 2026-09-24: after three separate PowerShell/WPF-only failure
modes in one week -- a literal `--` inside an XAML <!-- --> comment
breaking the XML parse with every $window.FindName(...) then silently
returning $null; a console window that had to stay open because a WPF
window launched "directly" is a child of that console process; and
finally, a genuinely missing closing quote on the Bake ToolTip line
that made PowerShell fail to parse the ENTIRE script at load time,
before any logging code ever ran -- moved to Python instead. Every
failure path here (a missing pip package, a bug in this file, a bad
status.json) logs to ~\\observability.log BEFORE doing anything else.

fieldy, 2026-09-24, after the widget was up and running: "lets add
tooltips for each button and make them buttons instead of links that
explains what it does, i dont see what button id press for syncyng my
corpuses" -- the Actions row is now real tk.Button widgets (not
underlined text) and every one has a hover tooltip explaining exactly
what it runs; Rebake's tooltip says outright that it's the corpus/
lexicon-database sync to prod. Also added: "lets add a select all/
unselect all button" -- a toggle next to PENDING FILES that selects or
clears every file currently listed.

One-time setup:
    pip install pystray pillow

Run directly to test (a console WILL show -- that's normal, it's the
one you launched it from):
    python scripts\\observability_widget.pyw

Real/day-to-day use, NO console ever:
    pythonw scripts\\observability_widget.pyw
scripts\\setup-observability-task.ps1 registers exactly that at logon.

observability-widget.ps1 and observability-widget-hidden.vbs are now
obsolete -- safe to delete once this has been running happily for a
while.
"""

import os
import sys
import json
import time
import socket
import shutil
import threading
import subprocess
import traceback
from datetime import datetime

USERPROFILE = os.environ.get('USERPROFILE') or os.path.expanduser('~')
WIDGET_LOG = os.path.join(USERPROFILE, 'observability.log')


def log_line(msg):
    """Every code path in this file that can fail funnels through here
    first. This is the single fix for the PowerShell version's whole
    class of bug: a failure that never got logged because the process
    died before reaching its own logging code."""
    try:
        stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with open(WIDGET_LOG, 'a', encoding='utf-8') as f:
            f.write(f"[{stamp}] observability_widget.pyw: {msg}\n")
    except Exception:
        pass


try:
    import tkinter as tk
    from tkinter import messagebox
except Exception:
    log_line("FATAL: tkinter is not available in this Python install -- " + traceback.format_exc())
    sys.exit(1)

try:
    import pystray
    from PIL import Image
except Exception:
    log_line("FATAL: pystray/Pillow not installed. Run once from a normal terminal:  pip install pystray pillow")
    try:
        _r = tk.Tk()
        _r.withdraw()
        messagebox.showerror(
            "Paleo Studio observability",
            "Missing dependency -- run this once from a normal terminal:\n\n"
            "    pip install pystray pillow\n\n"
            "Then start the widget again.",
        )
    except Exception:
        pass
    sys.exit(1)

# ── Paths / config ──────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)
STATUS_FILE = os.path.join(REPO_ROOT, 'server', '.observability', 'status.json')
ICON_PATH = os.path.join(SCRIPT_DIR, 'paleo-studio.ico')
ACTIONS_LOG = os.path.join(USERPROFILE, 'paleo-widget-actions.log')
DEPLOY_LOG = os.path.join(USERPROFILE, 'deploy.log')
REBAKE_LOG = os.path.join(USERPROFILE, 'rebake.log')

SINGLE_INSTANCE_PORT = 47653  # arbitrary, unlikely-collision localhost port

BG = '#1A1A1A'
BTN_BG = '#242424'
BTN_ACTIVE_BG = '#333333'
BORDER = '#404040'
FG_WHITE = '#FFFFFF'
FG_GRAY = '#808080'
FG_DIM = '#777777'
FG_LINK = '#88ccff'
FG_OK = '#90EE90'
FG_WARN = '#FF4500'
FG_ORANGE = '#FFA500'


def brush(ok):
    if ok is True:
        return FG_OK
    if ok is False:
        return FG_WARN
    return FG_GRAY


# ── bash / ssh helpers (mirrors Get-BashExe / Get-ProdSshTarget) ───────
def get_bash_exe():
    exe = shutil.which('bash.exe') or shutil.which('bash')
    if exe:
        return exe
    roots = [
        os.environ.get('ProgramFiles'),
        os.environ.get('ProgramFiles(x86)'),
        os.path.join(os.environ.get('LocalAppData', ''), 'Programs') if os.environ.get('LocalAppData') else None,
    ]
    for root in roots:
        if not root:
            continue
        candidate = os.path.join(root, 'Git', 'bin', 'bash.exe')
        if os.path.isfile(candidate):
            return candidate
    return None


def get_prod_ssh_target():
    return {
        'bash_exe': get_bash_exe(),
        'host_alias': os.environ.get('PALEO_PROD_HOST', 'paleo-prod'),
        'rrepo': os.environ.get('PALEO_PROD_REPO', '/root/paleo-studio'),
    }


NO_WINDOW = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0


def run_bash_logged(command, log_path, label):
    """Synchronous, for Commit & Push -- needs a real answer, not a guess."""
    bash_exe = get_bash_exe()
    if not bash_exe:
        msg = f"{label} -- FAILED: bash.exe not found (checked PATH, Program Files, Program Files (x86), %LocalAppData%\\Programs)"
        _append_log(log_path, msg)
        return {'success': False, 'output': 'bash.exe not found', 'bash_missing': True}
    try:
        proc = subprocess.run(
            [bash_exe, '-lc', command],
            capture_output=True, text=True, timeout=120, creationflags=NO_WINDOW,
        )
        combined = (proc.stdout + proc.stderr).strip()
        ok = proc.returncode == 0
        _append_log(log_path, f"{label} -- exit={proc.returncode}\n{combined}\n")
        return {'success': ok, 'output': combined, 'bash_missing': False}
    except Exception as e:
        _append_log(log_path, f"{label} -- FAILED to launch bash.exe: {e}")
        return {'success': False, 'output': str(e), 'bash_missing': False}


def start_bash_background(command, log_path):
    """Fire-and-forget, cd'd into REPO_ROOT, output appended to log_path."""
    bash_exe = get_bash_exe()
    if not bash_exe:
        return False, 'bash.exe not found'
    wrapped = f"cd '{REPO_ROOT}' && ({command}) >> '{log_path}' 2>&1"
    try:
        subprocess.Popen([bash_exe, '-lc', wrapped], creationflags=NO_WINDOW)
        return True, None
    except Exception as e:
        return False, str(e)


def _append_log(path, msg):
    try:
        stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with open(path, 'a', encoding='utf-8') as f:
            f.write(f"[{stamp}] {msg}\n")
    except Exception:
        pass


def pid_alive(pid):
    try:
        result = subprocess.run(
            ['tasklist', '/FI', f'PID eq {pid}'],
            capture_output=True, text=True, creationflags=NO_WINDOW,
        )
        return str(pid) in result.stdout
    except Exception:
        return False


# ── Single-instance guard ───────────────────────────────────────────────
def acquire_single_instance_lock():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', SINGLE_INSTANCE_PORT))
        s.listen(1)
        return s  # kept alive for the process lifetime (module-level ref below)
    except OSError:
        log_line(
            "another instance already holds the single-instance lock -- exiting without "
            "opening a window. Check the system tray (including hidden icons) for an existing "
            "icon, or Task Manager for a leftover pythonw.exe to end."
        )
        return None


# ── Simple tooltip (Bake line + every Action button) ────────────────────
class ToolTip:
    def __init__(self, widget, text_provider):
        self.widget = widget
        self.text_provider = text_provider
        self.tip = None
        widget.bind('<Enter>', self.show)
        widget.bind('<Leave>', self.hide)

    def show(self, event=None):
        text = self.text_provider()
        if not text:
            return
        x = self.widget.winfo_rootx() + 10
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 6

        self.tip = tk.Toplevel(self.widget)
        self.tip.wm_overrideredirect(True)
        # fieldy, 2026-09-24: "the tooltip is too transparant and is behind
        # the main window" -- the main widget is itself topmost with its own
        # alpha, so a plain Toplevel tooltip rendered BEHIND it and the two
        # semi-transparent layers blended together. Force the tooltip
        # topmost and fully opaque (alpha 1.0, explicit solid canvas bg,
        # never inherited) so it always draws cleanly on top.
        self.tip.wm_attributes('-topmost', True)
        try:
            self.tip.wm_attributes('-alpha', 1.0)
        except Exception:
            pass

        padding, wraplength = 8, 260
        measure = tk.Label(self.tip, text=text, font=('Segoe UI', 8), wraplength=wraplength, justify='left')
        measure.update_idletasks()
        tw = min(measure.winfo_reqwidth(), wraplength) + padding * 2
        th = measure.winfo_reqheight() + padding * 2
        measure.destroy()

        # Canvas instead of a plain Label so a dashed border can be drawn
        # directly ("with a thin, dashed border around it").
        canvas = tk.Canvas(self.tip, width=tw, height=th, bg='#1E1E1E', highlightthickness=0)
        canvas.pack()
        canvas.create_rectangle(1, 1, tw - 1, th - 1, outline=FG_LINK, dash=(3, 2), width=1)
        canvas.create_text(padding, padding, text=text, anchor='nw', fill='white',
                            font=('Segoe UI', 8), width=wraplength, justify='left')

        self.tip.wm_geometry(f"{tw}x{th}+{x}+{y}")
        self.tip.lift()

    def hide(self, event=None):
        if self.tip:
            self.tip.destroy()
            self.tip = None


def main():
    lock_socket = acquire_single_instance_lock()
    if lock_socket is None:
        return

    selected_files = set()
    bake_tooltip_text = {'value': ''}
    last_files_holder = {'files': []}

    root = tk.Tk()
    root.title("Paleo Studio")
    root.overrideredirect(True)
    root.attributes('-topmost', True)
    try:
        root.attributes('-alpha', 0.92)
    except Exception:
        pass
    root.configure(bg=BG)
    WIDTH, HEIGHT = 380, 710   # +30 for the action-log header (2026-09-24)
    root.geometry(f'{WIDTH}x{HEIGHT}')
    root.update_idletasks()
    screen_w = root.winfo_screenwidth()
    root.geometry(f'{WIDTH}x{HEIGHT}+{screen_w - WIDTH - 20}+20')
    root.protocol("WM_DELETE_WINDOW", lambda: root.withdraw())

    outer = tk.Frame(root, bg=BG, highlightthickness=1, highlightbackground=BORDER)
    outer.pack(fill='both', expand=True)
    main_frame = tk.Frame(outer, bg=BG, padx=14, pady=12)
    main_frame.pack(fill='both', expand=True)

    # Drag-to-move by the background
    def start_drag(event):
        root._drag_x = event.x
        root._drag_y = event.y

    def do_drag(event):
        x = root.winfo_x() + (event.x - root._drag_x)
        y = root.winfo_y() + (event.y - root._drag_y)
        root.geometry(f'+{x}+{y}')

    for w in (outer, main_frame):
        w.bind('<Button-1>', start_drag)
        w.bind('<B1-Motion>', do_drag)

    # Row 0: Local  x  GitHub
    top_row = tk.Frame(main_frame, bg=BG)
    top_row.pack(fill='x', pady=(0, 8))
    tk.Label(top_row, text="Local", font=('Segoe UI', 11, 'bold'), fg=FG_WHITE, bg=BG).pack(side='left')
    close_label = tk.Label(top_row, text="✕", font=('Segoe UI', 11), fg=FG_GRAY, bg=BG, cursor='hand2')
    close_label.pack(side='left', expand=True)
    close_label.bind('<Button-1>', lambda e: root.withdraw())
    tk.Label(top_row, text="GitHub", font=('Segoe UI', 11, 'bold'), fg=FG_WHITE, bg=BG).pack(side='right')

    def status_label(**kw):
        l = tk.Label(main_frame, bg=BG, font=('Segoe UI', 10), anchor='w', justify='left', wraplength=340)
        l.pack(fill='x', pady=3)
        return l

    local_git_label = status_label()
    locks_label = tk.Label(main_frame, bg=BG, fg=FG_WARN, font=('Segoe UI', 9), anchor='w',
                            justify='left', wraplength=340)
    lexicon_label = status_label()
    studio_label = status_label()
    prod_label = status_label()
    site_label = status_label()
    bake_label = status_label()
    ToolTip(bake_label, lambda: bake_tooltip_text['value'])

    # ── Actions panel: real buttons, each with a tooltip explaining what
    # it runs (fieldy, 2026-09-24: "i dont see what button id press for
    # syncyng my corpuses" -- that's Rebake; its tooltip says so plainly). ──
    tk.Label(main_frame, text="ACTIONS", fg=FG_DIM, bg=BG, font=('Segoe UI', 8)).pack(anchor='w', pady=(6, 4))
    actions_grid = tk.Frame(main_frame, bg=BG)
    actions_grid.pack(fill='x')
    for col in range(3):
        actions_grid.grid_columnconfigure(col, weight=1)

    def make_button(parent, text, tooltip):
        b = tk.Button(
            parent, text=text, font=('Segoe UI', 9), fg=FG_LINK, bg=BTN_BG,
            activebackground=BTN_ACTIVE_BG, activeforeground=FG_LINK,
            relief='flat', bd=1, highlightthickness=1, highlightbackground=BORDER,
            highlightcolor=BORDER, padx=4, pady=4, cursor='hand2',
        )
        ToolTip(b, lambda t=tooltip: t)
        return b

    pull_btn = make_button(actions_grid, "Pull",
        "Pull the latest commits from GitHub into this local checkout (git pull --rebase origin main)")
    push_btn = make_button(actions_grid, "Push",
        "Push your local commits up to GitHub (git push origin main)")
    lex_btn = make_button(actions_grid, "Lexicon",
        "Re-run the lexicon sync script right now instead of waiting for its next ~15s pass (./lexicon-sync.sh)")
    stu_btn = make_button(actions_grid, "Studio",
        "Re-run the Translation Studio sync script right now (./studio-sync.sh)")
    catchup_btn = make_button(actions_grid, "Catch Up",
        "SSH to prod and re-trigger its lexicon sync immediately, instead of waiting for prod's own ~15s poll")
    locks_btn = make_button(actions_grid, "Locks",
        "Remove any stale git lock file older than 1 minute (a real, actively-forming lock from the last minute is left alone)")
    rebake_btn = make_button(actions_grid, "Rebake",
        "THIS is the corpus/lexicon database sync to prod: rebuilds surface-index.db from your current "
        "corpus.db, pushes corpus.db (only if yours is newer than prod's) and surface-index.db to prod, and swaps "
        "them into the live site. Click again to confirm. Dot: orange blinking = running, green = done, red = failed.")
    deploy_btn = make_button(actions_grid, "Deploy",
        "Swap prod's live containers to the latest deployed CODE (not the databases -- that's Rebake). "
        "Zero downtime. Click again to confirm. Dot: orange blinking = running, green = done, red = failed.")
    logs_btn = make_button(actions_grid, "Logs",
        "Open the folder holding every log these actions and the background watchers write to")
    restart_btn = make_button(actions_grid, "Restart",
        "Restart Collector: kill and restart the background process that polls git/site/prod status "
        "every ~20s and feeds this widget")

    buttons_in_order = [pull_btn, push_btn, lex_btn, stu_btn, catchup_btn,
                         locks_btn, rebake_btn, deploy_btn, logs_btn, restart_btn]
    for i, b in enumerate(buttons_in_order):
        r, c = divmod(i, 3)
        b.grid(row=r, column=c, sticky='ew', padx=3, pady=3)

    autofix_label = tk.Label(main_frame, fg=FG_LINK, bg=BG, font=('Segoe UI', 9), anchor='w',
                              justify='left', wraplength=340)
    autofix_label.pack(fill='x', pady=(8, 0))
    last_checked_label = tk.Label(main_frame, fg=FG_GRAY, bg=BG, font=('Segoe UI', 8), anchor='w')
    last_checked_label.pack(fill='x', pady=(4, 0))

    # ── Action log panel (fieldy, 2026-09-24: "if i could see the logs of the
    # actions in the widget that i can minimize or expand"). Shows the live
    # output of the most recently started action -- only THIS run's lines
    # (read from the byte offset the log had when the run started). The
    # header stays visible while collapsed, so running/finished is always
    # readable at a glance; click it to expand/collapse. ──────────────────
    LOG_PANEL_HEIGHT = 200
    log_state = {'expanded': False, 'path': None, 'offset': 0, 'label': '', 'status': '', 'last_text': None}
    log_header = tk.Label(main_frame, text="\u25b8 LOG  (no action run yet)", fg=FG_DIM, bg=BG,
                          font=('Segoe UI', 8), anchor='w', cursor='hand2')
    log_header.pack(fill='x', pady=(10, 2))
    log_frame = tk.Frame(main_frame, bg=BG, highlightthickness=1, highlightbackground=BORDER)
    log_text = tk.Text(log_frame, height=12, bg='#111111', fg='#CCCCCC', insertbackground='#CCCCCC',
                       font=('Consolas', 8), wrap='char', relief='flat', bd=0, padx=4, pady=3,
                       state='disabled')
    log_scroll = tk.Scrollbar(log_frame, orient='vertical', command=log_text.yview)
    log_text.configure(yscrollcommand=log_scroll.set)
    log_text.pack(side='left', fill='both', expand=True)
    log_scroll.pack(side='right', fill='y')

    def refresh_log_header():
        arrow = "\u25be" if log_state['expanded'] else "\u25b8"
        if log_state['label']:
            log_header.config(text=f"{arrow} LOG \u00b7 {log_state['label']} \u00b7 {log_state['status']}")
        else:
            log_header.config(text=f"{arrow} LOG  (no action run yet)")

    def toggle_log(event=None):
        log_state['expanded'] = not log_state['expanded']
        h = root.winfo_height()
        if log_state['expanded']:
            log_frame.pack(fill='x', after=log_header)
            root.geometry(f"{root.winfo_width()}x{h + LOG_PANEL_HEIGHT}")
            log_state['last_text'] = None
            tail_log()
        else:
            log_frame.pack_forget()
            root.geometry(f"{root.winfo_width()}x{max(HEIGHT, h - LOG_PANEL_HEIGHT)}")
        refresh_log_header()

    log_header.bind('<Button-1>', toggle_log)
    ToolTip(log_header, lambda: "Click to show or hide the live output of the last action you ran"
                                + (f"\n({log_state['path']})" if log_state['path'] else ""))

    def read_log_since(path, offset):
        try:
            with open(path, 'rb') as f:
                f.seek(offset)
                data = f.read()
        except Exception:
            return ''
        text = data.decode('utf-8', errors='replace').replace('\r\n', '\n')
        # progress bars rewrite one line with bare \r -- keep only the last redraw
        text = '\n'.join(line.split('\r')[-1] for line in text.split('\n'))
        lines = text.split('\n')
        return '\n'.join(lines[-400:])

    def tail_log():
        if not (log_state['expanded'] and log_state['path']):
            return
        text = read_log_since(log_state['path'], log_state['offset'])
        if text == log_state['last_text']:
            return
        log_state['last_text'] = text
        at_bottom = log_text.yview()[1] >= 0.999
        log_text.config(state='normal')
        log_text.delete('1.0', 'end')
        log_text.insert('end', text)
        log_text.config(state='disabled')
        if at_bottom:
            log_text.see('end')

    def log_tail_loop():
        try:
            tail_log()
        finally:
            root.after(1000, log_tail_loop)
    root.after(1000, log_tail_loop)

    # Pending files, with a Select All / Unselect All toggle next to the header
    # (fieldy, 2026-09-24: "lets add a select all/ unselect all button")
    pending_header = tk.Frame(main_frame, bg=BG)
    pending_header.pack(fill='x', pady=(10, 4))
    tk.Label(pending_header, text="PENDING FILES", fg=FG_DIM, bg=BG, font=('Segoe UI', 8)).pack(side='left')
    select_all_label = tk.Label(pending_header, text="Select All", fg=FG_LINK, bg=BG,
                                 font=('Segoe UI', 8, 'underline'), cursor='hand2')
    select_all_label.pack(side='right')
    ToolTip(select_all_label, lambda: "Select, or clear, every file currently listed below")

    no_files_label = tk.Label(main_frame, fg=FG_GRAY, bg=BG, font=('Segoe UI', 9), anchor='w')

    pending_container = tk.Frame(main_frame, bg=BG)
    pending_container.pack(fill='x')
    files_canvas = tk.Canvas(pending_container, height=150, bg=BG, highlightthickness=0)
    files_scrollbar = tk.Scrollbar(pending_container, orient='vertical', command=files_canvas.yview)
    file_checklist_frame = tk.Frame(files_canvas, bg=BG)
    file_checklist_frame.bind(
        '<Configure>', lambda e: files_canvas.configure(scrollregion=files_canvas.bbox('all'))
    )
    files_canvas.create_window((0, 0), window=file_checklist_frame, anchor='nw')
    files_canvas.configure(yscrollcommand=files_scrollbar.set)
    files_canvas.pack(side='left', fill='both', expand=True)
    files_scrollbar.pack(side='right', fill='y')

    # Commit box
    commit_row = tk.Frame(main_frame, bg=BG)
    commit_row.pack(fill='x', pady=(8, 0))
    commit_var = tk.StringVar()
    commit_entry = tk.Entry(commit_row, textvariable=commit_var, font=('Segoe UI', 9),
                             bg='#333333', fg=FG_WHITE, insertbackground=FG_WHITE,
                             highlightthickness=1, highlightbackground=BORDER, highlightcolor=BORDER,
                             relief='flat')
    commit_entry.pack(side='left', fill='x', expand=True, padx=(0, 6), ipady=3)
    commit_btn = make_button(commit_row, "Commit & Push",
        "Stage, commit, and push only the checked files above, using this commit message")
    commit_btn.pack(side='right')

    # ── Action handlers ──────────────────────────────────────────────
    def refresh_select_all_label():
        current_paths = {f.get('path') for f in last_files_holder['files']}
        if not current_paths:
            select_all_label.pack_forget()
            return
        select_all_label.pack(side='right')
        if current_paths.issubset(selected_files):
            select_all_label.config(text="Unselect All")
        else:
            select_all_label.config(text="Select All")

    def update_file_checklist(files):
        last_files_holder['files'] = files
        current_paths = {f.get('path') for f in files}
        for p in list(selected_files):
            if p not in current_paths:
                selected_files.discard(p)

        for child in file_checklist_frame.winfo_children():
            child.destroy()

        if not files:
            no_files_label.config(text="Nothing pending outside lexicon/studio-data", fg=FG_GRAY)
            no_files_label.pack(anchor='w')
        else:
            no_files_label.pack_forget()
            for f in files:
                path = f.get('path')
                label_text = f"{f.get('status', '')}  {path}"
                color = FG_WHITE
                if f.get('stale'):
                    age_s = f.get('age_s')
                    hrs = round(age_s / 3600, 1) if age_s else '?'
                    label_text += f"  ({hrs}h)"
                    color = FG_ORANGE
                var = tk.BooleanVar(value=(path in selected_files))

                def on_toggle(path=path, var=var):
                    if var.get():
                        selected_files.add(path)
                    else:
                        selected_files.discard(path)
                    refresh_select_all_label()

                tk.Checkbutton(
                    file_checklist_frame, text=label_text, variable=var, command=on_toggle,
                    fg=color, bg=BG, selectcolor=BG, activebackground=BG, activeforeground=color,
                    font=('Segoe UI', 9), anchor='w', justify='left',
                ).pack(fill='x', anchor='w')

        refresh_select_all_label()

    def on_select_all(event=None):
        current_paths = {f.get('path') for f in last_files_holder['files']}
        if not current_paths:
            return
        if current_paths.issubset(selected_files):
            selected_files.clear()
        else:
            selected_files.update(current_paths)
        update_file_checklist(last_files_holder['files'])

    select_all_label.bind('<Button-1>', on_select_all)

    def set_waiting(msg):
        local_git_label.config(text=msg, fg=FG_GRAY)
        locks_label.pack_forget()
        for l in (lexicon_label, studio_label, prod_label, site_label, bake_label, autofix_label, last_checked_label):
            l.config(text="")

    def update_widget():
        try:
            if not os.path.isfile(STATUS_FILE):
                set_waiting("Waiting for first status...")
                last_checked_label.config(text="No data yet -- is 'bldbible observability collector' task running?")
                return
            try:
                with open(STATUS_FILE, 'r', encoding='utf-8') as f:
                    raw = f.read()
                if not raw.strip():
                    return
                s = json.loads(raw)
            except Exception:
                return  # status.json write-then-rename; a mid-write read is rare, just retry next tick

            local = s.get('local', {}) or {}
            git = local.get('git', {}) or {}
            ahead, behind = git.get('ahead'), git.get('behind')
            git_ok = bool(git.get('fetch_ok')) and behind == 0
            local_git_label.config(text=f"{ahead} ahead / {behind} behind", fg=brush(git_ok))

            locks = local.get('git_locks') or []
            if locks:
                names = ', '.join(l.get('path', '') for l in locks)
                locks_label.config(text=f"{len(locks)} git lock(s) held: {names} -- use Locks below if this sits for more than a minute or two")
                locks_label.pack(fill='x', pady=(0, 3), after=local_git_label)
            else:
                locks_label.pack_forget()

            update_file_checklist((local.get('other_changes') or {}).get('files') or [])

            lex = local.get('lexicon_sync_failing') or {}
            if lex.get('present'):
                lexicon_label.config(text=f"Lexicon sync: STUCK since {lex.get('since')}", fg=brush(False))
            else:
                lexicon_label.config(text="Lexicon sync: OK", fg=brush(True))

            stu = local.get('studio_sync_failing') or {}
            if stu.get('present'):
                studio_label.config(text=f"Studio sync: STUCK since {stu.get('since')}", fg=brush(False))
            else:
                studio_label.config(text="Studio sync: OK", fg=brush(True))

            prod = s.get('prod', {}) or {}
            if prod.get('reachable'):
                p_behind = prod.get('git_behind_origin')
                containers = ','.join(prod.get('containers') or []) or 'none'
                prod_label.config(text=f"Prod: {p_behind} behind GitHub | {containers}", fg=brush(p_behind == 0))
            else:
                prod_label.config(text="Prod: UNREACHABLE via ssh", fg=brush(False))

            site = s.get('site', {}) or {}
            if site.get('reachable'):
                uptime_s = site.get('uptime_s')
                up_h = round(uptime_s / 3600, 1) if uptime_s else '?'
                site_label.config(text=f"Site: up ({site.get('latency_ms')}ms, {up_h}h)", fg=brush(True))
            else:
                site_label.config(text="Site: DOWN or unreachable", fg=brush(False))

            local_bake = local.get('surface_index') or {}
            prod_bake = (prod.get('surface_index') or {}) if prod.get('reachable') else {}
            local_bake_ok = (not local_bake.get('stale')) if local_bake.get('known') else None
            prod_bake_ok = (not prod_bake.get('stale')) if prod_bake.get('known') else None
            local_bake_label = "?" if local_bake_ok is None else ("OK" if local_bake_ok else "STALE")
            prod_bake_label = "?" if (not prod.get('reachable') or prod_bake_ok is None) else ("OK" if prod_bake_ok else "STALE")
            bake_label.config(text=f"Bake: local {local_bake_label} / prod {prod_bake_label}")
            if local_bake_ok is False or prod_bake_ok is False:
                bake_label.config(fg=brush(False))
            elif local_bake_ok is True and prod_bake_ok is True:
                bake_label.config(fg=brush(True))
            else:
                bake_label.config(fg=brush(None))

            if local_bake.get('known'):
                local_detail = (f"local: surface-index.db {local_bake.get('surface_index_mtime')}\n"
                                 f"corpus.db {local_bake.get('corpus_db_mtime')}\n"
                                 f"build-surface-index.js {local_bake.get('build_script_mtime')}")
            else:
                local_detail = "local: no bake data (surface-index.db or corpus.db not found)"
            if not prod.get('reachable'):
                prod_detail = "prod: unreachable via ssh, no bake data"
            elif prod_bake.get('known'):
                prod_detail = f"prod: surface-index.db {prod_bake.get('surface_index_mtime')}\ncorpus.db {prod_bake.get('corpus_db_mtime')}"
            else:
                prod_detail = "prod: reachable but no bake data (stat failed -- check PALEO_PROD_DATA_DIR)"
            bake_tooltip_text['value'] = f"{local_detail}\n\n{prod_detail}"

            auto_resolved = s.get('auto_resolved') or []
            if auto_resolved:
                actions = ', '.join(a.get('action', '') for a in auto_resolved)
                autofix_label.config(text=f"Auto-fixed just now: {actions}")
            else:
                autofix_label.config(text="")

            last_checked_label.config(text=f"Checked: {s.get('generated_at')}")
        finally:
            root.after(5000, update_widget)

    def on_commit_and_push():
        msg = commit_var.get().strip()
        paths = list(selected_files)
        bad = False
        if not msg:
            commit_entry.config(highlightbackground=FG_WARN, highlightcolor=FG_WARN)
            bad = True
        else:
            commit_entry.config(highlightbackground=BORDER, highlightcolor=BORDER)
        if not paths:
            no_files_label.config(text="Check at least one file above first", fg=FG_WARN)
            no_files_label.pack(anchor='w')
            bad = True
        if bad:
            return

        commit_btn.config(text="Committing...", state='disabled')
        commit_entry.config(state='disabled')
        no_files_label.pack_forget()
        root.update_idletasks()

        escaped_msg = msg.replace("'", "'\\''")
        quoted_paths = ' '.join("'" + p.replace("'", "'\\''") + "'" for p in paths)
        cmd = f"cd '{REPO_ROOT}' && git add -- {quoted_paths} && git commit -m '{escaped_msg}' && git push origin main"
        result = run_bash_logged(cmd, ACTIONS_LOG, f"commit-and-push: {quoted_paths}")

        commit_btn.config(text="Commit & Push", state='normal')
        commit_entry.config(state='normal')

        if result['success']:
            commit_var.set("")
            selected_files.clear()
            no_files_label.config(text="Committed & pushed", fg=FG_OK)
            no_files_label.pack(anchor='w')
        else:
            lines = [l for l in result['output'].split('\n') if l.strip()]
            last_line = lines[-1] if lines else ''
            detail = "bash.exe not found" if result['bash_missing'] else last_line
            no_files_label.config(text=f"Failed: {detail} (see {ACTIONS_LOG})", fg=FG_WARN)
            no_files_label.pack(anchor='w')

    commit_btn.config(command=on_commit_and_push)
    commit_entry.bind('<Return>', lambda e: on_commit_and_push())

    # ── Tracked action runs (fieldy, 2026-09-24: "a slow flashing orange dot
    # can be sufficient in letting me know its still ongoing and a green dot
    # when its finished"). Every action now keeps its Popen handle, so the
    # widget KNOWS when the run ends and with what exit code, instead of
    # resetting the button on a cosmetic timer:
    #   orange, slowly blinking  running
    #   green                    finished OK (exit 0)
    #   red                      failed (non-zero exit / could not launch)
    # The dot stays until that action is run again. Start/finish lines are
    # written into the action's own log, and the log panel follows the most
    # recently started run. ───────────────────────────────────────────────
    DOT_ORANGE, DOT_DIM, DOT_GREEN, DOT_RED = '#FFA500', '#5A3C00', '#4CD964', '#FF4500'
    dots = {}

    def dot_for(button):
        if button not in dots:
            c = tk.Canvas(button.master, width=9, height=9, bg=BTN_BG, highlightthickness=0, bd=0)
            oval = c.create_oval(1, 1, 8, 8, fill=DOT_DIM, outline='')
            dots[button] = (c, oval)
        c, oval = dots[button]
        c.place(in_=button, relx=1.0, x=-6, rely=0.5, anchor='e')
        c.tk.call('raise', c._w, button._w)   # widget stacking; Canvas.lift() means tag_raise (canvas items)
        return c, oval

    def set_dot(button, color):
        c, oval = dot_for(button)
        c.itemconfig(oval, fill=color)

    def start_tracked(button, idle_text, running_text, label, command, log_path):
        """Run `command` (bash, cd'd into REPO_ROOT, output appended to
        log_path) and track it to completion. Returns False if it could not
        be launched."""
        bash_exe = get_bash_exe()
        stamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        try:
            offset = os.path.getsize(log_path)
        except OSError:
            offset = 0
        log_state.update(path=log_path, offset=offset, label=label, status='running', last_text=None)
        refresh_log_header()
        if not bash_exe:
            _append_log(log_path, f"{label} -- FAILED: bash.exe not found")
            set_dot(button, DOT_RED)
            log_state['status'] = 'failed (bash.exe not found)'
            refresh_log_header()
            return False
        try:
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(f"\n[{stamp}] \u25b6 {label} started\n")
        except Exception:
            pass
        wrapped = f"cd '{REPO_ROOT}' && ({command}) >> '{log_path}' 2>&1"
        try:
            proc = subprocess.Popen([bash_exe, '-lc', wrapped], creationflags=NO_WINDOW)
        except Exception as e:
            _append_log(log_path, f"{label} -- FAILED to launch bash.exe: {e}")
            set_dot(button, DOT_RED)
            log_state['status'] = 'failed to launch'
            refresh_log_header()
            return False

        button.config(text=running_text, state='disabled')
        started = time.time()
        blink = {'on': True}

        def poll():
            rc = proc.poll()
            if rc is None:
                blink['on'] = not blink['on']
                set_dot(button, DOT_ORANGE if blink['on'] else DOT_DIM)
                if log_state['label'] == label:
                    mins, secs = divmod(int(time.time() - started), 60)
                    log_state['status'] = f"running {mins}:{secs:02d}"
                    refresh_log_header()
                button.after(700, poll)
                return
            mins, secs = divmod(int(time.time() - started), 60)
            ok = rc == 0
            mark = '\u2713' if ok else '\u2717'
            verdict = 'finished' if ok else 'FAILED'
            _append_log(log_path, f"{mark} {label} {verdict} (exit {rc}, {mins}:{secs:02d})")
            set_dot(button, DOT_GREEN if ok else DOT_RED)
            button.config(text=idle_text, state='normal', fg=FG_LINK)
            if log_state['label'] == label:
                log_state['status'] = (f"done in {mins}:{secs:02d}" if ok
                                        else f"FAILED (exit {rc}) after {mins}:{secs:02d}")
                refresh_log_header()
                log_state['last_text'] = None
                tail_log()

        set_dot(button, DOT_ORANGE)
        button.after(700, poll)
        return True

    def make_local_action(button, running_text, idle_text, command, log_path):
        button.config(command=lambda: start_tracked(button, idle_text, running_text, idle_text, command, log_path))

    make_local_action(pull_btn, "Pulling...", "Pull", "git pull --rebase origin main", ACTIONS_LOG)
    make_local_action(push_btn, "Pushing...", "Push", "git push origin main", ACTIONS_LOG)
    make_local_action(lex_btn, "Syncing...", "Lexicon", "./lexicon-sync.sh", ACTIONS_LOG)
    make_local_action(stu_btn, "Syncing...", "Studio", "./studio-sync.sh", ACTIONS_LOG)
    make_local_action(
        locks_btn, "Clearing...", "Locks",
        "find .git -maxdepth 4 -iname '*.lock' -not -path '*/objects/*' -mmin +1 -print -delete",
        ACTIONS_LOG,
    )

    def catchup_command(target):
        remote = f"sudo -n bash -c 'cd {target['rrepo']} && ./lexicon-sync.sh'"
        return (f"ssh -o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=no "
                f"{target['host_alias']} \"{remote}\"")

    catchup_btn.config(command=lambda: start_tracked(
        catchup_btn, "Catch Up", "Syncing...", "Catch Up",
        catchup_command(get_prod_ssh_target()), ACTIONS_LOG))

    def make_armed_action(button, idle_text, log_path, label, build_command_fn, running_text):
        state = {'armed': False, 'timer_id': None}

        def disarm():
            state['armed'] = False
            button.config(text=idle_text, fg=FG_LINK)
            state['timer_id'] = None

        def on_click():
            if not state['armed']:
                state['armed'] = True
                button.config(text="Confirm?", fg=FG_WARN)
                if state['timer_id']:
                    button.after_cancel(state['timer_id'])
                state['timer_id'] = button.after(4000, disarm)
                return
            if state['timer_id']:
                button.after_cancel(state['timer_id'])
                state['timer_id'] = None
            state['armed'] = False
            button.config(fg=FG_WARN)
            if not start_tracked(button, idle_text, running_text, label,
                                 build_command_fn(get_prod_ssh_target()), log_path):
                button.config(text=idle_text, fg=FG_LINK)

        button.config(command=on_click)

    def deploy_command(target):
        remote = f"sudo -n bash -c 'cd {target['rrepo']} && ./deploy-blue-green.sh'"
        return (f"ssh -o BatchMode=yes -o ConnectTimeout=15 -o ControlMaster=no "
                f"{target['host_alias']} \"{remote}\"")

    def rebake_command(target):
        # scripts/rebake.sh: rebuild surface-index.db, push corpus.db only if
        # local is newer than prod's, push surface-index.db, blue/green deploy.
        return "bash scripts/rebake.sh"

    make_armed_action(deploy_btn, "Deploy", DEPLOY_LOG, "Deploy", deploy_command, "Deploying...")
    make_armed_action(rebake_btn, "Rebake", REBAKE_LOG, "Rebake", rebake_command, "Rebaking...")

    def on_logs():
        try:
            os.startfile(USERPROFILE)
        except Exception as e:
            log_line(f"Logs -- failed to open {USERPROFILE}: {e}")

    logs_btn.config(command=on_logs)

    def on_restart_collector():
        task_name = 'bldbible observability collector'
        pid_file = os.path.join(REPO_ROOT, 'server', '.observability', 'collector.pid')
        restart_btn.config(text="Restarting...", state='disabled')
        root.update_idletasks()

        old_pid = None
        if os.path.isfile(pid_file):
            try:
                raw = open(pid_file, 'r', encoding='utf-8').read().strip()
                if raw.isdigit():
                    old_pid = int(raw)
            except Exception:
                pass

        killed_old = True
        if old_pid and pid_alive(old_pid):
            try:
                subprocess.run(['taskkill', '/PID', str(old_pid), '/T', '/F'],
                                capture_output=True, creationflags=NO_WINDOW)
            except Exception:
                pass
            time.sleep(0.5)
            killed_old = not pid_alive(old_pid)

        try:
            subprocess.run(['schtasks', '/Run', '/TN', task_name],
                            check=True, capture_output=True, creationflags=NO_WINDOW)
        except Exception as e:
            restart_btn.config(text="Restart", state='normal')
            autofix_label.config(text=f"Restart failed: could not start '{task_name}' ({e})")
            return

        new_pid = None
        for _ in range(20):
            time.sleep(0.5)
            if not os.path.isfile(pid_file):
                continue
            try:
                raw = open(pid_file, 'r', encoding='utf-8').read().strip()
            except Exception:
                continue
            if not raw.isdigit():
                continue
            candidate = int(raw)
            if candidate != old_pid and pid_alive(candidate):
                new_pid = candidate
                break

        restart_btn.config(state='normal')
        if new_pid:
            restart_btn.config(text=f"Restarted!")
            autofix_label.config(text="")
        elif not killed_old:
            restart_btn.config(text="Restart")
            autofix_label.config(text=f"pid {old_pid} wouldn't die -- try an elevated shell, or the task may need 'Run with highest privileges'")
        else:
            restart_btn.config(text="Restart")
            autofix_label.config(text="Started, but no new pid showed up in 10s -- check ~\\observability.log")
        restart_btn.after(3000, lambda: restart_btn.config(text="Restart"))

    restart_btn.config(command=on_restart_collector)

    # ── System tray icon ────────────────────────────────────────────
    def show_widget():
        root.deiconify()
        root.lift()
        root.attributes('-topmost', True)

    try:
        tray_image = Image.open(ICON_PATH)
    except Exception:
        tray_image = Image.new('RGB', (32, 32), color=(40, 90, 40))

    def on_tray_open(icon, item):
        root.after(0, show_widget)

    def on_tray_exit(icon, item):
        icon.stop()
        root.after(0, root.destroy)

    tray_menu = pystray.Menu(
        pystray.MenuItem('Open', on_tray_open, default=True),
        pystray.MenuItem('Exit', on_tray_exit),
    )
    tray_icon = pystray.Icon('paleo-studio-observability', tray_image, 'Paleo Studio observability', tray_menu)
    threading.Thread(target=tray_icon.run, daemon=True).start()

    set_waiting("Loading...")
    root.after(200, update_widget)
    log_line(f"started successfully, pid {os.getpid()}")
    root.mainloop()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        tb = traceback.format_exc()
        log_line("FATAL, unhandled exception:\n" + tb)
        try:
            _r = tk.Tk()
            _r.withdraw()
            messagebox.showerror("Paleo Studio observability", f"Crashed on startup:\n{tb}\n\nSee {WIDGET_LOG}")
        except Exception:
            pass
        sys.exit(1)
