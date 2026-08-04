#!/usr/bin/env bash
# Download Sefaria's Hebrew apocrypha from the PUBLIC GCS HTTP endpoint.
# No gcloud/gsutil needed — just curl (built into Git Bash). Run from your
# paleo-studio folder. Creates ./json/Apocrypha/<Title>/Hebrew/merged.json
# Then either run ingest_sefaria_heb.py, or zip ./json and send it back.
BASE="https://storage.googleapis.com/sefaria-export/json/Second%20Temple/Apocrypha"
TITLES=(
  "Ben Sira" "Book of Jubilees" "Book of Judith" "Book of Tobit"
  "The Book of Susanna" "The Wisdom of Solomon"
  "The Testaments of the Twelve Patriarchs" "Letter of Aristeas"
  "Prayer of Manasseh" "Psalm 151" "Psalm 154"
  "The Book of Maccabees I" "The Book of Maccabees II"
)
for t in "${TITLES[@]}"; do
  enc=$(printf '%s' "$t" | sed 's/ /%20/g')
  for lang in Hebrew English; do
    out="json/Apocrypha/$t/$lang"
    mkdir -p "$out"
    url="$BASE/$enc/$lang/merged.json"
    if curl -fsS "$url" -o "$out/merged.json" 2>/dev/null; then
      echo "  ok   $t [$lang]"
    else
      rmdir "$out" 2>/dev/null
      echo "  --   $t [$lang] (not available)"
    fi
  done
done
echo "Done. Hebrew files are under ./json/Apocrypha/*/Hebrew/merged.json"
