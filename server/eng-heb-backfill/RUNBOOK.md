# Scheduled run: English -> Hebrew backfill (one slice per run)

Folder on fieldy's machine: C:\Users\fieldy\dev\projects\the-scriptures-app\paleo-studio\server\eng-heb-backfill
(device_bash: $HOME/mnt/paleo-studio/server/eng-heb-backfill). Do NOT ingest anything into corpus.db
(fieldy runs the ingest himself after ALL batches are done).

1. Refresh the to-do list on the device (out/ is the truth, REMAINING.txt is derived):
   python3 -c "import os,glob;d={os.path.basename(f) for f in glob.glob('out/c*.json')};r=sorted(os.path.basename(f) for f in glob.glob('batches/c*.json') if os.path.basename(f) not in d);open('REMAINING.txt','w').write('\n'.join(r)+('\n' if r else ''));print(len(r))"
   If 0 remain: send fieldy one message "Hebrew backfill: all batches done — ready to ingest" and stop.
2. Take the first 24 names in REMAINING.txt (4 groups of 6). On the device, tar these into tmp/slice.tgz
   together with GUIDE.md, check_heb.py, ../geez-heb-backfill/common.py, ../geez-heb-backfill/heb_attested.json,
   and any already-existing out/<name>.json for them; stage it (device_stage_files) and unpack in the
   container as  WORK/eng-heb-backfill/{GUIDE.md,check_heb.py,batches/,out/}  and  WORK/geez-heb-backfill/{common.py,heb_attested.json}.
3. Launch 4 background general-purpose agents, 6 batches each, with this prompt (fill in WORK and the files):
   "Translate English scripture/apocrypha verses into unvocalized biblical Hebrew for a corpus backfill. Working dir:
   WORK/eng-heb-backfill . Read GUIDE.md first and follow it exactly (one hard rule: every Hebrew word must already be
   attested in the corpus; check_heb.py enforces it). Your batches (in batches/): <6 files>. For EACH write
   out/<same name>.json ({"verses": {"<ref>": {"heb": "..."}}, "names": {...}, "notes": {...}}). If out/<file> exists,
   keep its good verses, fill missing refs and fix it. Translate every verse fully; omit nothing, add nothing; use the
   hints when they fit. "The Lord" (God) = יהוה. Work one batch at a time, save it, run `python3 check_heb.py out/<file>`
   and fix every UNATTESTED/MISSING item until it reports `unattested/problem words: 0`. Write only your own files;
   scratch in a /tmp dir named after your first batch. Final reply (short): per file verse count + gate line; names;
   refs whose English was garbled or meaning unsure."
4. While they run, every ~5 minutes: gate each finished out/*.json, tar the PASSING ones and commit the tar to
   tmp/pass_<time>.tgz on the device, then on the device: tar xzf tmp/pass_<time>.tgz -C out --skip-old-files.
   (Use a new tar name each time; the device cannot overwrite or delete files.) Save early, save often:
   the run may be cut off by the usage limit at any moment.
5. If any agent fails with a usage-limit error: stop the others, save what passes (step 4), and end the run.
6. At the end: final save, refresh REMAINING.txt (step 1), append one line to RUNLOG.md
   (date, batches finished, verses, remaining), and send fieldy a 2-line summary. Do not start a second slice.
