#!/usr/bin/env python3
"""
export-bible-pdf.py — build a print-ready PDF of your Novel English Bible.

It pulls the SAME English that powers the novel reader (/api/translate/chapter)
for every book in /api/book-order and lays it out as a clean single-column
reader's Bible: title page, a real table of contents with page numbers, each
book opening on its own page, chapters flowing as prose with small superscript
verse numbers, running heads, and page numbers. PDF bookmarks (outline) are
added for every book and chapter so it's navigable on screen too.

The output is a normal PDF that Lulu / IngramSpark / 48 Hour Books / offset
printers all accept. Fonts are embedded, so it prints consistently anywhere.

Usage (run on the machine where the app is running):

    python export-bible-pdf.py                          # http://localhost:3000 -> novel-english-bible.pdf
    python export-bible-pdf.py --base-url http://localhost:3000 --out bible.pdf
    python export-bible-pdf.py --trim 6x9 --font "C:/Fonts/EBGaramond-Regular.ttf" \
                               --font-bold "C:/Fonts/EBGaramond-Bold.ttf"
    python export-bible-pdf.py --only-status done       # only verses you've marked done
    python export-bible-pdf.py --demo                    # sample PDF, no server needed

Margins default to a symmetric, binding-safe layout. For a specific printer,
pass --inside / --outside / --top / --bottom to match their template exactly
(POD services publish a template for your trim size + page count).

Nothing on the server is modified; this only reads the API.
"""
import argparse, json, sys, time, urllib.request, urllib.parse, urllib.error, html
from concurrent.futures import ThreadPoolExecutor, as_completed

from reportlab.lib.units import inch
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph,
                                Spacer, PageBreak, NextPageTemplate, FrameBreak)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── trim sizes (width x height, inches) ─────────────────────────────────────
TRIM = {
    "5x8":     (5.0, 8.0),
    "5.5x8.5": (5.5, 8.5),
    "6x9":     (6.0, 9.0),      # default — the standard trade / reader's-Bible size
    "5.06x7.81": (5.06, 7.81),  # a common compact-Bible trim
    "7x10":    (7.0, 10.0),     # roomier 2-column; bigger font at the same page count
    "8x10":    (8.0, 10.0),
    "letter":  (8.5, 11.0),
}

ACCENT = "#8a6a1f"   # ink-gold used for verse numbers + chapter numbers


# ── data ────────────────────────────────────────────────────────────────────
def log(*a):
    # flush immediately — Git Bash / MINGW64 block-buffers stdout, which makes a
    # working run look frozen.
    print(*a, flush=True)


def get_json(base, path, timeout=30):
    url = base.rstrip("/") + path
    req = urllib.request.Request(url, headers={
        "ngrok-skip-browser-warning": "1",
        "User-Agent": "novel-bible-export/1.0",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def fetch_bible(base, only_status=None, workers=4, book_filter=None):
    """Return [ {name, id, chapters: [ {chapter, verses:[{verse,text}]} ] } ]."""
    # 1) book list — first request doubles as a connectivity check.
    log(f"→ contacting {base} …")
    t0 = time.time()
    try:
        books = get_json(base, "/api/book-order", timeout=15)
    except urllib.error.URLError as e:
        sys.exit(f"\n✗ Couldn't reach {base}/api/book-order ({e.reason}).\n"
                 f"  Is the app running, and is --base-url correct? "
                 f"(the app usually serves on http://localhost:3000)")
    if not isinstance(books, list):
        sys.exit("unexpected /api/book-order response")

    if book_filter:
        want = {int(x) for x in book_filter}
        books = [b for b in books if int(b.get("id") or b.get("book_id") or 0) in want]

    # 2) flat list of (book, chapter) jobs
    jobs = []
    meta = {}
    for b in books:
        bid = b.get("id") or b.get("book_id") or b.get("canon_id")
        meta[bid] = {"name": b.get("name") or f"Book {bid}", "order": len(meta)}
        first = int(b.get("first") or 1)
        last = int(b.get("last") or first)
        for ch in range(first, last + 1):
            jobs.append((bid, ch))
    total = len(jobs)
    log(f"✓ {len(books)} books · {total} chapters to fetch · {workers} workers\n")

    # 3) fetch chapters concurrently, with a live one-line progress counter
    results = {}   # (bid, ch) -> [verses]
    done = 0

    def fetch_chapter(bid, ch):
        try:
            data = get_json(base, f"/api/translate/chapter?book={bid}&chapter={ch}", timeout=30)
        except Exception:
            return None   # request failed
        vs = []
        for v in (data.get("verses") or []):
            txt = (v.get("text") or "").strip()
            if not txt:
                continue
            if only_status and (v.get("status") or "not_started") != only_status:
                continue
            vs.append({"verse": v.get("verse"), "text": txt})
        return vs

    def grab(job):
        bid, ch = job
        return job, (fetch_chapter(bid, ch) or [])

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for fut in as_completed(ex.submit(grab, j) for j in jobs):
            job, vs = fut.result()
            results[job] = vs
            done += 1
            if done % 5 == 0 or done == total:
                pct = 100 * done // total if total else 100
                print(f"\r  fetched {done}/{total} chapters ({pct}%) · {time.time()-t0:0.0f}s",
                      end="", flush=True)
    print(flush=True)

    # 4) assemble in book order
    def bid_of(b):
        return b.get("id") or b.get("book_id") or b.get("canon_id")

    out_by_id = {}
    for b in books:
        bid = bid_of(b)
        first = int(b.get("first") or 1)
        last = int(b.get("last") or first)
        chapters = [{"chapter": ch, "verses": results[(bid, ch)]}
                    for ch in range(first, last + 1) if results.get((bid, ch))]
        if chapters:
            out_by_id[bid] = {"name": meta[bid]["name"], "id": bid, "chapters": chapters}

    # 5) recover empties — book-order's chapter range can be blank/wrong (which is
    #    why a book gets skipped), so scan its chapters directly until text stops.
    empty_ids = [bid_of(b) for b in books if bid_of(b) not in out_by_id]
    recovered = []
    if empty_ids:
        log(f"  re-probing {len(empty_ids)} empty book(s) for a mismatched chapter range…")

        def probe(bid):
            chapters, empties, ch = [], 0, 1
            while ch <= 300 and empties < 6:
                vs = fetch_chapter(bid, ch)
                if vs:
                    chapters.append({"chapter": ch, "verses": vs}); empties = 0
                else:
                    empties += 1
                ch += 1
            return chapters

        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for bid, chs in zip(empty_ids, ex.map(probe, empty_ids)):
                if chs:
                    out_by_id[bid] = {"name": meta[bid]["name"], "id": bid, "chapters": chs}
                    recovered.append(meta[bid]["name"])

    out = [out_by_id[bid_of(b)] for b in books if bid_of(b) in out_by_id]  # book order
    still_empty = [meta[bid_of(b)]["name"] for b in books if bid_of(b) not in out_by_id]

    log(f"✓ collected {sum(len(c['verses']) for b in out for c in b['chapters'])} verses "
        f"across {len(out)} books in {time.time()-t0:0.0f}s")
    if recovered:
        log(f"↻ recovered {len(recovered)} book(s) by re-probing: " + ", ".join(recovered))
    if still_empty:
        log(f"⚠ {len(still_empty)} book(s) truly have no English text (nothing to print): "
            + ", ".join(still_empty))
    return out


def demo_bible():
    lorem = ("In the beginning Alahayam created the Shamayam and the Aratz. "
             "And the Aratz was without form and void, and darkness was upon the "
             "face of the depths, and the Rawach of Alahayam moved upon the waters. ")
    def verses(n):
        return [{"verse": i + 1, "text": (lorem * (1 + i % 3)).strip()} for i in range(n)]
    return [
        {"name": "BaRaashayath (Genesis)", "id": 1,
         "chapters": [{"chapter": c, "verses": verses(8 + c)} for c in range(1, 6)]},
        {"name": "Shamayath (Exodus)", "id": 2,
         "chapters": [{"chapter": c, "verses": verses(10)} for c in range(1, 4)]},
        {"name": "Yachanan (John)", "id": 43,
         "chapters": [{"chapter": c, "verses": verses(12)} for c in range(1, 3)]},
    ]


# ── document ────────────────────────────────────────────────────────────────
class BibleDoc(BaseDocTemplate):
    def __init__(self, filename, styles, **kw):
        BaseDocTemplate.__init__(self, filename, **kw)
        self.styles = styles
        self.cur_book = ""

    def handle_documentBegin(self):
        # multiBuild runs several passes on one doc instance; clear the running
        # head each pass so the front matter never inherits the last book's name.
        self.cur_book = ""
        BaseDocTemplate.handle_documentBegin(self)

    def afterFlowable(self, flowable):
        style = getattr(flowable, "style", None)
        name = getattr(style, "name", "")
        if name == "BookTitle":
            text = flowable.getPlainText()
            self.cur_book = text
            self.notify("TOCEntry", (0, text, self.page))
            key = f"bk::{self.page}::{text}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=0, closed=True)
        elif name == "ChapterNum":
            text = flowable.getPlainText()
            key = f"ch::{self.page}::{self.cur_book}::{text}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(f"{self.cur_book} {text}", key, level=1, closed=True)


def make_decorator(width, height, top, bottom, font, title_short):
    """Drawn at onPageEnd so cur_book reflects any book that opened on this page."""
    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFont(font, 8.5)
        canvas.setFillColor("#666666")
        pn = canvas.getPageNumber()
        # footer: page number, centered
        canvas.drawCentredString(width / 2.0, bottom * 0.55, str(pn))
        # running head: book name centered; title on the outer edge
        if doc.cur_book:
            canvas.setFont(font, 8.5)
            canvas.setFillColor("#8a8a8a")
            canvas.drawCentredString(width / 2.0, height - top * 0.5, doc.cur_book)
        canvas.restoreState()
    return decorate


def esc(s):
    return html.escape(s, quote=False)


def chapter_html(ch, meta, run_in):
    """A chapter as one flowing paragraph. run_in=True gives the traditional Bible
    look: a big chapter numeral leads the text, verse 1 unnumbered, verses 2+ as
    small superscripts. run_in=False keeps every verse numbered."""
    vsize = max(6, int(meta["size"] * 0.6))
    out = []
    for i, v in enumerate(ch["verses"]):
        vt = esc(v["text"]); vn = esc(str(v["verse"]))
        if i == 0 and run_in:
            lead = (f'<font name="{meta["font_bold"]}" size={max(11, int(meta["size"]*1.7))} '
                    f'color="{ACCENT}">{ch["chapter"]}</font>&nbsp;&nbsp;')
            out.append(lead + vt)
        else:
            out.append(f'<super><font size={vsize} color="{ACCENT}">{vn}</font></super>&nbsp;{vt}')
    return " ".join(out)


def build(bible, out_path, meta):
    ncols = meta.get("columns") or (2 if meta.get("layout") == "bible" else 1)
    two_col = ncols >= 2   # "multi-column" — banner titles + run-in chapters
    w, h = meta["trim"]
    W, H = w * inch, h * inch
    mi, mo = meta["inside"] * inch, meta["outside"] * inch
    mt, mb = meta["top"] * inch, meta["bottom"] * inch
    reg, bold = meta["font"], meta["font_bold"]
    sz, ld = meta["size"], meta["leading"]

    book_fs = 18 if two_col else 26
    styles = {
        "book": ParagraphStyle("BookTitle", fontName=bold, fontSize=book_fs,
                               leading=book_fs + 4, alignment=TA_CENTER,
                               spaceBefore=(14 if two_col else 60), spaceAfter=6,
                               textColor="#1a1a1a"),
        "book_sub": ParagraphStyle("BookSub", fontName=reg, fontSize=9.5, leading=12,
                                   alignment=TA_CENTER, spaceAfter=(6 if two_col else 26),
                                   textColor=ACCENT),
        "chapter": ParagraphStyle("ChapterNum", fontName=bold, fontSize=17, leading=20,
                                  spaceBefore=16, spaceAfter=6, textColor=ACCENT,
                                  keepWithNext=True),
        "verse": ParagraphStyle("VerseBody", fontName=reg, fontSize=sz, leading=sz * ld,
                                alignment=TA_JUSTIFY, firstLineIndent=0,
                                spaceAfter=(3 if two_col else 2)),
        "title_big": ParagraphStyle("TitleBig", fontName=bold, fontSize=34, leading=40,
                                    alignment=TA_CENTER, textColor="#1a1a1a"),
        "title_sub": ParagraphStyle("TitleSub", fontName=reg, fontSize=13, leading=18,
                                    alignment=TA_CENTER, textColor=ACCENT),
        "title_foot": ParagraphStyle("TitleFoot", fontName=reg, fontSize=9, leading=13,
                                     alignment=TA_CENTER, textColor="#888888"),
        "toc_head": ParagraphStyle("TocHead", fontName=bold, fontSize=18, leading=22,
                                   alignment=TA_CENTER, spaceAfter=18, textColor="#1a1a1a"),
    }

    content_w = W - mi - mo
    content_h = H - mt - mb
    pad = dict(leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_plain = Frame(mi, mb, content_w, content_h, id="plain", **pad)
    deco = make_decorator(W, H, mt, mb, reg, meta["title"])

    templates = [
        PageTemplate(id="title", frames=[frame_plain]),
        PageTemplate(id="front", frames=[frame_plain], onPageEnd=deco),
    ]

    if two_col:
        gutter = (0.18 if ncols >= 3 else 0.26) * inch
        col_w = (content_w - gutter * (ncols - 1)) / ncols
        banner_h = 1.05 * inch
        def col_x(i):
            return mi + i * (col_w + gutter)
        # continuation pages: N full-height columns
        body_frames = [Frame(col_x(i), mb, col_w, content_h, id=f"c{i}", **pad)
                       for i in range(ncols)]
        # a book's opening page: full-width banner on top, N columns below
        open_frames = [Frame(mi, mb + content_h - banner_h, content_w, banner_h, id="ban", **pad)]
        open_frames += [Frame(col_x(i), mb, col_w, content_h - banner_h, id=f"o{i}", **pad)
                        for i in range(ncols)]
        templates += [
            PageTemplate(id="open", frames=open_frames, onPageEnd=deco),
            PageTemplate(id="body", frames=body_frames, onPageEnd=deco),
        ]
    else:
        frame = Frame(mi, mb, content_w, content_h, id="body", **pad)
        templates.append(PageTemplate(id="body", frames=[frame], onPageEnd=deco))

    doc = BibleDoc(out_path, styles, pagesize=(W, H),
                   leftMargin=mi, rightMargin=mo, topMargin=mt, bottomMargin=mb,
                   title=meta["title"], author=meta.get("author") or "")
    doc.addPageTemplates(templates)

    story = []
    # ── title page ────────────────────────────────────────────────────────────
    story.append(Spacer(1, content_h * 0.32))
    story.append(Paragraph(esc(meta["title"]), styles["title_big"]))
    story.append(Spacer(1, 14))
    if meta.get("subtitle"):
        story.append(Paragraph(esc(meta["subtitle"]), styles["title_sub"]))
    story.append(Spacer(1, content_h * 0.30))
    if meta.get("author"):
        story.append(Paragraph(esc(meta["author"]), styles["title_foot"]))

    # ── table of contents ──────────────────────────────────────────────────────
    story.append(NextPageTemplate("front"))
    story.append(PageBreak())
    story.append(Paragraph("Contents", styles["toc_head"]))
    toc = TableOfContents()
    toc.dotsMinLevel = 0
    toc.levelStyles = [ParagraphStyle("TOCBook", fontName=reg, fontSize=11.5, leading=18,
                                      leftIndent=6, rightIndent=20)]
    story.append(toc)

    # ── books ───────────────────────────────────────────────────────────────────
    for b in bible:
        if two_col:
            story.append(NextPageTemplate("open"))
            story.append(PageBreak())
            story.append(Paragraph(esc(b["name"]), styles["book"]))
            story.append(Paragraph("· · ·", styles["book_sub"]))
            story.append(FrameBreak())                 # banner -> first column
            story.append(NextPageTemplate("body"))     # further pages: two columns
            for ch in b["chapters"]:
                story.append(Paragraph(chapter_html(ch, meta, run_in=True), styles["verse"]))
        else:
            story.append(NextPageTemplate("body"))
            story.append(PageBreak())
            story.append(Paragraph(esc(b["name"]), styles["book"]))
            story.append(Paragraph("· · ·", styles["book_sub"]))
            for ch in b["chapters"]:
                story.append(Paragraph(str(ch["chapter"]), styles["chapter"]))
                story.append(Paragraph(chapter_html(ch, meta, run_in=False), styles["verse"]))

    doc.multiBuild(story)
    return doc.page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:3000")
    ap.add_argument("--out", default="novel-english-bible.pdf")
    ap.add_argument("--trim", default=None, choices=list(TRIM.keys()))
    ap.add_argument("--binder", action="store_true",
                    help="preset for printing double-sided and putting it in a ring/post "
                         "binder: Letter pages, two columns, extra inside margin for the "
                         "hole punch. Overrides trim to 'letter' unless you pass --trim.")
    ap.add_argument("--bound", action="store_true",
                    help="preset for a real bound book (sewn/oversewn/perfect): Letter "
                         "pages, two columns, generous gutter on BOTH sides so text clears "
                         "the spine on every page. Overrides trim to 'letter' unless set.")
    ap.add_argument("--sewn", action="store_true",
                    help="preset for a Smyth-sewn 6x9 Bible on thin/lightweight paper "
                         "(offset printer): 6x9, two columns, compact 7.5pt, gutter tuned "
                         "for a sewn spine. The classic single-volume Bible format.")
    ap.add_argument("--paperback", action="store_true",
                    help="preset to fit EVERYTHING into ONE perfect-bound paperback at a "
                         "readable size: 8.5x11, TWO columns, 9pt (~1,150 pages). A big page "
                         "is what lets 2 columns stay under the ~1200-page glue limit. Check "
                         "the printed page count; drop to --size 8.5 if it runs over.")
    ap.add_argument("--columns", type=int, default=None, choices=[1, 2, 3],
                    help="force column count (1, 2, or 3); overrides the layout default")
    ap.add_argument("--title", default="The Novel English Bible")
    ap.add_argument("--subtitle",
                    default="A clean English translation with Hebrew-backed names & places")
    ap.add_argument("--author", default="")
    ap.add_argument("--font", default=None, help="path to a serif TTF (regular)")
    ap.add_argument("--font-bold", default=None, help="path to the bold TTF")
    ap.add_argument("--layout", default="bible", choices=["bible", "reader"],
                    help="'bible' = compact two-column, run-in chapters (fits a single "
                         "volume); 'reader' = roomy single-column like the app (default: bible)")
    ap.add_argument("--size", type=float, default=None, help="body font size (pt)")
    ap.add_argument("--leading", type=float, default=None, help="line-height multiple")
    ap.add_argument("--inside", type=float, default=None, help="inside/gutter margin (in)")
    ap.add_argument("--outside", type=float, default=None, help="outside margin (in)")
    ap.add_argument("--top", type=float, default=None)
    ap.add_argument("--bottom", type=float, default=None)
    ap.add_argument("--only-status", default=None,
                    help="only include verses with this status (e.g. 'done')")
    ap.add_argument("--workers", type=int, default=4,
                    help="parallel chapter fetches (default 4; raise to go faster)")
    ap.add_argument("--books", default=None,
                    help="comma-separated book ids to include, e.g. '1' or '1,2,43' "
                         "(great for a quick test before the full run)")
    ap.add_argument("--demo", action="store_true", help="build a sample PDF, no server")
    args = ap.parse_args()

    # fonts: embed a supplied TTF for print quality, else fall back to Times.
    reg, bold = "Times-Roman", "Times-Bold"
    if args.font:
        pdfmetrics.registerFont(TTFont("BodyFont", args.font))
        reg = "BodyFont"
        if args.font_bold:
            pdfmetrics.registerFont(TTFont("BodyFontB", args.font_bold))
            bold = "BodyFontB"
        else:
            bold = "BodyFont"

    if args.demo:
        log("Building demo PDF (no server)…")
        bible = demo_bible()
    else:
        book_filter = [x.strip() for x in args.books.split(",")] if args.books else None
        bible = fetch_bible(args.base_url, only_status=args.only_status,
                            workers=args.workers, book_filter=book_filter)
        if not bible:
            sys.exit("No text returned — is the app running, and is the base URL right?")

    # Layout-aware defaults (compact for 'bible', roomy for 'reader'); any value
    # the user passed explicitly still wins. --binder tunes for punch-and-bind.
    # Presets. Any value the user passes explicitly still overrides the preset.
    #   binder → Letter, big LEFT gutter for a 3-hole punch
    #   bound  → Letter, generous gutter BOTH sides for an oversewn hardcover
    #   sewn   → 6x9, compact, tuned for an offset Smyth-sewn Bible on thin paper
    PRESETS = {
        "binder": dict(trim="letter", inside=0.95, outside=0.5,  size=8.5),
        "bound":  dict(trim="letter", inside=0.9,  outside=0.9,  size=8.5),
        "sewn":   dict(trim="6x9",    inside=0.62, outside=0.52, size=7.5),
        "paperback": dict(trim="letter", inside=0.85, outside=0.6, size=9.0, columns=2),
    }
    preset = ("binder" if args.binder else "bound" if args.bound
              else "sewn" if args.sewn else "paperback" if args.paperback else None)
    p = PRESETS.get(preset, {})

    d = {"bible":  dict(size=8.6, leading=1.12, inside=0.6, outside=0.5, top=0.62, bottom=0.62),
         "reader": dict(size=10.5, leading=1.34, inside=0.75, outside=0.6, top=0.72, bottom=0.72)}[args.layout]

    def pick(name, base):
        v = getattr(args, name)
        return v if v is not None else p.get(name, base)

    trim = args.trim or p.get("trim", "6x9")
    size = pick("size", d["size"])
    leading = args.leading if args.leading is not None else d["leading"]
    inside = pick("inside", d["inside"])
    outside = pick("outside", d["outside"])
    top = args.top if args.top is not None else d["top"]
    bottom = args.bottom if args.bottom is not None else d["bottom"]
    columns = args.columns or p.get("columns") or (2 if args.layout == "bible" else 1)

    meta = {
        "title": args.title, "subtitle": args.subtitle, "author": args.author,
        "trim": TRIM[trim], "font": reg, "font_bold": bold, "layout": args.layout,
        "size": size, "leading": leading, "columns": columns,
        "inside": inside, "outside": outside, "top": top, "bottom": bottom,
    }
    log("Building PDF…")
    pages = build(bible, args.out, meta)
    nbooks = len(bible)
    nverses = sum(len(c["verses"]) for b in bible for c in b["chapters"])
    log(f"\n✓ {args.out}")
    log(f"  {nbooks} books · {nverses} verses · {pages} pages · {trim} trim"
        + (f" · {preset}-ready" if preset else ""))
    log("  Fonts embedded. Ready to upload to a print service or hand to a bindery.")


if __name__ == "__main__":
    main()
