# The House of Yahawah — sculpted parts (Meshy shot list)

`/models/temple` draws everything procedurally, so the page is complete without a single file here.
Every part below has a **slot**: drop a GLB with that name into `server/models/` (dev) or
`/mnt/paleo-data/models/` (prod) and the scene swaps the procedural stand-in for it on the next load —
no code change. Instances are cloned from one file (twelve oxen from one `temple-ox.glb`, ten
lampstands from one `temple-lampstand.glb`). The statue's pipeline applies unchanged.

**The frame contract (all slots):** the scene scales the sculpt so its **height** matches the slot's,
stands it on **y = 0**, centres it on x/z, and turns it a quarter so a model that faces **+z in the
file (Meshy's default front, toward the camera in the preview)** faces **+x (east) in the house**.
So: sculpt it upright, front toward you, feet/base at the bottom, nothing else matters.

| slot file | what | how many | height it is scaled to | notes for the sculpt |
|---|---|---|---|---|
| `temple-cherub.glb` | one of the two great karawab of the dabayar (1 Kings 6:23–28) | 2 (the second is mirrored) | 10 amah | standing figure, one wing held straight out to its **left** (to the wall), the other straight out to its **right** (to meet its twin) — both level at the shoulder, each wing as long as the figure is tall ÷ 2 (5 amah). Faces forward. Ezekiel 41:19 gives the carved ones a man's face and a lion's — your call. Gold. |
| `temple-ox.glb` | one ox under the yam (7:25) | 12 | 3.2 amah | standing ox, head forward, tail back (the scene turns three to each quarter, tails inward). Brass. |
| `temple-capital.glb` | the capital of Yakayan / Baiz (7:16–20, 41–42) | 2 | 9 amah (5 bowl + 4 lily) | a bowl (galath) with a **checker net** over it, **seven wreaths of chain**, **two rows of a hundred pomegranates** around the belly, and **lily work flaring out for the top 4 amah**. Round, bottom flat where it sits on the shaft (radius of the shaft ≈ 1.9). Brass. |
| `temple-base.glb` | one makawanah with its basin (7:27–38) | 10 | 3 amah (the frame; the scene keeps its own water disc) | a square cart 4 × 4: corner posts, ledges, **panels with lions, oxen and cherubim, wreaths beneath**, **four chariot wheels** (six spokes) under it, a round socket on top and a bowl 4 across sitting in it. Brass. |
| `temple-lampstand.glb` | one lampstand of the ordinance (7:49; Exodus 25:31–37) | 10 | 3 amah | seven-branched, almond cups and buds, flames optional. Gold. |
| `temple-table.glb` | one table of the show bread (7:48; Exodus 25:23–30) | 10 | 1.6 amah | 2 × 1 table with a rim and border, twelve loaves in two rows. Gold. |
| `temple-ark.glb` | the arawan with its kaparath and two small cherubim (Exodus 25:10–20) | 1 | 2.7 amah | 2½ × 1½ chest, crown moulding, two poles along its **long** side, mercy seat with two cherubim facing each other, wings up. Gold. |
| `temple-throne.glb` | the ivory throne (1 Kings 10:18–20) | 1 | 6 amah | six steps rising to the seat, round back, a lion beside each arm and twelve lions on the steps. Ivory + gold. The scene faces it north, toward the court. |

Meshy, as for the statue (paid plan → owned): **High Detail**, fold the negatives into the prompt,
Generations 2, License Private; **Texture is a separate pass and takes an image** — for colour give it
a photo (polished brass, hammered gold) rather than colour words, which drift.

Prompts you can paste (shape pass):

- **cherub** — "A tall standing winged guardian figure, ancient Near Eastern style, long straight robe to the feet, calm human face looking forward, two great wings held straight out horizontally to the left and right like a T, each wing as long as half the figure's height, feathers in overlapping rows, solid gold, symmetrical, museum statue, no base, no weapons, no halo."
- **ox** — "A standing bull, ancient Near Eastern bronze style, head forward, short horns, muscular neck, straight legs, tail down, smooth cast bronze surface, no base, no saddle, no rider."
- **capital** — "An ancient bronze column capital: a rounded bowl-shaped body covered with a diamond lattice net, seven horizontal chain wreaths, two rows of small pomegranates around its widest part, and a wide lily flower flaring open at the top; flat underside, round, symmetrical, cast bronze, no column shaft."
- **base (makawanah)** — "A square ancient bronze cart 4 wide 4 deep 3 high on four chariot wheels with six spokes: corner posts, upper and lower ledges, relief panels of lions, oxen and winged cherubim with hanging wreaths beneath, a round socket on top holding a wide shallow bowl; cast bronze, no rider, no draught animals."
- **lampstand** — "A seven-branched golden lampstand of hammered gold: a central shaft with three curved branches on each side rising to the same height, almond-blossom cups with buds and flowers, seven small oil lamps on top, a round base; solid gold, symmetrical, no candles."
- **table** — "A small golden table of the ancient Near East, rectangular top twice as long as wide, a raised rim and a decorative border a handbreadth down, four straight legs with rings for poles, twelve round loaves in two stacks of six on top; gold."
- **ark** — "A golden chest 2.5 long 1.5 wide 1.5 high with a crown moulding at top and bottom, two carrying poles through rings along its long sides, and on its lid two small kneeling winged figures at the ends facing each other with wings spread upward toward each other; solid gold, symmetrical."
- **throne** — "An ancient royal throne of ivory overlaid with gold: six broad steps rising to the seat, a rounded back, armrests with a standing lion beside each, and twelve small lions standing on the steps, one at each end of each step; white ivory and gold."

Pipeline (the statue's, per file):

```
gltf-transform simplify in.glb out.glb --ratio 0.035        # ~2M tris → ~70k; use 0.08 for the small pieces
gltf-transform optimize out.glb final.glb --compress meshopt --texture-compress webp --texture-size 1024
cp final.glb server/models/temple-<slot>.glb                 # prod: /mnt/paleo-data/models/
```

Check: `localhost:3000/models/temple?piece=<id>&v=N` — the halo should sit on the sculpt, not on a
stand-in. Missing files are silent (404 → the procedural part stays); a malformed file logs
`[temple] sculpted <slot> not loaded` in the console.
