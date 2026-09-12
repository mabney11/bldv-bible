# Quotation-mark proofread of the whole reading corpus

Scanned 152 books, 2571 chapters, 68211 verses of translation.db (local copy, synced from prod) through the Reader's quote parser **with the new paragraph re-opener logic** (Reader.jsx, 2026-09-12). 2361 WEB paragraph re-openers are now absorbed automatically and need no edit. What is left below is what the parser cannot resolve by itself — these are the real proofreading items.

## Legend

- **UNCLOSED** — a quote opens and never closes before the chapter ends, and the next chapter does NOT start with a re-opener. Either the closing mark is missing in the text (add it in the Studio) or the speech really runs into the next chapter without WEB re-opening it (then wrap the whole speech in `<…>` brackets, which are allowed to cross chapters).
- **CARRY** — opens in one chapter, next chapter starts with a re-opener: a genuine cross-chapter speech. Renders correctly as two blocks (the first shows the 'unclosed' left border). Fix only if you want one continuous block: replace the pair with `<…>`.
- **DISSOLVED** — a straight-quoted span longer than 600 characters that closes mid-verse, so the parser cannot trust the pairing and renders both marks as literal characters. Usually correct data; convert to curly `“ ”` (or `<…>`) to get the indented block.
- **STRAY** — a closing/opening glyph left over in the text with nothing to pair to (a `”`/`"` with no opener, a `‘` that never closes, etc.). Almost always a scrape defect: delete or pair it.

Totals: UNCLOSED 134 · CARRY 78 · DISSOLVED 49 · STRAY 75

## Books with no quotation marks at all

These sources arrived with quotes stripped (or never had them). Direct speech renders as plain narrative here; a pass with `<…>` markers (or a re-ingest from a source that keeps its quotes) is the only fix:

Philemon, 2 John, 3 John, 1 Maccabees, Sirach, Wisdom, Tobit, Judith, Baruch, 2 Maccabees, Susanna, Bel and the Dragon, 1 Esdras, Psalms of Solomon, Prayer of Manasseh, Testament of Reuben, Testament of Simeon, Testament of Levi, Testament of Judah, Testament of Issachar, Testament of Zebulun, Testament of Dan, Testament of Naphtali, Testament of Gad, Testament of Asher, Testament of Joseph, Testament of Benjamin, Apocalypse of Peter, History of the Rechabites, Odes of Solomon, 2 Enoch, 3 Baruch, 2 Esdras / 4 Ezra, Five Psalms of David, Testament of Kohath, Book of Nathan the Prophet, Words of Azariah, Epistle of Barnabas, Shepherd of Hermas I, Shepherd of Hermas II, Shepherd of Hermas III, Greek Esther, Acts of Paul and Thecla, Third Corinthians, Gospel of Peter, Acts of Barnabas, Life of Flavius Josephus, Against Apion, The Jewish War

## Per-book findings

### Genesis  (1534 verses, 592 quotes, 13 re-openers absorbed)

- UNCLOSED straight d1 24:65 → 24:67: `She amar (spoke) to the ibad (servant), "Who is the ayash (man / husband) who is halak (move) in the shadah (f…`
- DISSOLVED 859 chars 24:27 → 24:30: `He amar (spoke), "barak (blessed) be Yahawah (), the Alahayam () of my adawan (master / lo…`
- DISSOLVED 657 chars 24:51 → 24:54: `Behold, Rabaqah (Rebekah) is panayam (face) you. Laqach (take / seize) her, and yalak (go)…`
- DISSOLVED 783 chars 24:60 → 24:65: `They barak (blessed) Rabaqah (Rebekah), and amar (spoke) to her, "Our achawath (sister), m…`

### Exodus  (1218 verses, 301 quotes, 91 re-openers absorbed)

- UNCLOSED straight d1 8:32 → 8:32: `Paraih (Pharaoh) said, "I will shalach (send) you go, that you may sacrifice to Yahawah () your Alahayam () in…`
- CARRY straight 20:22 → 20:26 (continues in the next chapter)
- UNCLOSED straight d1 21:1 → 21:37: `"Now these are the mashapatayam (ordinances) which you shall shawam (place / establish / appoint) panayam (fac…`
- CARRY straight 22:4 → 22:31 (continues in the next chapter)
- CARRY straight 25:2 → 25:40 (continues in the next chapter)
- CARRY straight 26:1 → 26:37 (continues in the next chapter)
- CARRY straight 27:1 → 27:21 (continues in the next chapter)
- CARRY straight 28:1 → 28:43 (continues in the next chapter)
- CARRY straight 29:1 → 29:46 (continues in the next chapter)
- CARRY straight 35:30 → 35:35 (continues in the next chapter)
- DISSOLVED 659 chars 3:15 → 3:16: `Alahayam () amar (spoke) moreover to Mashah (Moses), "You shall amar (spoke) the banay (so…`

### Leviticus  (866 verses, 98 quotes, 365 re-openers absorbed)

- CARRY straight 1:2 → 1:17 (continues in the next chapter)
- CARRY curly1 1:2 → 1:17 (continues in the next chapter)
- CARRY straight 2:1 → 2:16 (continues in the next chapter)
- CARRY curly1 2:11 → 2:16 (continues in the next chapter)
- CARRY straight 4:2 → 4:35 (continues in the next chapter)
- CARRY curly1 4:2 → 4:35 (continues in the next chapter)
- CARRY straight 6:18 → 6:30 (continues in the next chapter)
- UNCLOSED straight d1 19:2 → 19:37: `"Dabar (word / matter) to all the idah (congregation) of the banay (children) of Yashar-Al (Israel), and amar …`
- UNCLOSED curly1 d2 19:2 → 19:37: `"Dabar (word / matter) to all the idah (congregation) of the banay (children) of Yashar-Al (Israel), and amar …`
- UNCLOSED curly1 d1 23:10 → 23:44: `Dabar (speak on these matters) to the ban (son) of Yashar-Al (Yashar-Al/(Israel)), and amar (say) to them, ‘Wh…`
- CARRY straight 25:2 → 25:55 (continues in the next chapter)
- CARRY curly1 25:2 → 25:55 (continues in the next chapter)

### Numbers  (1304 verses, 229 quotes, 128 re-openers absorbed)

- UNCLOSED straight d1 16:47 → 16:50: `The children of Yashar-Al (Israel) dabar (word / matter) to Mashah (Moses), dabar (word / matter), "Behold, we…`
- CARRY straight 28:2 → 28:31 (continues in the next chapter)
- CARRY curly1 28:3 → 28:31 (continues in the next chapter)
- UNCLOSED straight d1 29:40 → 29:40: `Mashah (Moses) amar (spoke) to the heads of the tribes of the ban (son) of Yashar-Al (Israel), amar (spoke), "…`
- DISSOLVED 1470 chars 16:37 → 16:45: `"Amar (spoke) to the ban (son) of Yashar-Al (Israel), and rawam (will lift up) of them rod…`

### 1 Samuel  (812 verses, 414 quotes, 15 re-openers absorbed)

- UNCLOSED straight d1 23:29 → 23:29: `It happened, when Shaawal (Saul) was yashab (inhabit/dwell) from following the Palashath (Philistines), that i…`

### 2 Samuel  (696 verses, 322 quotes, 2 re-openers absorbed)

- UNCLOSED straight d1 18:33 → 18:33: `It was amar (spoke) Yawaab (Joab), "Behold, the malak (king) bakah (weeps) and bakah (mourns) for Abayashalawa…`

### 2 Kings  (720 verses, 351 quotes, 4 re-openers absorbed)

- UNCLOSED straight d1 2:23 → 2:25: `He ilah (go up / offer) up from there to Bayath-Al (Bethel). As he was ilah (go up / offer) up by the darak (w…`
- STRAY at 22:16: `Thus amar (spoke) Yahawah (), ‘Behold, I will bawaa (come) rai (evil) on this ma`
- UNCLOSED straight d1 22:20 → 22:20: `‘Therefore, behold, I will asap (gather) you to your ab (father), and you shall be asap (gathered) to your qab…`

### 2 Chronicles  (824 verses, 153 quotes, 22 re-openers absorbed)

- STRAY at 34:24: `Thus amar (spoke) Yahawah (), ‘Behold, I will bawaa (come) rai (evil) on this ma`
- UNCLOSED straight d1 34:28 → 34:33: `"Behold, I will asap (gather) you to your ab (father), and you shall be asap (gathered) to your qabar (grave /…`
- DISSOLVED 723 chars 18:18 → 18:20: `Mayakah (Micaiah) amar (spoke), "Therefore shamai (hearken / hear) the dabar (word / matte…`

### Nehemiah  (412 verses, 54 quotes, 10 re-openers absorbed)

- UNCLOSED straight d1 9:5 → 9:38: `Then the Lawayay (Levites), Yashawai (Jeshua), and Qadamayaal (Kadmiel), Banay (Bani), Chashabanayah (Hashabne…`
- UNCLOSED straight d1 10:1 → 10:40: `Yet for all this, we karath (cut) a amanah (sure) covenant, and kathab (write) it; and our shar (prince / rule…`

### Job  (1078 verses, 121 quotes, 99 re-openers absorbed)

- CARRY straight 4:2 → 4:21 (continues in the next chapter)
- CARRY straight 6:2 → 6:30 (continues in the next chapter)
- CARRY straight 9:2 → 9:35 (continues in the next chapter)
- CARRY straight 12:2 → 12:25 (continues in the next chapter)
- CARRY straight 13:1 → 13:28 (continues in the next chapter)
- CARRY straight 16:2 → 16:22 (continues in the next chapter)
- CARRY straight 23:2 → 23:17 (continues in the next chapter)
- CARRY straight 27:2 → 27:23 (continues in the next chapter)
- CARRY straight 29:2 → 29:25 (continues in the next chapter)
- CARRY straight 30:1 → 30:31 (continues in the next chapter)
- CARRY straight 32:6 → 32:22 (continues in the next chapter)
- CARRY straight 36:2 → 36:33 (continues in the next chapter)
- CARRY straight 38:2 → 38:41 (continues in the next chapter)
- UNCLOSED straight d1 40:7 → 40:32: `"Now brace yourself like a man. I will question you, and you will answer me.…`

### Psalms  (2462 verses, 129 quotes, 2 re-openers absorbed)

- DISSOLVED 655 chars 110:1 → 110:4: `Yahawah () naam (declares prophetically) to my Adawan (Master), "yashab (dwell) at my yama…`

### Isaiah  (1293 verses, 323 quotes, 37 re-openers absorbed)

- UNCLOSED straight d1 7:3 → 7:25: `Then Yahawah () amar (spoke) to Yashaiyah (Isaiah), "yatzaa (go out / come out) out now to qaraah (meet) Achaz…`
- UNCLOSED curly1 d2 7:4 → 7:25: `Amar (spoke) him, ‘Be careful, and keep calm. Don't be yaraa (fear / be afraid), neither let your heart be rak…`
- UNCLOSED straight d3 7:25 → 7:25: `All the harayam (hills) that were cultivated with the hoe, you shall not bawaa (come) there for yaraah (fear) …`
- CARRY straight 41:22 → 41:29 (continues in the next chapter)
- CARRY straight 46:3 → 46:13 (continues in the next chapter)
- CARRY straight 47:5 → 47:15 (continues in the next chapter)
- STRAY at 57:11: `Of whom have you been daag (afraid) and in yaraa (fear / be afraid), that you ka`
- UNCLOSED straight d1 63:11 → 63:19: `Then he zakar (remember) the yamay (days) of iwalam (forever), Mashah (Moses) and his im (nation / people), sa…`
- DISSOLVED 812 chars 58:1 → 58:3: `"Qaraa (called) garawan (aloud), don't chashak (darkness), rawam (will lift up) up your qa…`
- DISSOLVED 988 chars 58:6 → 58:9: `"Isn't this the tzawam (fast) that I have bachar (chosen): to release the bonds of rashai …`

### Jeremiah  (1365 verses, 109 quotes, 20 re-openers absorbed)

- CARRY straight 5:29 → 5:31 (continues in the next chapter)
- UNCLOSED straight d1 7:2 → 7:34: `"Imad (stand) in the shair (gate) of Yahawah () bayath (house), and qaraa (called) there this dabar (word / ma…`
- UNCLOSED curly1 d2 7:2 → 7:34: `"Imad (stand) in the shair (gate) of Yahawah () bayath (house), and qaraa (called) there this dabar (word / ma…`
- UNCLOSED straight d1 11:19 → 11:23: `But I was like a gentle kabash (lamb) that is yabal (led) to the tabach (slaughter); and I didn't yadai (know)…`
- UNCLOSED straight d1 30:17 → 30:24: `For I will ilah (go up / offer) arawakah (health) to you, and I will rapaa (heal) you of your makah (wounds), …`
- UNCLOSED straight d1 31:3 → 31:40: `Yahawah () raah (see) of rachawaq (old) to me, saying, "Yes, I have ahab (love) you with an iwalam (forever) a…`
- UNCLOSED straight d1 49:4 → 49:39: `Why do you glory in the imaqayam (valleys), your zawab (flow) imaq (valley), shawabab (backsliding) banath (da…`
- UNCLOSED straight d1 51:14 → 51:64: `Yahawah () of tzabaawath (armies) has shabai (swear / take oath) by himself, saying, "Surely I will malaa (fil…`

### Lamentations  (154 verses, 1 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 2:15 → 2:22: `Ibar (pass over/through) that pass by sapaq (clap) their kapayam (hands) at you. They sharaq (hiss) and nawai …`

### Ezekiel  (1278 verses, 11 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 16:44 → 16:63: `Behold, everyone who uses mashal (speak in proverb/parable) shall use this mashal (speak in proverb/parable) a…`
- UNCLOSED straight d1 27:32 → 27:36: `In their nay (wailing) they shall nashaa (lift) up a qayanah (lamentation) for you, and qawan (lament) over yo…`
- UNCLOSED straight d1 36:7 → 36:38: `Therefore thus amar (spoke) the Adanay () Yahawah (): I have yad (hand), saying, "Surely the gawayam (nations)…`

### Daniel  (361 verses, 8 quotes, 0 re-openers absorbed)

- CARRY straight 11:1 → 11:45 (continues in the next chapter)
- DISSOLVED 1682 chars 6:6 → 6:13: `Then these men said, "We shall not shakach (find) any ilah (occasion) il (over) qabal (thi…`

### Hosea  (201 verses, 45 quotes, 9 re-openers absorbed)

- UNCLOSED straight d1 1:9 → 1:11: `He amar (spoke), "qaraa (called) his sham (name) laaimay (lo-ammi); for you are not my im (nation / people), a…`
- CARRY straight 4:1 → 4:19 (continues in the next chapter)
- UNCLOSED straight d1 6:4 → 6:11: `"Aparayam (Ephraim), what shall I ishah (make) to you? Yahawadah (Judah), what shall I ishah (make) to you? Fo…`
- CARRY straight 7:11 → 7:16 (continues in the next chapter)
- CARRY straight 10:9 → 10:15 (continues in the next chapter)
- UNCLOSED straight d1 12:10 → 12:15: `"But I am Yahawah () your Alahayam () from the land of Matzarayam (Egypt). I will yet again ishar (make) you d…`
- UNCLOSED straight d1 13:14 → 13:16: `I will padah (ransom) them from the yad (hand) of shaawal (Sheol / afterlife). I will gaal (redeem) them from …`

### Joel  (73 verses, 12 quotes, 1 re-openers absorbed)

- CARRY straight 2:23 → 2:27 (continues in the next chapter)
- CARRY straight 3:1 → 3:5 (continues in the next chapter)

### Zechariah  (215 verses, 117 quotes, 4 re-openers absorbed)

- UNCLOSED curly1 d1 1:21 → 1:21: `And amar (spoke) to him, "bawaa (come), amar (spoke) to alah (these) young man, amar (spoke), ‘Yarawashalam (J…`
- CARRY straight 12:4 → 12:14 (continues in the next chapter)

### Malachi  (61 verses, 50 quotes, 1 re-openers absorbed)

- CARRY straight 2:16 → 2:17 (continues in the next chapter)
- UNCLOSED straight d1 4:4 → 4:6: `"Zakar (remembrance/memory) the thawarah (instruction) of Mashah (Moses) my ibad (servant), which I tzawah (co…`

### Matthew  (1071 verses, 448 quotes, 78 re-openers absorbed)

- CARRY curly2 5:3 → 5:48 (continues in the next chapter)
- CARRY curly2 6:1 → 6:34 (continues in the next chapter)
- STRAY at 13:28: ` “The ibad (servants) baqash (asked) him, `
- CARRY curly2 19:28 → 19:30 (continues in the next chapter)
- STRAY at 20:7: ` “He amar (said) to them, `
- CARRY curly2 24:4 → 24:51 (continues in the next chapter)

### John  (879 verses, 437 quotes, 11 re-openers absorbed)

- CARRY curly2 9:41 → 9:41 (continues in the next chapter)
- CARRY curly2 13:38 → 13:38 (continues in the next chapter)
- CARRY curly2 14:23 → 14:31 (continues in the next chapter)
- CARRY curly2 15:1 → 15:27 (continues in the next chapter)

### Acts  (1007 verses, 268 quotes, 27 re-openers absorbed)

- STRAY at 10:4: `Your palal (prayers) and your mathanah (gifts) to the abayawan (needy) have gone`
- STRAY at 26:15: ` “He amar (said), `

### Revelation  (404 verses, 98 quotes, 12 re-openers absorbed)

- CARRY curly2 1:17 → 1:20 (continues in the next chapter)
- CARRY curly2 2:1 → 2:29 (continues in the next chapter)
- STRAY at 2:1: `To the malaak (angel) of the qahal (assembly) in Ephesus kathab (write): “He who`
- STRAY at 2:8: `To the malaak (angel) of the qahal (assembly) in Smyrna kathab (write): “The raa`
- STRAY at 2:12: `To the malaak (angel) of the qahal (assembly) in Pergamum kathab (write): “He wh`
- STRAY at 2:18: `To the malaak (angel) of the qahal (assembly) in Thyatira kathab (write): “The S`
- STRAY at 3:1: `And to the malaak (angel) of the qahal (assembly) in Sardis kathab (write): “He `
- STRAY at 3:7: `To the malaak (angel) of the qahal (assembly) in Philadelphia kathab (write): “H`
- STRAY at 3:14: `To the malaak (angel) of the qahal (assembly) in Laodicea kathab (write): “The A`

### 1 Enoch  (1034 verses, 21 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 16:4 → 16:4: `Amar (Say) to them therefore: "You have no shalawam (peace)."'…`

### Jasher  (3910 verses, 2 quotes, 0 re-openers absorbed)

- UNCLOSED bracket d1 76:62 → 91:17: `And he gawai (died) with terror and with shame, and his ban (son) Adikam () malak (reigned) in his sabayab (pl…`

### 1 Adam and Eve  (920 verses, 252 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 22:6 → 22:6: `Then Alahayam () amar (said) again to Adam (), "Because you have imad (endured) yaraa (fear) and trembling in …`
- UNCLOSED straight d1 30:8 → 30:10: `Then Alahayam () amar (said) to the malaakayam (angels), "Tabal (Dip) them in the spring of mayam (water); the…`
- UNCLOSED straight d1 32:6 → 32:8: `And I will go to another sabayab (place), and go down into it, and do hamah (like) you."…`
- UNCLOSED straight d1 42:9 → 42:13: `Yahawah () amar (said) again to Adam (), "O Adam (), when you were in the gan (garden), these trials ishah (di…`
- UNCLOSED straight d1 50:7 → 50:7: `Then came the Word of Alahayam () and amar (said) to him, "O Adam (), take Chawah () and come to the shapah (s…`
- UNCLOSED straight d1 53:4 → 53:8: `And Alahayam () amar (said) to Adam (), "O Adam (), what do you chaqar (seek) on the western border? And why h…`
- UNCLOSED straight d1 70:17 → 70:17: `Then Shatan (Satan) amar (said) to him, "Chazaw (Look), it is now some time since you came out of the gan (gar…`
- UNCLOSED straight d1 72:24 → 72:24: `Then again, O Alahayam (), if You gazarah (separate) us from each other, the shaiyar (devils) will deceive us …`
- UNCLOSED straight d1 74:10 → 74:10: `And Chawah () amar (said), "We will make achad (one) ilah (offering) for the raashawan (first)-yalayaday (born…`
- DISSOLVED 833 chars 74:2 → 74:3: `Then she amar (said) to Adam (), "The athawath (signs) sabayab (placed) in this mairah (ca…`
- DISSOLVED 2218 chars 78:16 → 78:26: `Then on the achar (next) baqar (morning) Adam () amar (said) to Qayan () his ban (son), "T…`

### 2 Adam and Eve  (322 verses, 82 quotes, 45 re-openers absorbed)

- UNCLOSED straight d1 7:2 → 7:10: `So Adam () amar (said) to his ban (son) Shath (), "I wish, 0 my ban (son), that you wed your achawath (sister)…`
- UNCLOSED straight d1 13:12 → 13:18: `Then Lamak () and the bachawaray (young) raih (shepherd) came up to him, and asham (found) him kadabah (lying)…`
- DISSOLVED 940 chars 20:15 → 20:18: `Meanwhile the tap (children) of Shath (), who were on the Holy Mountain, matzalaa (prayed)…`

### Joseph and Asenath  (211 verses, 136 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 13:8 → 13:8: `For who among matham (men) begat or will ever beget such beauty? or who else is such as he, chakayamay (wise) …`

### Testament of Isaac  (97 verses, 13 quotes, 0 re-openers absorbed)

- STRAY at 6:3: `My banay (sons) and ach (brothers), the Alahayam () of my ab (father) Abaraham (`
- STRAY at 6:4: `Keep your bashar (body) qadash (holy), for the hayakal (temple) of Alahayam () i`

### Testament of Jacob  (78 verses, 32 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 3:2 → 3:10: `The malaak (angel) amar (said) to him, "Do not be yaraa (afraid), Yaiqab (): I am the malaak (angel) who has b…`
- UNCLOSED curly1 d2 3:5 → 3:10: `Barak (Blessed) are you too, Yaiqab (), for you mashawar (saw) Alahayam () panayam (face) to panayam (face) an…`
- UNCLOSED straight d3 3:10 → 3:10: `So now, yahab (give) your tzawah (commands) to your banay (sons), and shalawam (peace) be with you; for I am a…`
- UNCLOSED straight d1 4:4 → 4:6: `And Yaiqab () amar (said) to them, "Do not be yaraa (afraid), for Alahayam () raah (appeared) to me in Aram (M…`

### Testament of Job  (324 verses, 88 quotes, 4 re-openers absorbed)

- UNCLOSED straight d1 1:28 → 1:29: `Whereupon, my tap (children), I replied: "I shall from ahab (love) of Alahayam () imad (endure) until mawath (…`
- UNCLOSED straight d1 2:15 → 2:17: `And I replied: "Do what you chamadahath (desire) to do and accomplish whatever you plot. For I am ithawad (rea…`
- UNCLOSED straight d1 3:33 → 3:37: `For they would qalalah (curse) and amar (say): "Oh that we had of his bashar (flesh) that we could be shabai (…`
- UNCLOSED straight d1 4:28 → 4:28: `And I qarai (tore) my labash (clothes) and dabar (said): Yahawah () has dabar (given), Yahawah () has asap (ta…`
- UNCLOSED straight d1 5:22 → 5:24: `And so after having pondered over the malah (matter), she amar (said) to him: "Qawam (Rise) and chatzab (cut) …`
- UNCLOSED straight d1 6:19 → 6:31: `But I replied to her: "Hanah (Behold) I have been for these shabai (seven) shanahayan (years) dabar (plague)-s…`
- UNCLOSED curly1 d2 6:20 → 6:31: `And as to the dabar (word) which you amar (say): ‘Amar (Speak) some dabar (word) against Alahayam () and mawat…`
- UNCLOSED straight d3 6:29 → 6:31: `Thus athah (you), O Ayawab (), art matah (beneath) and nagai (stricken) with nagai (plague) and chawal (pain),…`
- UNCLOSED straight d1 7:37 → 7:39: `My kasaa (throne) hayah (exists) in the chay (life) of the "qadash (holy) tap (ones)" and its kabawad (glory) …`
- STRAY at 9:2: `‘Remember`
- STRAY at 9:8: `‘Do not go to the trouble in habal (vain); for my tap (children) will not be ash`
- STRAY at 9:12: `‘Iyan (Look) with your iyan (eyes) to the Mazarach (East).`
- STRAY at 9:14: `‘Ithah (Now) I yadai (know) that my memory qawam (remains) with Yahawah ().`
- UNCLOSED straight d1 12:12 → 12:19: `"Ay (Woe) to us, for today has been thamak (taken) from us the kach (strength) of the rapah (feeble), the awar…`
- DISSOLVED 1217 chars 1:2 → 1:11: `"Form a circle around me, tap (children), and shamai (hear), and I shall relate to you wha…`
- DISSOLVED 1188 chars 3:15 → 3:21: `"We matzalaa (pray) you, since we also can malaa (fill) this amawanah (office) of waiters …`
- DISSOLVED 6252 chars 7:7 → 7:37: `"If of us shalawash (three) malakayam (kings) all our maqanah (possessions) would be bawaa…`
- DISSOLVED 1055 chars 9:4 → 9:9: `But she baqash (asked) him amar (saying): "I baqash (ask) as chan (favor) of you, my Lords…`
- DISSOLVED 1670 chars 9:11 → 9:19: `But I inah (said) to ham (them): "Ilah (Raise) me that I may qawayam (stand) up," and they…`
- DISSOLVED 1125 chars 10:4 → 10:9: `"For", amar (said) he, "so rababah (many) yawam (days) ishah (did) you gadal (pass), allow…`
- DISSOLVED 985 chars 10:13 → 10:19: `And Alayapaz () chasharay (spoke) thus: "Nashaa (Taken) off is the iwan (sin) and our inju…`

### Testament of Solomon  (129 verses, 215 quotes, 2 re-openers absorbed)

- UNCLOSED straight d1 1:129 → 1:130: `And when I amar (answered) that I would on no account shachah (worship) zawar (strange) gods, they amar (told)…`
- DISSOLVED 839 chars 1:25 → 1:26: `And I amar (said) to him: "Have you nothing else about you, Asmodeus?" And he amar (answer…`
- DISSOLVED 806 chars 1:32 → 1:32: `And I Shalamah (), having shamai (heard) this, charapahath (rebuked) him, and amar (said):…`
- DISSOLVED 703 chars 1:33 → 1:34: `But [the demon] amar (answered) me: "I am the rawach (spirit) of the ashes (Tephras)." And…`
- DISSOLVED 1310 chars 1:49 → 1:50: `And I Shalamah (), on mashamai (hearing) this, sadar (ordered) my ibad (servant) to shayam…`
- DISSOLVED 626 chars 1:52 → 1:54: `So I amar (said) to him: "I adjure you in the sham (name) of the Alahayam () Tzabaawath (S…`
- DISSOLVED 987 chars 1:59 → 1:60: `When I Shalamah () shamai (heard) this, I marvelled at her maraah (appearance), for I behe…`
- DISSOLVED 629 chars 1:71 → 1:72: `And he amar (said): "My dawaaray (dwelling) is in parah (fruitful) shamamaw (places), but …`
- DISSOLVED 2612 chars 1:106 → 1:110: `The thirty-shashay (sixth) amar (said): "I am asharaw (called) Bianakith. I have a grudge …`
- DISSOLVED 664 chars 1:127 → 1:128: `I, therefore, Shalamah (), having shamai (heard) this, hadarath (glorified) Alahayam () an…`

### Apocalypse of Abraham  (299 verses, 93 quotes, 2 re-openers absorbed)

- STRAY at 6:6: `O ab (father) Tharach (), whichever of these you halal (praise) as a god, you ar`
- STRAY at 12:8: `All these slaughter, and divide the animals into halves, achad (one) against the`
- STRAY at 13:4: `What do you, Abaraham (), upon the qadash (holy) Heights, where no adam (man) la`
- UNCLOSED curly2 d1 14:3 → 14:9: `And he amar (said): “Yawadain (Know) from yasap (henceforth) that the Eternal One has bachawaray (chosen) you,…`
- UNCLOSED curly1 d2 14:6 → 14:9: `Amar (Say) to him: ‘Be you the qatar (burning) coal of the Furnace of the aratz (earth); go, Azazel, into the …`
- STRAY at 20:4: `When can I? For I am but an adam (man) of ipar (dust) and ashes. And he amar (sa`
- STRAY at 22:2: `This is my will with regard to those who exist in the (divine) thabal (world)-it`
- CARRY curly2 22:5 → 22:7 (continues in the next chapter)
- UNCLOSED curly2 d1 26:5 → 26:6: `And He amar (said) to me: “Shamai (Hear), Abaraham (). As the itzah (counsel) of your ab (father) is in him, a…`
- UNCLOSED curly2 d1 28:1 → 28:2: `And I amar (answered) and amar (said): “O Mighty, Eternal One, hallowed by Your kach (power)! Be favourable to…`
- STRAY at 28:1: `O Mighty, Eternal One, hallowed by Your kach (power)! Be favourable to my shaala`
- UNCLOSED curly2 d1 29:8 → 29:15: `And He amar (answered) and amar (said): “Shamai (Hear), Abaraham ()! The adam (man) whom you mashawar (saw) in…`
- STRAY at 29:11: `Before the Age of the tzadayaq (righteous) chalal (begins) to grow, my judgement`
- CARRY curly2 30:2 → 30:8 (continues in the next chapter)
- UNCLOSED curly2 d1 32:1 → 32:3: `“Therefore shamai (hear), O Abaraham (), and raah (see); lo! your shabayaiy (seventh) dawar (generation) shall…`

### Ascension of Isaiah  (295 verses, 65 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 1:13 → 1:13: `And Yashaiyah () amar (said) to Chazaqayah (): "The Beloved has made of bal (none) effect your design, and the…`
- UNCLOSED straight d1 8:28 → 8:28: `And when I heard (that) I was sair (troubled), and he amar (said): "Do not be sair (troubled)."…`
- DISSOLVED 782 chars 1:5 → 1:7: `And he malat (delivered) to him the kathab (written) dabaray (words) which Samnas the scri…`
- DISSOLVED 933 chars 7:12 → 7:16: `And he amar (said) to me: "So has it been since this thabal (world) was made until now, an…`
- DISSOLVED 974 chars 7:17 → 7:21: `And he amar (said) to me: "(it is sent) to the halal (praise) of (Him who sits in) the sha…`
- DISSOLVED 708 chars 7:22 → 7:25: `For above all the shamayam (heavens) and their malaakayam (angels) has your kasaa (throne)…`
- DISSOLVED 2042 chars 8:14 → 8:25: `And he amar (said): "Shamai (Hear), furthermore, therefore, this also from your raiyah (fe…`
- DISSOLVED 1182 chars 10:8 → 10:13: `"Go forth and descent through all the shamayam (heavens), and you will descent to the firm…`

### Apocalypse of Elijah  (163 verses, 34 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 4:31 → 4:33: `And they will gird on the chashan (breastplate) of Yahawah (), and they will rawatz (run) to Yarawashalam () a…`
- DISSOLVED 1980 chars 4:16 → 4:27: `As the dabaray (words) were inah (spoken), they prevailed over him, amar (saying), "Furthe…`

### Jannes and Jambres  (48 verses, 12 quotes, 0 re-openers absorbed)

- UNCLOSED curly2 d1 1:36 → 1:48: `The napash (soul) of Jannes amar (said) to his ach (brother), “I your ach (brother) ishah (did) not mawath (di…`

### Genesis Apocryphon  (106 verses, 25 quotes, 0 re-openers absorbed)

- STRAY at 1:7: `O my adawanay (master) and [ach (brother), recall for yourself] my pregnancy. I `
- STRAY at 1:23: `a his banath (daughter) I took as my ayashah (wife). I impregnated her and she y`
- STRAY at 1:70: `Tell me your chalawam (dream) that I might know (it), and so I chalal (began) to`
- STRAY at 1:97: ` the malak (king) of Sadam () and with Barashai‘ the malak (king) of Imarah () a`
- UNCLOSED curly1 d1 1:106 → 1:106: `Abaram () amar (said): ‘My Yahawah () Alahayam ()! I have marabah (much) hawan (wealth) and maqanah (possessio…`

### Words of Gad the Seer  (371 verses, 120 quotes, 3 re-openers absorbed)

- UNCLOSED curly2 d1 2:2 → 2:29: `“Shayam (Set) your panayam (face) eastward, northward, southward, and westward.…`
- STRAY at 2:3: `Four corners of the aratz (earth), shamai (listen) to the Word of Yahawah (). Th`
- STRAY at 3:2: ` Deuteronomy The ibad (servant) amar (answered): “Is it not it tzadaa (true) tha`
- STRAY at 3:8: `I have shamai (heard) your palal (prayer), so amar (tell) the Mawaabay (Moabite)`
- UNCLOSED curly2 d1 5:3 → 5:10: `And Yahawah () amar (said) to Gad (): “Go and amar (tell) Dawad (David) My ibad (servant): ‘Do not be worried …`
- UNCLOSED curly1 d2 5:3 → 5:10: `And Yahawah () amar (said) to Gad (): “Go and amar (tell) Dawad (David) My ibad (servant): ‘Do not be worried …`
- STRAY at 5:3: `Do not be worried about these iral (uncircumcised) Palashathay (Philistines), be`
- STRAY at 6:2: `Thus amar (says) Yahawah (): ‘Let not the gabawar (mighty) adam (man) kabawad (g`
- UNCLOSED curly2 d1 7:11 → 7:35: `“Thus amar (said) Yahawah (): ‘I am the Malak (King) of Yashar-Al (Israel), and I am their chalaq (portion). I…`
- UNCLOSED curly1 d2 7:11 → 7:35: `“Thus amar (said) Yahawah (): ‘I am the Malak (King) of Yashar-Al (Israel), and I am their chalaq (portion). I…`
- STRAY at 7:11: `I am the Malak (King) of Yashar-Al (Israel), and I am their chalaq (portion). I `
- STRAY at 7:15: `Go and amar (say) to Dawad (David): ‘Thus amar (says) Yahawah (): ‘I zabach (off`
- STRAY at 9:4: `Reverence Yahawah (), creator of shamayam (heaven) and ash (fire), the yam (sea)`
- STRAY at 9:17: ` Variant of Numbers And who is hamah (like) Yahawah (), Alahayam () above all go`
- STRAY at 13:58: `I was chay (living) in my ach (brother) Abayashalawam’s home, disgraced because `
- STRAY at 14:22: `  And we cannot chaqar (seek) your shalawam (peace) nor your prosperity; but how`

### 2 Baruch  (694 verses, 67 quotes, 2 re-openers absorbed)

- UNCLOSED straight d1 6:10 → 6:10: `And the aratz (earth) pathach (opened) its pah (mouth) and balai (swallowed) them up."…`
- UNCLOSED straight d1 10:2 → 10:19: `"Galah (Tell) Yaramayah () to go and imad (confirm) the captivity of the im (people) to Babal ().…`
- UNCLOSED straight d1 13:12 → 13:12: `For I have iwalam (always) benefited athah (you), and you have iwalam (always) been kachash (denied) the benef…`
- UNCLOSED straight d1 23:2 → 23:7: `And He dabar (answered) and dabar (said) to me: "Dan () therefore are you bahal (troubled) about that which yo…`
- UNCLOSED straight d1 24:2 → 24:4: `For it will hayah (come) to chalapawan (pass) at that time that athah (you) shall raah (see) - and the rab (ma…`
- UNCLOSED straight d1 29:1 → 29:8: `And He inah (answered) and amar (said) to me: "Whatever will then befall will belong the kal (whole) aratz (ea…`
- UNCLOSED straight d1 30:5 → 30:5: `For they will yadai (know) that their torment has nagai (come) and their perdition has arrived."…`
- UNCLOSED straight d1 31:3 → 31:5: `And I inah (answered) and amar (said) to them: "Shamai (Hear), O Yashar-Al (Israel), and I will dabar (speak) …`
- CARRY straight 32:7 → 32:9 (continues in the next chapter)
- UNCLOSED straight d1 33:3 → 33:3: `And now if you also izab (forsake) us, it were tawab (good) for us all to mawath (die) before you, and then th…`
- UNCLOSED straight d1 35:2 → 35:5: `"Hawaa (Become) you mabawai (springs), O mine iyan (eyes), and you, mine ipaip (eyelids), a fount of damaih (t…`
- UNCLOSED straight d1 39:1 → 39:8: `And He inah (answered) and amar (said) to me: "This is the pashar (interpretation) of the maraah (vision) whic…`
- UNCLOSED straight d1 40:4 → 40:4: `This is your maraah (vision), and this is its pashar (interpretation)."…`
- UNCLOSED straight d1 42:8 → 42:8: `And the ipar (dust) will be qaraa (called), and there will be amar (said) to it: "Yahab (Give) shakam (back) t…`
- UNCLOSED straight d1 43:3 → 43:3: `Go therefore and tzawah (command) your im (people), and bawaa (come) to this maqawam (place), and afterwards t…`
- UNCLOSED straight d1 45:2 → 45:2: `For if you alap (teach) them, you will quicken them."…`
- CARRY straight 50:1 → 50:4 (continues in the next chapter)
- CARRY straight 57:1 → 57:3 (continues in the next chapter)
- CARRY straight 58:1 → 58:2 (continues in the next chapter)
- CARRY straight 59:1 → 59:12 (continues in the next chapter)
- CARRY straight 60:1 → 60:2 (continues in the next chapter)
- CARRY straight 61:1 → 61:8 (continues in the next chapter)
- CARRY straight 62:1 → 62:8 (continues in the next chapter)
- CARRY straight 63:1 → 63:11 (continues in the next chapter)
- UNCLOSED straight d1 64:7 → 64:10: `On this account Manashah () was at that time sham (named) "the impious", and finally his abode was in the ash …`
- CARRY straight 66:1 → 66:8 (continues in the next chapter)
- CARRY straight 67:1 → 67:9 (continues in the next chapter)
- CARRY straight 68:1 → 68:9 (continues in the next chapter)
- UNCLOSED straight d1 69:1 → 69:5: `"For the acharawan (last) mayam (waters) which you have raah (seen) which were darker than all that were befor…`
- CARRY straight 71:1 → 71:3 (continues in the next chapter)
- CARRY straight 72:1 → 72:6 (continues in the next chapter)
- UNCLOSED straight d1 73:1 → 73:7: `"And it will hayah (come) to chalapawan (pass), when He has shawab (brought) shapal (low) everything that is i…`
- UNCLOSED straight d1 74:4 → 74:4: `This is the maawar (bright) baraq (lightning) which came after the acharawan (last) dark mayam (waters)."…`
- DISSOLVED 610 chars 6:6 → 6:8: `For I am raashawan (first) shalach (sent) to nagad (speak) a dabar (word) to the aratz (ea…`
- DISSOLVED 1579 chars 42:2 → 42:8: `"These amar (things) also will I chawah (show) to you. As for what you ishah (did) amar (s…`
- DISSOLVED 1469 chars 64:1 → 64:7: `"And the black thashayaiy (ninth) mayam (waters) which you have raah (seen), this is all t…`

### Visions of Amram  (11 verses, 7 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 1:11 → 1:11: `[The malaak (angel) amar (said)], "This message is from the bayath (house) of Paraih (Pharaoh)."…`

### Apocryphon of Joshua  (205 verses, 1 quotes, 0 re-openers absorbed)

- UNCLOSED curly1 d1 21:2 → 21:18: `[... to] Beqa‘an and to Bet Tzapawar (), to…`
- STRAY at 21:2: `an and to Bet Tzapawar (), to [... and] they smote all the valley of Mitzpah, to`

### Balaam Inscription  (27 verses, 4 quotes, 0 re-openers absorbed)

- UNCLOSED straight d1 2:15 → 2:17: `"The quest of a malak (king) hawaa (becomes) his moth (rot), And the quest of ... ... and ... chazayam (seers)…`

### Gospel of Philip  (118 verses, 112 quotes, 1 re-openers absorbed)

- DISSOLVED 2076 chars 1:92 → 1:95: `The Adanay () amar (said) [it] baar (well): "Some went to the mamalakah (kingdom) of shama…`
- DISSOLVED 2694 chars 1:95 → 1:101: `A sawas (horse) begets a sawas (horse), a human begets a human, and a god begets god. It's…`
- DISSOLVED 613 chars 1:101 → 1:101: `Whoever yawadain (knows) the amath (truth) is a nadayab (free) adam (person), and the nada…`
- DISSOLVED 6624 chars 1:101 → 1:108: `Whoever yawadain (knows) the amath (truth) is a nadayab (free) adam (person), and the nada…`
- DISSOLVED 3092 chars 1:108 → 1:112: `There's the ban (Son) of Humanity, and there's the ban (son) of the ban (Son) of Humanity.…`
- DISSOLVED 1514 chars 1:112 → 1:112: `[Most (things)] of [the] thabal (world) can qawayam (stand) up and chayay (live) as mathay…`

### Pistis Sophia I  (297 verses, 162 quotes, 448 re-openers absorbed)

- CARRY straight 6:3 → 6:4 (continues in the next chapter)
- UNCLOSED straight d1 9:1 → 9:1: `It came to chalapawan (pass) then, when Yashawai () had kalaa (finished) amar (saying) these dabar (words) to …`
- UNCLOSED straight d1 10:1 → 10:10: `The raz (mystery) of the chamash (five) dabar (words) on the vesture. "It came to chalapawan (pass) then, when…`
- UNCLOSED straight d1 11:1 → 11:4: `Yashawai () puts on his vesture. "It came to chalapawan (pass) then, when I mashawar (saw) the raz (mystery) o…`
- UNCLOSED straight d1 12:1 → 12:3: `He nachath (enters) the raashawan (first) sphere. "And I shamaawalay (left) that napah (region) acharay (behin…`
- UNCLOSED straight d1 13:1 → 13:2: `He nachath (enters) the shanay (second) sphere. "And I shamaawalay (left) that napah (region) acharay (behind)…`
- UNCLOSED straight d1 14:1 → 14:4: `He nachath (enters) the aeons. "And I shamaawalay (left) that napah (region) acharay (behind) me and ascended …`
- CARRY straight 15:1 → 15:5 (continues in the next chapter)
- CARRY straight 25:1 → 25:4 (continues in the next chapter)
- CARRY straight 26:1 → 26:4 (continues in the next chapter)
- UNCLOSED straight d1 28:1 → 28:4: `The kach (powers) adore the awar (light)-vesture. And Yashawai () achar (continued) again in his discourse and…`
- UNCLOSED straight d1 30:2 → 30:6: `Sophia chamadahath (desires) to nachath (enter) the awar (Light)-thabal (world). And Yashawai () amar (answere…`
- CARRY straight 31:1 → 31:3 (continues in the next chapter)
- UNCLOSED straight d1 50:8 → 50:8: `to your goodness. Now, therefore, O awar (Light) of maawar (lights), let them not take away my awar (light) fr…`
- CARRY straight 53:4 → 53:4 (continues in the next chapter)
- UNCLOSED straight d1 55:2 → 55:2: `The twelfth nacham (repentance) of Sophia. "'1. O awar (Light), shakach (forget) not my halal (praise)-singing…`
- DISSOLVED 622 chars 33:3 → 33:4: `Marayam () again came halaah (forward) and amar (said): "My Adanay (), my indweller of awa…`

### Pistis Sophia II  (541 verses, 114 quotes, 465 re-openers absorbed)

- UNCLOSED straight d1 2:4 → 2:4: `When then the raashawan (First) raz (Mystery) amar (said) this to the lamawad (disciples), that it had befalle…`
- CARRY straight 13:1 → 13:4 (continues in the next chapter)
- CARRY straight 14:9 → 14:10 (continues in the next chapter)
- UNCLOSED straight d1 15:3 → 15:3: `Sophia again sings a shayar (song) to the awar (Light). "'1. O awar (Light) of maawar (lights), I have had ama…`
- UNCLOSED straight d1 33:1 → 33:41: `It came to chalapawan (pass) then, when Yashawai () had shamai (heard) Marayam () amar (say) these dabar (word…`

### Pistis Sophia III  (242 verses, 76 quotes, 119 re-openers absorbed)

- UNCLOSED straight d1 18:8 → 18:8: `chashak (darkness) and abad (perish) and be Nawan-existent for ever."…`
- UNCLOSED straight d1 24:11 → 24:14: `Marayam () pathar (interprets) the same. When then the mawashai (Saviour) had amar (said) this, Marayam () sta…`
- DISSOLVED 969 chars 18:2 → 18:3: `Of such initiated who chataah (sin) and mawath (die) without nacham (repentance). The mawa…`

### Secret Book of John  (283 verses, 51 quotes, 1 re-openers absorbed)

- UNCLOSED straight d1 1:4 → 1:283: `The Pharisee amar (said), "That Nazarene misled you (plural), amar (told) you thaan (lies), closed your lab (h…`
- STRAY at 1:4: `That Nazarene misled you (plural), amar (told) you thaan (lies), closed your lab`
- STRAY at 1:7: ` He didn't alap (teach) us about the acharayath (latter).” All of a sudden, whil`
- STRAY at 1:227: `Adanay (), what about the napash (souls) who didn’t do these things haa (even) t`
- STRAY at 1:234: `Adanay (), how ishah (does) the napash (soul) shrink down so as to be able to na`

### Book of Melchizedek  (599 verses, 81 quotes, 25 re-openers absorbed)

- UNCLOSED curly2 d1 5:2 → 5:15: `– “This liberation that is concretized today, represents the liberation that I have to operate in the acharaya…`
- STRAY at 5:2: `- Aware of the historical importance of that yawam (day) of liberation, I took a`
- STRAY at 7:16: `Thus amar (says) Yahawah (): Observe the yamanay (right) and practice mashapat (`
- STRAY at 7:16: `There is no’doubt, I do not chalapawan (pass) a dry ayalan (tree) “; - Thus amar`
- UNCLOSED curly2 d1 7:16 → 7:18: `“Thus amar (says) Yahawah (): Observe the yamanay (right) and practice mashapat (justice), because my yashawai…`
- UNCLOSED curly2 d1 9:26 → 9:28: `“achad (One) is for you and the other is for your ban (son) Yatzachaq (). –…`
- UNCLOSED curly2 d1 19:29 → 19:34: `“Yarawashalam (), Shalam (), from here I will have in your zarawai (arms) a yaqar (precious) scepter that, in …`
- UNCLOSED curly2 d1 26:16 → 26:17: `The Creator, who at nashay (every) step galahaa (revealed) to the malaakayam (angels) the raz (mysteries) of H…`
- STRAY at 26:16: `All the
ganazay (treasures) of the awar (light) will be paqach (open) to your da`
- STRAY at 27:10: `Paqach (Seeing) that the time of the test was bawaa (coming), and that Lucifer w`
- STRAY at 27:22: `My tap (children), my tap (children)! I can no iwad (longer) asharaw (call) you `
- STRAY at 27:22: ` After lamenting the downfall of the marad (rebel) hosts, the
Eternal, in arak (`
- STRAY at 28:3: `Hanah (Behold), everything is very tawab (good).” Exuberant, the planet
sawapath`
- STRAY at 28:4: ` Immediately, the space hawaa (became) radiant
due to the brightness of the sham`
- UNCLOSED straight d1 28:12 → 28:32: `achad (One) admired the qawamah (tall) ayalan (trees) that, soaked by the breeze, shamaawalay (left) abundant …`
- STRAY at 28:14: ` Adam () was happy to shamai (hear) from the Creator that awamar (promise), just`
- STRAY at 28:16: ` After mahalak (walking) in the chalawam (dream) through the meadows of paradise`
- UNCLOSED curly2 d2 28:30 → 28:32: `The inevitable result of that step would be iwalam (eternal) mawath (death), not only for the human being, but…`
- STRAY at 29:42: `The hosts, surprised at the
revelation of the Eternal, darash (inquired) into th`
- UNCLOSED straight d1 29:48 → 29:54: `The Eternal, gaishaw (moved) by infinite ahab (love), chalal (began) to ishah (follow) in the footsteps of the…`
- STRAY at 29:48: `Adam (), where are you?” His qawal (voice), qal (sounding) in the chashak (darkn`
- UNCLOSED curly2 d1 30:11 → 30:51: `thabawan (Understanding) the meaning of the tremendous zabach (sacrifice), they prostrated themselves at His r…`
- UNCLOSED straight d2 30:11 → 30:51: `thabawan (Understanding) the meaning of the tremendous zabach (sacrifice), they prostrated themselves at His r…`
- STRAY at 30:11: ` I will mawath (die) instead of
you. – Given this confirmation, the couple zawaq`
- UNCLOSED curly2 d3 30:11 → 30:51: `thabawan (Understanding) the meaning of the tremendous zabach (sacrifice), they prostrated themselves at His r…`
- UNCLOSED straight d4 30:16 → 30:51: `The couple was trembling on the panayam (face) of the ayab (enemy), but Yahawah’s protective yad (hands) shath…`
- STRAY at 30:16: `The human being
belongs to me, because I maqanah (bought) it with my dam (blood)`
- UNCLOSED curly2 d5 30:19 → 30:51: `Shawab (Turning) to the eastern tzad (side), the couple, in a mixture of pain and nostalgia, contemplated in t…`
- STRAY at 30:20: `After amar (saying) these dabar (words), Yahawah () tzawah (commanded) the coupl`
- STRAY at 30:23: `After nacham (comforting) the couple with these awamar (promises), the Creator, `
- STRAY at 31:21: `Eva, surprised, chazaw (looked) at his ban (son), without hashathakachath (findi`
- STRAY at 31:22: ` – Eager to raah (see) the yawam (day) that
would never qatzath (end), zaiyar (l`
- STRAY at 31:29: `Haa (Even) if
everyone maas (rejects) me, I will atzalathay (keep) the awamar (p`
- STRAY at 31:31: `This paradise is not as rachayaqayan (far)
away as Dad and Mom affirm. Dan () ar`
- STRAY at 31:41: `it is the thabal (world) that natzaa (flees) from him. He is rai (sad) with
that`
- DISSOLVED 9581 chars 28:3 → 28:12: `While with admiration the hosts contemplated the beauties of that creation, they were surp…`
- DISSOLVED 1294 chars 31:48 → 31:48: `That undeserved chan (grace), the thabawaahath (fruit) of qasam (divine) ahab (love), woul…`

### Antiquities of the Jews  (7376 verses, 14 quotes, 0 re-openers absorbed)

- STRAY at 1:96: `his chamah (wrath); that matham (men) might be permitted to go on cheerfully in `
- STRAY at 6:32: `filthy lucre of mathanah (gifts) and shachad (bribes), and made their determinat`
- STRAY at 7:96: `the nahar (river) Parath (), he shachath (destroyed) twenty thousand of his foot`
- STRAY at 16:31: `. Is there any achad (one) that can chamadahath (desire) to make chasar (void) t`
- STRAY at 16:293: `hapak (make) an apology for him; and when they hayah (came) again, he shawab (se`
- UNCLOSED curly1 d1 19:299 → 19:366: `When the malak (king) had settled the gadawal (high) kahanah (priesthood) after this dabar (manner), he thayab…`
- STRAY at 19:299: `that it was not done with their ayash (consent), but by the chamas (violence) of`
