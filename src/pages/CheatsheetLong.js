// AUTO-EXTRACTED from bhs-token-cheatsheet.html sections 243-1268.
// Edit by re-running the extraction; manual edits will be overwritten.
// Pulled-in CSS lives in CheatsheetLong.css and is namespace-safe enough
// (class names are unique to the cheatsheet's HTML).

export const CHEATSHEET_LONG_HTML = `<section class="section" id="pos">
  <h2>Part-of-speech values</h2>
  <p class="section-sub">What each sp/pdp value means and how the engine handles it</p>

  <table>
    <tr><th>Value</th><th>Name</th><th>Engine behavior</th><th>Example</th></tr>
    <tr><td><span class="tag t-v">verb</span></td><td>Verb</td><td>Full affix stripping: pfm → vbs → prs → uvf → nme → vbe. Root lookup with MUTATED_ROOTS.</td><td>𐤉𐤀𐤌𐤓 "he said"</td></tr>
    <tr><td><span class="tag t-n">subs</span></td><td>Substantive (noun)</td><td>nme + prs + uvf stripping. No pfm/vbs.</td><td>𐤔𐤌𐤉𐤌 "heavens"</td></tr>
    <tr><td><span class="tag t-adj">adjv</span></td><td>Adjective</td><td>Same as subs. pdp=subs is common (adjective used as noun).</td><td>𐤂𐤃𐤅𐤋 "great"</td></tr>
    <tr><td><span class="tag t-p">prep</span></td><td>Preposition</td><td>Standalone block. prs suffix extracted and shown.</td><td>𐤋, 𐤁, 𐤌, 𐤏𐤋</td></tr>
    <tr><td><span class="tag t-p">conj</span></td><td>Conjunction</td><td>Standalone block. Merges with following verb as pending component.</td><td>𐤅 "and"</td></tr>
    <tr><td><span class="tag t-p">art</span></td><td>Article</td><td>Standalone block (𐤄 = The). Sometimes empty word_raw (article is phonologically fused).</td><td>𐤄 "the"</td></tr>
    <tr><td><span class="tag t-n">prps</span></td><td>Personal pronoun</td><td>Treated as noun-like. No stripping.</td><td>𐤄𐤅𐤀 "he", 𐤀𐤍𐤉 "I"</td></tr>
    <tr><td><span class="tag t-n">prde</span></td><td>Demonstrative pronoun</td><td>Treated as noun-like.</td><td>𐤆𐤄 "this", 𐤆𐤀𐤕 "this-f"</td></tr>
    <tr><td><span class="tag t-n">prin</span></td><td>Interrogative pronoun</td><td>Treated as noun-like.</td><td>𐤌𐤄 "what"</td></tr>
    <tr><td><span class="tag t-o">inrg</span></td><td>Interrogative particle</td><td>Standalone.</td><td>𐤄 "?" (interrogative heh)</td></tr>
    <tr><td><span class="tag t-p">nega</span></td><td>Negation particle</td><td>Standalone block.</td><td>𐤋𐤀 "not", 𐤀𐤋 "do not"</td></tr>
    <tr><td><span class="tag t-n">nmpr</span></td><td>Proper noun</td><td>Treated as noun. No root lookup — it IS the name.</td><td>𐤉𐤄𐤅𐤄, 𐤀𐤁𐤓𐤄𐤌</td></tr>
    <tr><td><span class="tag t-o">advb</span></td><td>Adverb</td><td>Standalone. pdp=advb common even for subs used adverbially.</td><td>𐤊𐤍 "thus", 𐤓𐤒 "only"</td></tr>
    <tr><td><span class="tag t-o">intj</span></td><td>Interjection</td><td>Standalone.</td><td>𐤄𐤍𐤄 "behold", 𐤍𐤀 "please"</td></tr>
  </table>
</section>

<!-- ════════════════════════════ VERB FIELDS ════════════════════════════ -->
<section class="section" id="verb-fields">
  <h2>Verbal fields</h2>
  <p class="section-sub">vs (stem) and vt (tense/form) are the two most important fields for identifying what a verb is doing</p>

  <h3>vs — Verbal stem</h3>
  <table>
    <tr><th>Value</th><th>Name</th><th>Meaning</th><th>Paleo signal</th></tr>
    <tr><td class="mono">qal</td><td>Qal (G stem)</td><td>Basic/simple active. The default verb form.</td><td>No prefix marker</td></tr>
    <tr><td class="mono">nif</td><td>Nifal (N stem)</td><td>Passive or reflexive of Qal.</td><td>vbs=N (𐤍 prefix, often assimilated)</td></tr>
    <tr><td class="mono">piel</td><td>Piel (D stem)</td><td>Intensive/factitive active. Often causative for stative roots.</td><td>No prefix; doubled middle radical</td></tr>
    <tr><td class="mono">pual</td><td>Pual (Dp stem)</td><td>Passive of Piel.</td><td>No visible prefix</td></tr>
    <tr><td class="mono">hif</td><td>Hifil (H stem)</td><td>Causative active. "He caused X to happen"</td><td>vbs=H (𐤄 prefix, sometimes contracted)</td></tr>
    <tr><td class="mono">hof</td><td>Hofal (Hp stem)</td><td>Causative passive.</td><td>vbs=H present</td></tr>
    <tr><td class="mono">hit</td><td>Hitpael (tD stem)</td><td>Reflexive/reciprocal intensive.</td><td>vbs=HT or HCT (𐤕 prefix, transposes on sibilants)</td></tr>
    <tr><td class="mono">hsht</td><td>Hishtaphel</td><td>Reflexive causative (rare). BH root 𐤔𐤇𐤄 "bow down".</td><td>vbs=HCT, long prefix 𐤕𐤔𐤕</td></tr>
  </table>

  <h3>vt — Verbal tense / form</h3>
  <table>
    <tr><th>Value</th><th>Name</th><th>When used</th><th>Key feature</th></tr>
    <tr><td class="mono">perf</td><td>Perfect</td><td>Completed action. Subject suffix agrees with subject.</td><td>vbe= encodes subject agreement</td></tr>
    <tr><td class="mono">impf</td><td>Imperfect</td><td>Incomplete/habitual action. Person prefix + subject.</td><td>pfm= encodes prefix</td></tr>
    <tr><td class="mono">wayq</td><td>Wayyiqtol</td><td>Narrative past. 𐤅 + imperfect (waw-consecutive). Most common in narrative.</td><td>pfm=J with 𐤅𐤉 or 𐤅 prefix in word_raw</td></tr>
    <tr><td class="mono">impv</td><td>Imperative</td><td>Command, 2nd person only.</td><td>ps=p2, often vbe=W for plural</td></tr>
    <tr><td class="mono">infc</td><td>Infinitive construct</td><td>Verbal noun used with לְ/בְּ. "to do / in doing"</td><td>No pfm, has nme or prs sometimes</td></tr>
    <tr><td class="mono">infa</td><td>Infinitive absolute</td><td>Emphatic/adverbial form. Often before cognate verb.</td><td>pdp=advb common</td></tr>
    <tr><td class="mono">ptca</td><td>Participle active</td><td>Agent noun / ongoing action. "the one doing X"</td><td>Often pdp=subs or pdp=adjv</td></tr>
    <tr><td class="mono">ptcp</td><td>Participle passive</td><td>State resulting from action. "the one having been done to"</td><td>Rare; pual ptcp mostly</td></tr>
  </table>
</section>

<!-- ════════════════════════════ NOUN/ADJ FIELDS ════════════════════════════ -->
<section class="section" id="noun-fields">
  <h2>Noun &amp; adjective fields</h2>
  <p class="section-sub">st (state) is critical for construct chains; gn and nu define agreement</p>

  <h3>st — State</h3>
  <div class="field-grid" style="margin-bottom:20px">
    <div class="field-card">
      <div class="field-name" style="color:var(--teal)">st=a — Absolute</div>
      <div class="field-desc">The noun stands alone with its full ending. "a king", "the king". Default final form.</div>
    </div>
    <div class="field-card">
      <div class="field-name" style="color:var(--orange)">st=c — Construct</div>
      <div class="field-desc">The noun is bound to the next noun. "king <b>of</b> Israel". Final vowels shorten/drop. The linked pair is the "construct chain". The construct noun has no article; the absolute after it can have one.</div>
    </div>
  </div>

  <div class="callout">
    <b>Construct chain rule:</b> When you see <code>st=c</code> followed immediately by another noun (or its article + noun), they form a genitive unit: the construct noun "possesses" the next. e.g. <code>𐤁𐤉𐤕</code> st=c + <code>𐤉𐤄𐤅𐤄</code> = "house of YHWH".
  </div>

  <h3>gn — Gender</h3>
  <table>
    <tr><th>Value</th><th>Meaning</th><th>Signal</th></tr>
    <tr><td class="mono">m</td><td>Masculine</td><td>Default. Plural ends in 𐤉𐤌 (JM), construct 𐤉 (J=)</td></tr>
    <tr><td class="mono">f</td><td>Feminine</td><td>Often ends in 𐤄 (nme=H) or 𐤕 (nme=T). Plural 𐤅𐤕 (WT)</td></tr>
    <tr><td class="mono">unknown</td><td>Grammatical gender unclear</td><td>BHS editorial judgment; treat as context determines</td></tr>
  </table>

  <h3>nu — Number</h3>
  <table>
    <tr><th>Value</th><th>Meaning</th><th>Signal</th></tr>
    <tr><td class="mono">sg</td><td>Singular</td><td>No number suffix</td></tr>
    <tr><td class="mono">pl</td><td>Plural</td><td>nme=JM (masc), nme=WT (fem)</td></tr>
    <tr><td class="mono">du</td><td>Dual</td><td>nme=J= (two of something, e.g. hands, eyes, knees)</td></tr>
    <tr><td class="mono">unknown</td><td>Unclear</td><td>Rare; usually on infinitives or proper nouns</td></tr>
  </table>
</section>

<!-- ════════════════════════════ PERSON/GENDER/NUMBER ════════════════════════════ -->
<section class="section" id="person-fields">
  <h2>Person, gender, number on verbs</h2>
  <p class="section-sub">ps, gn, nu on a verb agree with the SUBJECT (not the object)</p>

  <table>
    <tr><th>ps</th><th>gn</th><th>nu</th><th>English</th><th>Paleo signal</th></tr>
    <tr><td class="mono">p1</td><td>—</td><td>sg</td><td>I</td><td>pfm=&gt; (𐤀) or vbe=TJ (𐤕𐤉)</td></tr>
    <tr><td class="mono">p1</td><td>—</td><td>pl</td><td>We</td><td>pfm=N (𐤍) or vbe=NW (𐤍𐤅)</td></tr>
    <tr><td class="mono">p2</td><td>m</td><td>sg</td><td>You (ms)</td><td>pfm=T (𐤕) or vbe=T (𐤕)</td></tr>
    <tr><td class="mono">p2</td><td>m</td><td>pl</td><td>You (mpl)</td><td>pfm=T + vbe=W or vbe=TM (𐤕𐤌)</td></tr>
    <tr><td class="mono">p3</td><td>m</td><td>sg</td><td>He/It</td><td>pfm=J (𐤉 or 𐤅𐤉 in wayyiqtol)</td></tr>
    <tr><td class="mono">p3</td><td>f</td><td>sg</td><td>She/It</td><td>pfm=T= (𐤕) or vbe=H / H= (𐤕𐤄/𐤄)</td></tr>
    <tr><td class="mono">p3</td><td>m</td><td>pl</td><td>They (m)</td><td>pfm=J + vbe=W (𐤅)</td></tr>
    <tr><td class="mono">p3</td><td>f</td><td>pl</td><td>They (f)</td><td>pfm=T + vbe=NH or WN (𐤅𐤍/𐤍𐤄)</td></tr>
  </table>
</section>

<!-- ════════════════════════════ AFFIXES ════════════════════════════ -->
<section class="section" id="affixes">
  <h2>Affixes — the six strippable layers</h2>
  <p class="section-sub">These fields tell the engine which characters to remove from word_raw to isolate the root</p>

  <h3>pfm — Verbal Prefix Marker</h3>
  <div class="callout">Attaches to the START of imperfect / wayyiqtol / imperative forms. Encodes the person performing the action. In wayyiqtol the waw-consecutive 𐤅 is prepended, so the actual prefix in word_raw is 𐤅𐤉 (J) not bare 𐤉.</div>
  <table>
    <tr><th>pfm</th><th>Paleo chars</th><th>Meaning</th><th>Note</th></tr>
    <tr><td class="mono">J</td><td>𐤅𐤉 / 𐤉 / 𐤅</td><td>He/It (3ms)</td><td>Engine tries 𐤅𐤉 first (wayyiqtol), then 𐤅, then 𐤉</td></tr>
    <tr><td class="mono">T / T=</td><td>𐤕</td><td>She/You (2ms or 3fs)</td><td>T= = 3fs. Distinguish by gn field</td></tr>
    <tr><td class="mono">&gt; / &lt;</td><td>𐤀</td><td>I (1cs)</td><td>Two BHS codes for same prefix</td></tr>
    <tr><td class="mono">N</td><td>𐤍</td><td>We (1cp)</td><td></td></tr>
    <tr><td class="mono">M</td><td>𐤌</td><td>Participial mem — marks active participles in Hifil and Piel stems</td><td>Appears on ptca Hifil, Piel</td></tr>
    <tr><td class="mono">H</td><td>𐤄</td><td>Imperative Nifal / Hifil</td><td>Seen on Nifal impv: 𐤄𐤔𐤌𐤓</td></tr>
    <tr><td class="mono">absent</td><td>—</td><td>No prefix</td><td>Perfect, infinitive, ptca Qal</td></tr>
  </table>

  <h3>vbs — Verbal Stem Marker</h3>
  <table>
    <tr><th>vbs</th><th>Paleo chars stripped</th><th>Meaning</th><th>Gotcha</th></tr>
    <tr><td class="mono">H</td><td>𐤄</td><td>Hifil causative prefix</td><td>In Hifil impf, 𐤄 often CONTRACTS into the prefix vowel — vbs=H present but no 𐤄 in word_raw</td></tr>
    <tr><td class="mono">N</td><td>𐤍</td><td>Passive/reflexive prefix — marks Nifal (passive or reflexive of Qal)</td><td>In Pe-Nun roots, the root Nun and the Nifal Nun merge; vbs=N still set but no extra 𐤍 visible</td></tr>
    <tr><td class="mono">HCT / HT</td><td>𐤄𐤕 or 𐤕</td><td>Hitpael reflexive</td><td>When root starts with sibilant (𐤔𐤎𐤑𐤆), the 𐤕 transposes; engine strips bare 𐤕</td></tr>
  </table>

  <h3>vbe — Verbal Ending (perfect / impf agreement)</h3>
  <table>
    <tr><th>vbe</th><th>Paleo chars</th><th>Subject</th></tr>
    <tr><td class="mono">TJ</td><td>𐤕𐤉</td><td>I (1cs perf)</td></tr>
    <tr><td class="mono">T</td><td>𐤕</td><td>You/She (2ms or 3fs perf)</td></tr>
    <tr><td class="mono">TM</td><td>𐤕𐤌</td><td>You pl (2mp)</td></tr>
    <tr><td class="mono">W</td><td>𐤅</td><td>They / wayyiqtol-pl / waw (3mpl or 3fpl)</td></tr>
    <tr><td class="mono">H / H=</td><td>𐤕𐤄 or 𐤄</td><td>She (3fs perf of lamed-Hay roots)</td></tr>
    <tr><td class="mono">NW</td><td>𐤍𐤅</td><td>We (1cp)</td></tr>
    <tr><td class="mono">NH / WN</td><td>𐤍𐤄 / 𐤅𐤍</td><td>They (3fp)</td></tr>
    <tr><td class="mono">absent</td><td>—</td><td>3ms perfect (no suffix) or impf single forms</td></tr>
  </table>

  <h3>nme — Nominal/Verbal Ending</h3>
  <div class="callout">Attached to nouns for plural/feminine/construct, or to verbs (infinitive construct). Stripped from the END of word_raw to expose the root.</div>
  <table>
    <tr><th>nme</th><th>Paleo chars stripped</th><th>Meaning</th></tr>
    <tr><td class="mono">H</td><td>𐤄</td><td>Feminine singular ending, OR directional — motion toward a place</td></tr>
    <tr><td class="mono">T</td><td>𐤕</td><td>Feminine ending — marks feminine nouns and verb forms</td></tr>
    <tr><td class="mono">J / J=</td><td>𐤉</td><td>Construct state (noun bound to the next noun, "of") or 1cs possessive ("my")</td></tr>
    <tr><td class="mono">JM / JM=</td><td>𐤉𐤌 or 𐤌</td><td>Masculine plural ending</td></tr>
    <tr><td class="mono">WT</td><td>𐤅𐤕 or 𐤕</td><td>Feminine plural ending</td></tr>
    <tr><td class="mono">WTJ</td><td>𐤅𐤕𐤉 or 𐤕𐤉</td><td>Feminine plural construct — plural noun bound to the following noun</td></tr>
    <tr><td class="mono">NH</td><td>𐤍𐤄</td><td>They (3rd person feminine plural) — verb ending</td></tr>
  </table>

  <h3>prs — Pronominal Suffix</h3>
  <div class="callout">Encodes possession (on nouns) or object (on verbs). Stripped from the END after nme. Also appears on prepositions — means "to him", "with her" etc.</div>
  <table>
    <tr><th>prs</th><th>Paleo stripped</th><th>Meaning</th></tr>
    <tr><td class="mono">J</td><td>𐤉</td><td>Me/My (1cs)</td></tr>
    <tr><td class="mono">K</td><td>𐤊</td><td>Your (2ms)</td></tr>
    <tr><td class="mono">KM</td><td>𐤊𐤌</td><td>Your (2mpl)</td></tr>
    <tr><td class="mono">W / HW</td><td>𐤅 or 𐤄𐤅</td><td>His (3ms)</td></tr>
    <tr><td class="mono">H</td><td>𐤄</td><td>Her (3fs)</td></tr>
    <tr><td class="mono">NW</td><td>𐤍𐤅</td><td>Our (1cp)</td></tr>
    <tr><td class="mono">M / HM</td><td>𐤌 or 𐤄𐤌</td><td>Them (3mp)</td></tr>
    <tr><td class="mono">N / HN</td><td>𐤍 or 𐤄𐤍</td><td>Them (3fp)</td></tr>
  </table>

  <h3>uvf — Unclassified Final</h3>
  <table>
    <tr><th>uvf</th><th>Paleo</th><th>Meaning</th></tr>
    <tr><td class="mono">H</td><td>𐤄</td><td>Directional Hay — motion toward. "toward Jerusalem" 𐤉𐤓𐤅𐤔𐤋𐤌𐤄</td></tr>
    <tr><td class="mono">J</td><td>𐤉</td><td>Paragogic Yad — emphatic or poetic filler</td></tr>
    <tr><td class="mono">N</td><td>𐤍</td><td>Nun paragogicum — cohortative/jussive emphasis</td></tr>
  </table>
</section>

<!-- ════════════════════════════ GROUPING ════════════════════════════ -->
<section class="section" id="grouping">
  <h2>How tokens group into displayed word blocks</h2>
  <p class="section-sub">The engine uses "pendingComponents" — consecutive particles collect before flushing to a word block</p>

  <div class="rule-box">
    <p><b>Rule 1 — Standalone tokens (conj, prep, art, nega) accumulate as prefixes.</b> When the engine encounters sp=conj, sp=prep, or sp=art, it pushes the component into a pending list <em>without flushing</em>. The next non-particle token (verb/noun/etc.) collects everything into one visual word block.</p>
  </div>
  <div class="rule-box">
    <p><b>Rule 2 — The flush trigger is a verb or noun token.</b> When a subs/verb/adjv token is encountered, all pending particle components are prepended to it, forming one display block. The Paleo glyphs concatenate right-to-left.</p>
  </div>
  <div class="rule-box">
    <p><b>Rule 3 — Empty word_raw art tokens merge silently.</b> Some article tokens have an empty word_raw (phonologically fused to the following vowel). They contribute their CSS class but no glyph. The display word absorbs them.</p>
  </div>

  <div class="example">
    <div class="example-title">Example: 𐤅𐤉𐤀𐤌𐤓 (WaYaAmar)</div>
    <div class="ex-raw">Verse 3, tokens: [1] 𐤅|conj  [2] 𐤉𐤀𐤌𐤓|verb|pfm=J…</div>
    <div class="ex-paleo">𐤓𐤌𐤀𐤉𐤅</div>
    <div class="ex-parse">
      Token 1: <span class="hi-pfm">𐤅 conj "And"</span> → goes into pendingComponents<br>
      Token 2: <span class="hi-pfm">𐤉</span> (pfm=J stripped) + <span class="hi-root">𐤀𐤌𐤓</span> (root "to say") = one block<br>
      Subtext: <b>WaYaAmar</b> (Amar → 𐤀𐤌𐤓) [And-He/It]
    </div>
  </div>
</section>

<!-- ════════════════════════════ STRIP ORDER ════════════════════════════ -->
<section class="section" id="strip-order">
  <h2>Stripping order</h2>
  <p class="section-sub">The engine removes affixes in this fixed order. Each step shrinks word_raw; what remains is the display root.</p>

  <div class="strip-flow">
    <div class="strip-step"><div class="label">1 — start</div><div class="code">pfm</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step"><div class="label">2</div><div class="code">vbs</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step"><div class="label">3 — end</div><div class="code">prs</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step"><div class="label">4 — end</div><div class="code">uvf</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step"><div class="label">5 — end</div><div class="code">nme</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step"><div class="label">6 — end</div><div class="code">vbe</div></div>
    <span class="strip-arrow">→</span>
    <div class="strip-step" style="border-color:var(--gold);color:var(--gold)"><div class="label">result</div><div class="code">ROOT</div></div>
  </div>

  <div class="callout">
    <b>Why prs before nme?</b> Pronominal suffixes attach to the very end of the inflected form and sit outside nominal endings: שִׂמְלָה + הּ = שִׂמְלָתָהּ. Strip prs first (𐤄) then nme (𐤕) to reach root 𐤔𐤌𐤋.
  </div>
  <div class="callout">
    <b>vbs=H failure mode:</b> In Hifil imperfect, the 𐤄 of the Hifil stem contracts phonologically into the prefix vowel — the 𐤄 is NOT present as a consonant in word_raw. vbs=H is still encoded, but the strip attempt silently fails. This is expected; the display root just has one more character that MUTATED_ROOTS handles.
  </div>
</section>

<!-- ════════════════════════════ EXAMPLES ════════════════════════════ -->
<section class="section" id="examples">
  <h2>Worked examples</h2>
  <p class="section-sub">Full parse traces for common and tricky tokens</p>

  <div class="assembly-grid">

    <div class="assembly-card">
      <h4>𐤉𐤄𐤉 — simple Qal impf wayyiqtol</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤉𐤄𐤉</span></div>
      <div class="assembly-row"><span class="lbl">sp/vs/vt</span><span class="val">verb / qal / wayq</span></div>
      <div class="assembly-row"><span class="lbl">pfm=J</span><span class="val">strips 𐤉 → 𐤄𐤉</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤄𐤉 → MUTATED[𐤄𐤉] = 𐤄𐤉𐤄 "to be"</span></div>
      <div class="assembly-row"><span class="lbl">reads</span><span class="val">WaYaHay "and it came to be"</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤄𐤉𐤕𐤄 — Qal perfect 3fs</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤄𐤉𐤕𐤄</span></div>
      <div class="assembly-row"><span class="lbl">sp/vs/vt</span><span class="val">verb / qal / perf</span></div>
      <div class="assembly-row"><span class="lbl">vbe=H</span><span class="val">strips 𐤕𐤄 or 𐤄 → 𐤄𐤉𐤕 (or 𐤄𐤉)</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤄𐤉𐤕 → MUTATED = 𐤄𐤉𐤄 "to be"</span></div>
      <div class="assembly-row"><span class="lbl">reads</span><span class="val">HayaTh "she was/came to pass"</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤄𐤒𐤉𐤐𐤅 — Hifil perfect 3mpl</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤄𐤒𐤉𐤐𐤅</span></div>
      <div class="assembly-row"><span class="lbl">sp/vs/vt</span><span class="val">verb / hif / perf</span></div>
      <div class="assembly-row"><span class="lbl">pfm=absent</span><span class="val">no prefix</span></div>
      <div class="assembly-row"><span class="lbl">vbs=H</span><span class="val">strips 𐤄 → 𐤒𐤉𐤐𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vbe=W</span><span class="val">strips 𐤅 → 𐤒𐤉𐤐</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤒𐤉𐤐 → MUTATED[𐤒𐤉𐤐] → check: hollow? 𐤒𐤅𐤐? Actually = qaph-yad-peh. Root 𐤒𐤐𐤏? Lookup needed.</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤌𐤓𐤇𐤐𐤕 — Piel ptca feminine</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤌𐤓𐤇𐤐𐤕</span></div>
      <div class="assembly-row"><span class="lbl">sp/vs/vt</span><span class="val">verb / piel / ptca</span></div>
      <div class="assembly-row"><span class="lbl">pfm=M</span><span class="val">strips 𐤌 → 𐤓𐤇𐤐𐤕</span></div>
      <div class="assembly-row"><span class="lbl">nme=T</span><span class="val">strips 𐤕 → 𐤓𐤇𐤐</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤓𐤇𐤐 "to hover/flutter"</span></div>
      <div class="assembly-row"><span class="lbl">reads</span><span class="val">MaRachapaT "hovering [Action-Feminine]"</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤕𐤔𐤌𐤓𐤅 — Nifal impf 2mp</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤕𐤔𐤌𐤓𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vs/vt</span><span class="val">nif / impf, pfm=T, vbs=N, vbe=W</span></div>
      <div class="assembly-row"><span class="lbl">pfm=T</span><span class="val">strips 𐤕 → 𐤔𐤌𐤓𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vbs=N</span><span class="val">tries strip 𐤍 from 𐤔𐤌𐤓𐤅 → FAIL (Nun assimilated)</span></div>
      <div class="assembly-row"><span class="lbl">vbe=W</span><span class="val">strips 𐤅 → 𐤔𐤌𐤓</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤔𐤌𐤓 "to guard/keep"</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤉𐤍𐤐𐤔 — Nifal impf of Pe-Nun</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤉𐤍𐤐𐤔</span></div>
      <div class="assembly-row"><span class="lbl">vs/vt</span><span class="val">nif / impf, pfm=J, vbs=N</span></div>
      <div class="assembly-row"><span class="lbl">pfm=J</span><span class="val">strips 𐤉 → 𐤍𐤐𐤔</span></div>
      <div class="assembly-row"><span class="lbl">vbs=N</span><span class="val">strips 𐤍 → 𐤐𐤔</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤐𐤔 → MUTATED = 𐤍𐤐𐤔 "NaPash: breathe/refresh"</span></div>
      <div class="assembly-row"><span class="lbl">note</span><span class="val">The root 𐤍 and Nifal 𐤍 merge; both are recovered.</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤕𐤁𐤀𐤄 — Hifil impf 3fs (contracted)</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤕𐤁𐤀𐤄</span></div>
      <div class="assembly-row"><span class="lbl">vs/vt</span><span class="val">hif / impf, pfm=T=, vbs=H</span></div>
      <div class="assembly-row"><span class="lbl">pfm=T=</span><span class="val">strips 𐤕 → 𐤁𐤀𐤄</span></div>
      <div class="assembly-row"><span class="lbl">vbs=H</span><span class="val">tries strip 𐤄 from 𐤁𐤀𐤄 → FAIL (Hifil contracted)</span></div>
      <div class="assembly-row"><span class="lbl">nme?</span><span class="val">absent → display root = 𐤁𐤀𐤄</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤁𐤀𐤄: lamed-Hay of 𐤁𐤅𐤀 "to come" — final 𐤄 is lamed-Hay marker, not separate</span></div>
    </div>

    <div class="assembly-card">
      <h4>𐤉𐤕𐤁𐤔𐤔𐤅 — Hitpael of hollow root</h4>
      <div class="assembly-row"><span class="lbl">raw</span><span class="val">𐤉𐤕𐤁𐤔𐤔𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vs/vt</span><span class="val">hit / impf, pfm=J, vbs=HT, vbe=W</span></div>
      <div class="assembly-row"><span class="lbl">pfm=J</span><span class="val">strips 𐤉 → 𐤕𐤁𐤔𐤔𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vbs=HT</span><span class="val">strips 𐤕 (sibilant swap) → 𐤁𐤔𐤔𐤅</span></div>
      <div class="assembly-row"><span class="lbl">vbe=W</span><span class="val">strips 𐤅 → 𐤁𐤔𐤔</span></div>
      <div class="assembly-row"><span class="lbl">root</span><span class="val">𐤁𐤔𐤔 → MUTATED = 𐤁𐤅𐤔 "be ashamed". Doubled Shin = Hitpael of hollow root.</span></div>
    </div>

  </div>
</section>

<!-- ════════════════════════════ EXAMPLES ════════════════════════════ -->
<section class="section" id="examples">
  <h2>Worked examples</h2>
  <p class="section-sub">Full parse traces for common and tricky tokens. Each example card shows the raw token, the stripping steps, and the resulting display. See also the <a onclick="navScrollTo('practical-examples')" style="color:var(--gold);cursor:pointer">practical homograph examples</a> at the bottom for lexicon/homograph JSON decisions.</p>

  

  <div class="ex-section-label">🔵 Verb forms</div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V1</div>
      <div class="ex-card-title">𐤉𐤄𐤉 — Qal wayyiqtol 3ms</div>
      <span class="ex-card-tag tag-verb">qal · wayq · pfm=J</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=qal | vt=wayq | pfm=J | ps=p3 | gn=m | nu=sg</div>
      <div class="ex-paleo">𐤉𐤄𐤉</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=J</span><span class="step-val">strips <code>𐤉</code> from start → <b>𐤄𐤉</b> (Hay)</span></div>
        <div class="step-row"><span class="step-label">mutation</span><span class="step-val">MUTATED_ROOTS[𐤄𐤉] = <code>𐤄𐤉𐤄</code> (Hayah) "to be"</span></div>
      </div>
      <div class="ex-result">Reads: <b>Yahay</b> — "and it came to be"</div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V2</div>
      <div class="ex-card-title">𐤄𐤉𐤕𐤄 — Qal perfect 3fs (lamed-Hay)</div>
      <span class="ex-card-tag tag-verb">qal · perf · vbe=H</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=qal | vt=perf | vbe=H | ps=p3 | gn=f | nu=sg</div>
      <div class="ex-paleo">𐤄𐤉𐤕𐤄</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">vbe=H</span><span class="step-val">strips <code>𐤕𐤄</code> or <code>𐤄</code> from end → <b>𐤄𐤉𐤕</b></span></div>
        <div class="step-row"><span class="step-label">mutation</span><span class="step-val">𐤄𐤉𐤕 → MUTATED = <code>𐤄𐤉𐤄</code> "to be"</span></div>
      </div>
      <div class="ex-result">Reads: <b>Hayathah</b> — "she was / came to pass"</div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V3</div>
      <div class="ex-card-title">𐤌𐤓𐤇𐤐𐤕 — Piel participle active, feminine</div>
      <span class="ex-card-tag tag-verb">piel · ptca · pfm=M · nme=T</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=piel | vt=ptca | pfm=M | gn=f | nu=sg</div>
      <div class="ex-paleo">𐤌𐤓𐤇𐤐𐤕</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=M</span><span class="step-val">strips <code>𐤌</code> from start → <b>𐤓𐤇𐤐𐤕</b></span></div>
        <div class="step-row"><span class="step-label">nme=T</span><span class="step-val">strips <code>𐤕</code> from end → <b>𐤓𐤇𐤐</b></span></div>
        <div class="step-row"><span class="step-label">root</span><span class="step-val"><code>𐤓𐤇𐤐</code> — "to hover / flutter"</span></div>
      </div>
      <div class="ex-result">Reads: <b>Marachapath</b> — "hovering [Active · Feminine]"</div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V4</div>
      <div class="ex-card-title">𐤁𐤀 — Qal active participle (hollow root 𐤁𐤅𐤀)</div>
      <span class="ex-card-tag tag-verb">qal · ptca · no affixes</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">verse=1|token_ordinal=5|word_raw=𐤁𐤀|part_of_speech=verb|verbal_stem=qal|verbal_tense_form=participle_active|person=unknown|gender=masculine|number=singular|state=absolute|pronominal_suffix=none|prefix_marker=none|verbal_stem_marker=none</div>
      <div class="ex-paleo">𐤀𐤁</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm</span><span class="step-val">none → nothing to strip. Display root = <b>𐤁𐤀</b></span></div>
        <div class="step-row"><span class="step-label">vbs / nme</span><span class="step-val">none → nothing to strip</span></div>
        <div class="step-row"><span class="step-label">mutation</span><span class="step-val">MUTATED_ROOTS[𐤁𐤀] = <code>𐤁𐤅𐤀</code> — hollow Qal of "to come"</span></div>
        <div class="step-row"><span class="step-label">vt=ptca</span><span class="step-val">active participle = <b>"one who is coming"</b> → gloss: <b>coming</b></span></div>
        <div class="step-row"><span class="step-label">gn=m · nu=sg</span><span class="step-val">masculine singular, no nme suffix needed (absolute state, masc sg ptca is bare root)</span></div>
      </div>
      <div class="ex-result">Reads: <b>Baa</b> (Bawaa, 𐤁𐤅𐤀 → 𐤁𐤀) — "coming"</div>
      <div style="margin-top:12px;padding:12px 14px;background:rgba(167,139,250,.07);border:1px solid rgba(167,139,250,.3);border-radius:6px;font-size:13px;">
        <b style="color:#a78bfa">Homograph key decision:</b><br>
        The lexicon entry for <code>𐤁𐤅𐤀</code> probably reads <b>"to come"</b> (infinitive gloss). But here the form is a <b>participle</b>, so you want <b>"coming"</b> instead.<br><br>
        The parser looks up the <b>trueRoot</b> <code>𐤁𐤅𐤀</code> first. So write the key on the root, not the surface:<br><br>
        <code style="color:var(--gold)">&nbsp;&nbsp;"𐤁𐤅𐤀_qal": "coming"</code> &nbsp;← T8 — matches any Qal form of this root<br>
        <code style="color:var(--gold)">&nbsp;&nbsp;"𐤁𐤅𐤀_verb_qal_participle active": "coming"</code> &nbsp;← T7 — only matches Qal ptca<br><br>
        <b>Choose T8 if all Qal forms of 𐤁𐤅𐤀 should read "coming"; choose T7 if you only want the participle overridden and other Qal forms (perfect, imperfect) to keep their own lexicon gloss.</b>
      </div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V5</div>
      <div class="ex-card-title">𐤕𐤔𐤌𐤓𐤅 — Nifal impf 2mp (Nun assimilated)</div>
      <span class="ex-card-tag tag-verb">nif · impf · pfm=T · vbs=N · vbe=W</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=nif | vt=impf | pfm=T | vbs=N | vbe=W | ps=p2 | gn=m | nu=pl</div>
      <div class="ex-paleo">𐤕𐤔𐤌𐤓𐤅</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=T</span><span class="step-val">strips <code>𐤕</code> → <b>𐤔𐤌𐤓𐤅</b></span></div>
        <div class="step-row"><span class="step-label">vbs=N</span><span class="step-val">tries strip <code>𐤍</code> → FAIL (Nun assimilated into 𐤔). Silent fail — continue.</span></div>
        <div class="step-row"><span class="step-label">vbe=W</span><span class="step-val">strips <code>𐤅</code> → <b>𐤔𐤌𐤓</b></span></div>
        <div class="step-row"><span class="step-label">root</span><span class="step-val"><code>𐤔𐤌𐤓</code> — "to guard / keep"</span></div>
      </div>
      <div class="ex-result">Reads: <b>Thashamaraw</b> — "you all will be kept / guard yourselves"</div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-verb">V6</div>
      <div class="ex-card-title">𐤉𐤍𐤐𐤔 — Nifal impf of Pe-Nun root</div>
      <span class="ex-card-tag tag-verb">nif · impf · pfm=J · vbs=N</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=nif | vt=impf | pfm=J | vbs=N | ps=p3 | gn=m</div>
      <div class="ex-paleo">𐤉𐤍𐤐𐤔</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=J</span><span class="step-val">strips <code>𐤉</code> → <b>𐤍𐤐𐤔</b></span></div>
        <div class="step-row"><span class="step-label">vbs=N</span><span class="step-val">strips <code>𐤍</code> → <b>𐤐𐤔</b></span></div>
        <div class="step-row"><span class="step-label">mutation</span><span class="step-val">MUTATED_ROOTS[𐤐𐤔] = <code>𐤍𐤐𐤔</code> — the root Nun and Nifal Nun were the same letter. Both recovered.</span></div>
      </div>
      <div class="ex-result">Reads: <b>Yanapash</b> — "he will be refreshed / breathe again"</div>
    </div>
  </div>

  <div class="ex-section-label">🟢 Noun &amp; particle forms</div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-noun">N1</div>
      <div class="ex-card-title">𐤅𐤉𐤀𐤌𐤓 — conj + verb word block</div>
      <span class="ex-card-tag tag-noun">conj · qal · wayq</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">Token 1: 𐤅 | conj | sp=conj — Token 2: 𐤉𐤀𐤌𐤓 | verb | pfm=J | vs=qal | vt=wayq</div>
      <div class="ex-paleo">𐤓𐤌𐤀𐤉𐤅</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">token 1</span><span class="step-val"><code>𐤅</code> conj → pendingComponents. No flush.</span></div>
        <div class="step-row"><span class="step-label">token 2</span><span class="step-val">pfm=J strips <code>𐤉</code> → <b>𐤀𐤌𐤓</b> (Amar, "to say"). Flush: conj + verb = one block.</span></div>
      </div>
      <div class="ex-result">Reads: <b>Wayaamar</b> — "And he said"</div>
    </div>
  </div>

  <div class="ex-section-label">🔴 Edge cases</div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-edge">E1</div>
      <div class="ex-card-title">𐤕𐤁𐤀𐤄 — Hifil impf 3fs with contracted stem</div>
      <span class="ex-card-tag tag-edge">hif · impf · vbs=H · FAIL</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=hif | vt=impf | pfm=T= | vbs=H | gn=f</div>
      <div class="ex-paleo">𐤄𐤀𐤁𐤕</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=T=</span><span class="step-val">strips <code>𐤕</code> → <b>𐤁𐤀𐤄</b></span></div>
        <div class="step-row"><span class="step-label">vbs=H</span><span class="step-val">tries strip <code>𐤄</code> from <b>𐤁𐤀𐤄</b> → FAIL. Hifil 𐤄 contracted into prefix vowel; 𐤄 is the lamed-Hay root consonant, not the stem marker.</span></div>
        <div class="step-row"><span class="step-label">root</span><span class="step-val">Display root = <b>𐤁𐤀𐤄</b> → MUTATED = <code>𐤁𐤅𐤀</code> "to come" (lamed-Hay hollow)</span></div>
      </div>
      <div class="ex-result">Reads: <b>Thabaah</b> — "she will bring / cause to come"</div>
    </div>
  </div>

  <div class="ex-card">
    <div class="ex-card-header">
      <div class="ex-card-num num-edge">E2</div>
      <div class="ex-card-title">𐤉𐤕𐤁𐤔𐤔𐤅 — Hitpael of hollow root (doubled)</div>
      <span class="ex-card-tag tag-edge">hit · impf · sibilant · doubled</span>
    </div>
    <div class="ex-card-body">
      <div class="ex-raw">sp=verb | vs=hit | vt=impf | pfm=J | vbs=HT | vbe=W</div>
      <div class="ex-paleo">𐤅𐤔𐤔𐤁𐤕𐤉</div>
      <div class="step-list">
        <div class="step-row"><span class="step-label">pfm=J</span><span class="step-val">strips <code>𐤉</code> → <b>𐤕𐤁𐤔𐤔𐤅</b></span></div>
        <div class="step-row"><span class="step-label">vbs=HT</span><span class="step-val">strips <code>𐤕</code> (sibilant transposition: 𐤕 moved before 𐤁) → <b>𐤁𐤔𐤔𐤅</b></span></div>
        <div class="step-row"><span class="step-label">vbe=W</span><span class="step-val">strips <code>𐤅</code> → <b>𐤁𐤔𐤔</b></span></div>
        <div class="step-row"><span class="step-label">mutation</span><span class="step-val">MUTATED_ROOTS[𐤁𐤔𐤔] = <code>𐤁𐤅𐤔</code> "to be ashamed". Doubled Shin = hollow Hitpael residual.</span></div>
      </div>
      <div class="ex-result">Reads: <b>Yathabashashaw</b> — "they will be put to shame"</div>
    </div>
  </div>

</section>

<!-- ════════════════════════════ PRACTICAL EXAMPLES ════════════════════════════ -->
<section class="section" id="practical-examples">
  <h2>Practical examples — lexicon &amp; homograph decisions</h2>
  <p class="section-sub">How to decide what JSON entry to write, and which key to use, given a real token. Each card walks from raw token → analysis → the exact line to add to <code>homographs.json</code>.</p>

  

  <!-- ── P1 ── -->
  <div class="pex-card">
    <div class="pex-header">
      <div class="pex-num">P1</div>
      <div class="pex-word">𐤀𐤁</div>
      <div>
        <div class="pex-name">𐤁𐤀 — "coming" (Qal active participle of 𐤁𐤅𐤀)</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Job 18:17 · verb · qal · ptca · masculine singular absolute</div>
      </div>
    </div>
    <div class="pex-body">
      <div class="pex-raw">verse=1|token_ordinal=5|word_raw=𐤁𐤀|part_of_speech=verb|speech_part=verb|parser_part_of_speech=verb|verbal_stem=qal|verbal_tense_form=participle_active|person=unknown|gender=masculine|number=singular|state=absolute|pronominal_suffix=none|prefix_marker=none|verbal_stem_marker=none|unclassified_final=none</div>
      <div class="pex-steps">
        <div class="pex-step"><span class="pex-step-label">word_raw</span><span class="pex-step-val"><code>𐤁𐤀</code> — two letters on the surface</span></div>
        <div class="pex-step"><span class="pex-step-label">pfm=none</span><span class="pex-step-val">No prefix to strip. Display root stays <code>𐤁𐤀</code>.</span></div>
        <div class="pex-step"><span class="pex-step-label">vbs / nme / prs</span><span class="pex-step-val">All absent. Nothing more to strip.</span></div>
        <div class="pex-step"><span class="pex-step-label">mutation</span><span class="pex-step-val">MUTATED_ROOTS[𐤁𐤀] = <code>𐤁𐤅𐤀</code>. This is a hollow (Ayin-Waw) root. The Waw contracts away in the participle, leaving the bare biconsonantal surface.</span></div>
        <div class="pex-step"><span class="pex-step-label">vt=ptca</span><span class="pex-step-val"><code>participle_active</code> means this is the agent form — <b>"the one coming"</b>, i.e. <b>"coming"</b> as the gloss.</span></div>
        <div class="pex-step"><span class="pex-step-label">lexicon</span><span class="pex-step-val">𐤁𐤅𐤀 is likely glossed <b>"to come"</b> (infinitive). That's fine for most forms, but the participle deserves <b>"coming"</b>.</span></div>
        <div class="pex-step"><span class="pex-step-label">key base</span><span class="pex-step-val">The parser tries <b>trueRoot</b> first, so write the key on <code>𐤁𐤅𐤀</code>, not <code>𐤁𐤀</code>.</span></div>
        <div class="pex-step"><span class="pex-step-label">tier choice</span><span class="pex-step-val">
          T8 <code>root_stem</code>: <code>𐤁𐤅𐤀_qal</code> — overrides <b>all Qal forms</b> of this root.<br>
          T7 <code>root_stem_form</code>: <code>𐤁𐤅𐤀_qal_participle active</code> — overrides <b>only the Qal ptca</b>.<br>
          <b>Choose T7</b> if you want perfect/imperfect Qal forms of 𐤁𐤅𐤀 to keep their own lexicon gloss.
        </span></div>
      </div>
      <div class="pex-json">
        <span class="comment">// Add to homographs.json — most specific (recommended):</span><br>
        <span class="key">"𐤁𐤅𐤀_qal_participle active"</span>: <span class="val">"coming"</span>,<br><br>
        <span class="comment">// Or broader — all Qal forms of 𐤁𐤅𐤀 read "coming":</span><br>
        <span class="key">"𐤁𐤅𐤀_qal"</span>: <span class="val">"coming"</span>
      </div>
      <div class="pex-verdict"><span class="pex-verdict-icon">✦</span><span>The display word reads <b>Baa</b> (Bawaa, 𐤁𐤅𐤀 → 𐤁𐤀) with subtext <b>"coming"</b>. The <code>[His]</code> you see in the screenshot is from the following token's <code>prs=W</code> suffix, not from this one.</span></div>
    </div>
  </div>

  <!-- ── P2 ── -->
  <div class="pex-card">
    <div class="pex-header">
      <div class="pex-num">P2</div>
      <div class="pex-word">𐤀𐤃𐤌</div>
      <div>
        <div class="pex-name">𐤀𐤃𐤌 — three different meanings, three different keys</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">proper name · common noun · verb — all identical surface letters</div>
      </div>
    </div>
    <div class="pex-body">
      <div class="pex-steps">
        <div class="pex-step"><span class="pex-step-label">sp=nmpr</span><span class="pex-step-val">Proper name → <b>Adam the patriarch</b>. No homograph key needed; stays in lexicon as a name entry.</span></div>
        <div class="pex-step"><span class="pex-step-label">sp=subs</span><span class="pex-step-val">Common noun → <b>man / mankind</b>. Use <code>𐤀𐤃𐤌_noun</code> if you want to override the default gloss.</span></div>
        <div class="pex-step"><span class="pex-step-label">sp=verb</span><span class="pex-step-val">Verb → <b>dyed red</b>. Already in homographs as <code>𐤀𐤃𐤌_verb</code>.</span></div>
        <div class="pex-step"><span class="pex-step-label">art + subs</span><span class="pex-step-val">Article token precedes the subs token → <b>the man</b>. The article is a separate token, not part of the homograph key.</span></div>
      </div>
      <div class="pex-json">
        <span class="comment">// Already in homographs.json:</span><br>
        <span class="key">"𐤀𐤃𐤌_verb"</span>: <span class="val">"dyed red"</span>,<br><br>
        <span class="comment">// Add if you want to override noun gloss:</span><br>
        <span class="key">"𐤀𐤃𐤌_noun"</span>: <span class="val">"man/mankind"</span>
      </div>
      <div class="pex-verdict"><span class="pex-verdict-icon">✦</span><span>Decision rule: <code>sp=nmpr</code> → lexicon name entry. <code>sp=subs</code> → <code>_noun</code> family. <code>sp=verb</code> → <code>_verb</code> family. The article token is not the discriminator — check <code>sp</code>.</span></div>
    </div>
  </div>

  <!-- ── P3 ── -->
  <div class=\\</section>

<!-- ════════════════════════════ INSPECTION WORKFLOW ════════════════════════════ -->
<section class="section" id="inspection-workflow">
  <h2>Token inspection workflow</h2>
  <p class="section-sub">How to inspect raw tokens to tell whether a form is generic, definite, proper-name, or a homograph candidate</p>

  <div class="rule-box">
    <p><b>Core rule:</b> never decide from <code>word_raw</code> alone. Inspect the token in this order: <code>sp</code> → <code>pdp</code> → attached particle/article tokens → <code>st</code>/<code>prs</code>/<code>nme</code> → immediate verse context.</p>
  </div>

  <div class="strip-flow">
    <div class="strip-step"><div class="label">STEP 1</div><div class="code">word_raw</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 2</div><div class="code">sp / pdp</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 3</div><div class="code">prefix tokens</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 4</div><div class="code">state / suffixes</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 5</div><div class="code">context</div></div>
  </div>

  <h3>Inspection priority</h3>
  <div class="field-grid">
    <div class="field-card">
      <div class="field-name">1 — Check <code>sp</code></div>
      <div class="field-desc"><code>sp</code> tells you what the token <i>is on the surface</i>. This is the first filter for distinguishing a name from a common noun. Example: <code>sp=nmpr</code> means proper name; <code>sp=subs</code> means common noun; <code>sp=verb</code> means action form.</div>
    </div>
    <div class="field-card">
      <div class="field-name">2 — Check <code>pdp</code></div>
      <div class="field-desc"><code>pdp</code> tells you how the token functions in translation. A token may be surface-noun but function like a preposition or adverb. When deciding translation slot or homograph suffix, <b>use pdp when it differs in function</b>, but still note the surface class from <code>sp</code>.</div>
    </div>
    <div class="field-card">
      <div class="field-name">3 — Check for separate article/preposition tokens</div>
      <div class="field-desc">Look one token to the right in the raw viewer for <code>sp=art</code>, <code>sp=prep</code>, or <code>sp=conj</code>. The engine visually merges these into one display block, but the raw tokens still tell you whether the noun is bare, definite, or prefixed.</div>
    </div>
    <div class="field-card">
      <div class="field-name">4 — Check endings and suffixes</div>
      <div class="field-desc"><code>nme</code>, <code>prs</code>, and <code>uvf</code> tell you whether the surface form is lexical or modified. Before deciding a homograph, first determine whether you are looking at the root/base noun, a construct form, or a suffixed form.</div>
    </div>
  </div>

  <div class="callout">
    <b>Important:</b> the visible display word may combine multiple raw tokens. For identity questions such as <b>Adam / the man / mankind</b>, inspect the <b>raw token rows</b>, not just the rendered display block.
  </div>

  <h3>Adam / HaAdam / mankind — how to tell the difference</h3>

  <div class="example">
    <div class="example-title">Case 1 — Genesis 4:25 → Adam = the patriarch Adam</div>
    <div class="ex-raw">25|3|𐤀𐤃𐤌|nmpr|sp=nmpr|pdp=nmpr|gn=m|nu=sg|st=a|uvf=absent</div>
    <div class="ex-paleo">𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-n">sp=nmpr</span>
      <span class="t-n">pdp=nmpr</span>
      <span class="t-o">st=a</span>
      ⇒ This token is a <b>proper name</b>, not a generic noun. Treat it as <b>Adam</b> the person/patriarch.
    </div>
  </div>

  <div class="example">
    <div class="example-title">Case 2 — Genesis 1:25 → adam = mankind / humankind</div>
    <div class="ex-raw">Inspect the raw row for 𐤀𐤃𐤌. If it is tagged <code>sp=subs</code> rather than <code>sp=nmpr</code>, it is functioning as a common noun, not a personal name.</div>
    <div class="ex-paleo">𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-n">sp=subs</span>
      <span class="t-n">pdp=subs</span>
      ⇒ Read it as a <b>common noun</b>: man / mankind / humankind, depending on the verse context.
    </div>
  </div>

  <div class="example">
    <div class="example-title">Case 3 — Genesis 2:25 → HaAdam = the man</div>
    <div class="ex-raw">Look for a separate article token before the noun, usually <code>|𐤄|art|sp=art|...</code>, or an article fused into the display block. Then inspect the following noun token.</div>
    <div class="ex-paleo">𐤄 + 𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-p">sp=art</span>
      +
      <span class="t-n">sp=subs</span>
      ⇒ not a proper name; it is a <b>definite common noun</b>: <b>the man</b>.
    </div>
  </div>

  <div class="rule-box">
    <p><b>Decision rule for Adam forms:</b></p>
    <p>
      <code>sp=nmpr</code> → proper name → <b>Adam</b><br>
      <code>sp=subs</code> with no article → common noun → <b>man / mankind</b> by context<br>
      <code>sp=art</code> + <code>sp=subs</code> → definite noun → <b>the man</b>
    </p>
  </div>
</section>

<!-- ════════════════════════════ HOMOGRAPH SELECTION ════════════════════════════ -->
<section class="section" id="homograph-selection">
  <h2>Homograph selection</h2>
  <p class="section-sub">How to decide which homograph entry to use, which suffix belongs after the Paleo key, and which form-differentiators matter when the letters stay the same</p>

  <div class="rule-box">
    <p><b>Goal:</b> when multiple entries exist for the same Paleo spelling, build the lookup key from the token tags rather than guessing from the letters. The same surface letters can point to different entries because of <code>sp</code>/<code>pdp</code>, gender, number, state, stem, tense, or person.</p>
  </div>

  <h3>What actually differentiates same-letter forms</h3>
  <table>
    <tr><th>Differentiator</th><th>Field</th><th>What it separates</th><th>Example key effect</th></tr>
    <tr><td>Surface class</td><td class="mono">sp</td><td>Noun vs verb vs prep vs conjunction vs proper name</td><td class="mono">𐤍𐤐𐤔_noun vs 𐤍𐤐𐤔_verb</td></tr>
    <tr><td>Translation role</td><td class="mono">pdp</td><td>How the token functions in the clause</td><td class="mono">𐤏𐤅𐤃_adverb style distinctions if you choose to encode them</td></tr>
    <tr><td>Gender</td><td class="mono">gn</td><td>Masculine vs feminine forms sharing letters</td><td class="mono">𐤔𐤍𐤄_noun_f</td></tr>
    <tr><td>Number</td><td class="mono">nu</td><td>Singular / plural / dual distinctions</td><td class="mono">root_noun_masculine_plural</td></tr>
    <tr><td>State</td><td class="mono">st</td><td>Absolute vs construct</td><td class="mono">root_noun_construct</td></tr>
    <tr><td>Verbal stem</td><td class="mono">vs</td><td>Qal vs Nifal vs Hifil vs Hitpael</td><td class="mono">root_qal vs root_hit</td></tr>
    <tr><td>Verbal form</td><td class="mono">vt</td><td>Perfect / imperfect / wayyiqtol / imperative / infinitive</td><td class="mono">root_qal_wayq</td></tr>
    <tr><td>Person</td><td class="mono">ps</td><td>1st / 2nd / 3rd person distinctions when you need them</td><td class="mono">root_p3</td></tr>
  </table>

  <div class="callout">
    <b>Practical rule:</b> the suffix is determined by token tags, not by the gloss you expect. First identify the form, then build the homograph key. Same characters do <b>not</b> mean same key.
  </div>

  <h3>Engine lookup order — the exact key priority from <code>server.js</code></h3>
  <div class="rule-box">
    <p>The parser tries homograph keys in a fixed order. It first tries the <b>true root</b>, then the <b>display root</b>, then the <b>original raw Paleo surface</b>. For each of those, it tries these patterns from most specific to least specific:</p>
  </div>

  <table>
    <tr><th>Tier</th><th>Pattern</th><th>Meaning</th></tr>
    <tr><td class="mono">T1</td><td class="mono">root_pos_gender_number</td><td>Part of speech + gender + number</td></tr>
    <tr><td class="mono">T2</td><td class="mono">root_pos_gender</td><td>Part of speech + gender</td></tr>
    <tr><td class="mono">T3</td><td class="mono">root_pos_number</td><td>Part of speech + number</td></tr>
    <tr><td class="mono">T4</td><td class="mono">root_pos_state</td><td>Function + state</td></tr>
    <tr><td class="mono">T5</td><td class="mono">root_stem_form</td><td>Verb stem + form (e.g. <code>_qal_participle active</code>) ← <b>beats bare _verb</b></td></tr>
    <tr><td class="mono">T6</td><td class="mono">root_stem</td><td>Verb stem only (e.g. <code>_qal</code>, <code>_hifil</code>) ← overrides all forms of that stem</td></tr>
    <tr><td class="mono">T7</td><td class="mono">root_form</td><td>Verb form only (e.g. <code>_participle active</code>, <code>_wayyiqtol</code>)</td></tr>
    <tr><td class="mono">T8</td><td class="mono">root_pos</td><td>Part of speech only — general fallback (e.g. <code>_verb</code>, <code>_noun</code>)</td></tr>
    <tr><td class="mono">T9</td><td class="mono">root_surface_pos</td><td>Surface part of speech, when it differs from deep pos</td></tr>
    <tr><td class="mono">T10</td><td class="mono">root_gender_number</td><td>Gender + number, pos-agnostic</td></tr>
    <tr><td class="mono">T11</td><td class="mono">root_person</td><td>Person only (e.g. <code>_third person</code>)</td></tr>
  </table>

  <div class="example">
    <div class="example-title">Exact parser order in plain language</div>
    <div class="ex-parse">
      1. Recover <b>trueRoot</b> if stripping/mutation changes the lexical base.<br>
      2. Try all homograph keys for that root.<br>
      3. If no match, try the visible <b>displayRoot</b>.<br>
      4. If still no match, try the untouched <b>originalRawPaleo</b>.<br>
      5. If no homograph key matches, fall back to the normal lexicon.
    </div>
  </div>

  <h3>How to build the key</h3>
  <div class="strip-flow">
    <div class="strip-step"><div class="label">STEP 1</div><div class="code">recover base/root</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 2</div><div class="code">read pdp / sp</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 3</div><div class="code">add gn/nu/st if needed</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 4</div><div class="code">add vs/vt/ps if needed</div></div>
    <div class="strip-arrow">→</div>
    <div class="strip-step"><div class="label">STEP 5</div><div class="code">pick most specific key</div></div>
  </div>

  <h3>POS normalization — long names vs short codes</h3>
  <div class="callout">
    <b>Critical:</b> the DB stores <code>pos</code> as the full English word (<code>preposition</code>, <code>conjunction</code>, <code>article</code>, <code>verb</code>…). The engine normalizes these to short codes before routing. Your homograph keys must use the <b>short codes</b> — <code>_preposition</code>, <code>_conjunction</code>, <code>_art</code>, <code>_verb</code>, <code>_noun</code>, etc. — exactly as they appear in the suffix families table below. A key written as <code>𐤌𐤍𐤉_preposition</code> will <b>never match</b>; it must be <code>𐤌𐤍𐤉_preposition</code>.
  </div>

  <table>
    <tr><th>DB pos value (full word)</th><th>Normalized short code</th><th>Homograph suffix to use</th></tr>
    <tr><td class="mono">preposition</td><td class="mono">prep</td><td class="mono">_preposition</td></tr>
    <tr><td class="mono">conjunction</td><td class="mono">conj</td><td class="mono">_conjunction</td></tr>
    <tr><td class="mono">article</td><td class="mono">art</td><td class="mono">_article</td></tr>
    <tr><td class="mono">verb</td><td class="mono">verb</td><td class="mono">_verb</td></tr>
    <tr><td class="mono">noun / substantive</td><td class="mono">subs</td><td class="mono">_noun</td></tr>
    <tr><td class="mono">proper noun</td><td class="mono">nmpr</td><td class="mono">_proper noun (rarely needed)</td></tr>
    <tr><td class="mono">adjective</td><td class="mono">adjv</td><td class="mono">_adjective</td></tr>
    <tr><td class="mono">personal pronoun</td><td class="mono">prps</td><td class="mono">_personal pronoun</td></tr>
    <tr><td class="mono">demonstrative pronoun</td><td class="mono">prde</td><td class="mono">_demonstrative pronoun</td></tr>
    <tr><td class="mono">interrogative pronoun</td><td class="mono">prin</td><td class="mono">_interrogative pronoun</td></tr>
    <tr><td class="mono">adverb</td><td class="mono">advb</td><td class="mono">_adverb</td></tr>
    <tr><td class="mono">negation</td><td class="mono">nega</td><td class="mono">_negation</td></tr>
    <tr><td class="mono">interjection</td><td class="mono">intj</td><td class="mono">_interjection</td></tr>
  </table>

  <h3>Multi-character prepositions</h3>
  <div class="rule-box">
    <p><code>GRAMMAR_MAP.prep</code> only covers single-character prepositions (𐤁, 𐤋, 𐤌, 𐤊, etc.). Any multi-character preposition — such as <code>𐤌𐤍𐤉</code> ("from") or <code>𐤀𐤇𐤓</code> ("after") — will <b>not</b> be found there. The engine falls through to the lexicon, and if that also misses it, falls through to the homographs table. To guarantee a multi-char prep renders correctly, put it in <code>homographs.json</code> with the <code>_preposition</code> suffix.</p>
  </div>

  <div class="example">
    <div class="example-title">𐤌𐤍𐤉 — "From" (multi-character preposition)</div>
    <div class="ex-raw">verse=17|token_ordinal=3|word_raw=𐤌𐤍𐤉|part_of_speech=preposition|pdp=prep|…</div>
    <div class="ex-paleo">𐤉𐤍𐤌</div>
    <div class="ex-parse">
      <span class="t-p">pos = preposition → normalized to prep</span><br>
      <span class="t-p">isStandalonePos check: ✓ prep matches</span><br>
      GRAMMAR_MAP.prep[𐤌𐤍𐤉] → <b>undefined</b> (single-char map only)<br>
      homographs[<code>𐤌𐤍𐤉_preposition</code>] → <b>"From"</b> ✓<br><br>
      <b>Required entry in homographs.json:</b> <code>"𐤌𐤍𐤉_preposition": "From"</code>
    </div>
  </div>

  <div class="example">
    <div class="example-title">𐤀𐤇𐤓 — "after/following" (prep) vs "other" (noun)</div>
    <div class="ex-raw"><code>𐤀𐤇𐤓_preposition</code> = after/following &nbsp;|&nbsp; <code>𐤀𐤇𐤓_noun</code> = other</div>
    <div class="ex-paleo">𐤓𐤇𐤀</div>
    <div class="ex-parse">
      <span class="t-p">pos=preposition → prep</span> ⇒ choose <code>𐤀𐤇𐤓_preposition</code><br>
      <span class="t-n">pos=subs</span> ⇒ choose <code>𐤀𐤇𐤓_noun</code>
    </div>
  </div>

  <h3>Base suffix families</h3>
  <table>
    <tr><th>Token tag</th><th>Normal homograph family</th><th>Notes</th></tr>
    <tr><td class="mono">pdp=verb</td><td class="mono">_verb</td><td>Use for action sense when you only need category-level separation</td></tr>
    <tr><td class="mono">pdp=subs</td><td class="mono">_noun</td><td>Use for noun/substantive sense</td></tr>
    <tr><td class="mono">pdp=adjv</td><td class="mono">_adjective</td><td>Use for adjective sense</td></tr>
    <tr><td class="mono">pdp=preposition</td><td class="mono">_prepositionosition</td><td>Use for prepositional sense — required for all multi-character prepositions (e.g. <code>𐤌𐤍𐤉_preposition</code>)</td></tr>
    <tr><td class="mono">pdp=conjunction</td><td class="mono">_conjunctionunction</td><td>Use for conjunction / relative particle sense</td></tr>
    <tr><td class="mono">pdp=prde</td><td class="mono">_demonstrative pronoun</td><td>Use for demonstrative pronoun sense</td></tr>
    <tr><td class="mono">pdp=prps</td><td class="mono">_personal pronoun</td><td>Use for personal pronoun sense</td></tr>
    <tr><td class="mono">pdp=prin</td><td class="mono">_interrogative pronoun</td><td>Use for interrogative pronoun sense</td></tr>
    <tr><td class="mono">pdp=advb</td><td class="mono">_adverb</td><td>Use when you want to distinguish adverbial use explicitly</td></tr>
    <tr><td class="mono">sp=proper noun / pdp=proper noun</td><td class="mono">usually no homograph key</td><td>Proper names normally stay in the lexicon as names rather than homograph-class lookups</td></tr>
  </table>

  <h3>How to choose between <code>𐤀𐤃𐤌_...</code> variations</h3>
  <div class="example">
    <div class="example-title">Case A — 𐤀𐤃𐤌 as a proper name</div>
    <div class="ex-raw">Genesis 4:25 → <code>𐤀𐤃𐤌|nmpr|sp=nmpr|pdp=nmpr|gn=m|nu=sg|st=a</code></div>
    <div class="ex-paleo">𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-n">sp=nmpr</span>
      <span class="t-n">pdp=nmpr</span>
      ⇒ this is <b>Adam the person</b>. Do <b>not</b> force a noun or verb homograph key here unless you intentionally create a name-specific override. In the normal workflow, this stays a <b>lexicon/name entry</b>, not <code>𐤀𐤃𐤌_noun</code> or <code>𐤀𐤃𐤌_verb</code>.
    </div>
  </div>

  <div class="example">
    <div class="example-title">Case B — 𐤀𐤃𐤌 as common noun</div>
    <div class="ex-raw">Genesis 1:25 style case → <code>sp=subs|pdp=subs</code></div>
    <div class="ex-paleo">𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-n">sp=subs</span>
      <span class="t-n">pdp=subs</span>
      ⇒ choose a noun-family key such as <code>𐤀𐤃𐤌_noun</code> if you need to override the default noun sense. If you need a tighter distinction, the parser can also honor more specific forms like <code>𐤀𐤃𐤌_noun_masculine_singular</code> or <code>𐤀𐤃𐤌_noun_absolute</code>.
    </div>
  </div>

  <div class="example">
    <div class="example-title">Case C — 𐤀𐤃𐤌 as verb/root sense</div>
    <div class="ex-raw"><code>homographs.json</code> already contains <code>𐤀𐤃𐤌_verb</code> = dyed red.</div>
    <div class="ex-paleo">𐤀𐤃𐤌</div>
    <div class="ex-parse">
      <span class="t-v">sp=verb</span>
      <span class="t-v">pdp=verb</span>
      ⇒ choose <code>𐤀𐤃𐤌_verb</code>. If later you need to distinguish a specific stem or form, you can add entries such as <code>𐤀𐤃𐤌_qal</code>, <code>𐤀𐤃𐤌_qal_perfect</code>, or <code>𐤀𐤃𐤌_third person</code> because the parser checks those patterns too.
    </div>
  </div>

  <div class="rule-box">
    <p><b>Adam key decision summary:</b></p>
    <p>
      <code>sp=nmpr / pdp=nmpr</code> → person/name → use normal name/lexicon handling<br>
      <code>pdp=subs</code> → noun-family key → start with <code>𐤀𐤃𐤌_noun</code><br>
      <code>pdp=verb</code> → verb-family key → use <code>𐤀𐤃𐤌_verb</code><br>
      article token <code>𐤄|art</code> + <code>𐤀𐤃𐤌|subs</code> → still noun-family, but definite in translation; the article itself is <b>not</b> the homograph suffix.
    </p>
  </div>

  <h3>When should you stop at <code>_noun</code> or <code>_verb</code>, and when should you go more specific?</h3>
  <table>
    <tr><th>If the ambiguity is resolved by…</th><th>Use this key depth</th><th>Example</th></tr>
    <tr><td>Only the basic word class</td><td class="mono">root_pdp</td><td class="mono">𐤃𐤓𐤊_noun vs 𐤃𐤓𐤊_verb</td></tr>
    <tr><td>Gender matters</td><td class="mono">root_pdp_gn</td><td class="mono">𐤔𐤍𐤄_noun_f</td></tr>
    <tr><td>Gender + number matter</td><td class="mono">root_pdp_gn_nu</td><td class="mono">root_noun_masculine_plural</td></tr>
    <tr><td>Construct vs absolute matters</td><td class="mono">root_pos_state</td><td class="mono">root_noun_construct</td></tr>
    <tr><td>Verb stem/form matters</td><td class="mono">root_stem_form</td><td class="mono">root_qal_perfectect</td></tr>
    <tr><td>You only need stem</td><td class="mono">root_stem</td><td class="mono">root_hitpael</td></tr>
    <tr><td>You only need person</td><td class="mono">root_person</td><td class="mono">root_third person</td></tr>
  </table>

  <div class="callout">
    <b>Best practice:</b> create the <b>least specific key that truly solves the ambiguity</b>. Do not jump straight to long keys unless a shorter key still leaves two live meanings.
  </div>

  <h3>Examples from current homographs</h3>
  <div class="example">
    <div class="example-title">𐤍𐤐𐤔</div>
    <div class="ex-raw"><code>𐤍𐤐𐤔_noun</code> = living being / soul; <code>𐤍𐤐𐤔_verb</code> = refresh / breathe</div>
    <div class="ex-paleo">𐤍𐤐𐤔</div>
    <div class="ex-parse">
      <span class="t-n">sp=subs</span> ⇒ choose <code>𐤍𐤐𐤔_noun</code><br>
      <span class="t-v">sp=verb</span> ⇒ choose <code>𐤍𐤐𐤔_verb</code>
    </div>
  </div>

  <div class="example">
    <div class="example-title">𐤔𐤍𐤄</div>
    <div class="ex-raw">Current file already has <code>𐤔𐤍𐤄_noun</code>, <code>𐤔𐤍𐤄_verb</code>, <code>𐤔𐤍𐤄_noun_feminine</code>, and <code>𐤔𐤍𐤄_verb_feminineeminine</code>.</div>
    <div class="ex-paleo">𐤔𐤍𐤄</div>
    <div class="ex-parse">
      word class resolves the first split: <code>_noun</code> vs <code>_verb</code>.<br>
      if feminine tagging is what matters in your data, use the tighter key: <code>_noun_feminine</code> or <code>_verb_feminine</code>.
    </div>
  </div>

  <div class="example">
    <div class="example-title">𐤀𐤔𐤓</div>
    <div class="ex-raw"><code>𐤀𐤔𐤓_conjunction</code> = who/that; <code>𐤀𐤔𐤓_noun</code> = blessed</div>
    <div class="ex-paleo">𐤀𐤔𐤓</div>
    <div class="ex-parse">
      <span class="t-p">sp=conj</span> or <span class="t-p">pdp=conj</span> ⇒ choose <code>𐤀𐤔𐤓_conjunction</code><br>
      <span class="t-n">sp=subs</span> or <span class="t-n">pdp=subs</span> ⇒ choose <code>𐤀𐤔𐤓_noun</code>
    </div>
  </div>

  <div class="example">
    <div class="example-title">𐤌𐤍𐤉 — multi-character preposition (requires homograph entry)</div>
    <div class="ex-raw"><code>𐤌𐤍𐤉_preposition</code> = From</div>
    <div class="ex-paleo">𐤉𐤍𐤌</div>
    <div class="ex-parse">
      <span class="t-p">pos=preposition → normalized to prep</span><br>
      GRAMMAR_MAP.prep has no entry for 𐤌𐤍𐤉 (single-character keys only)<br>
      → falls through to homograph lookup<br>
      <span class="t-p">pdp=prep</span> ⇒ matches <code>𐤌𐤍𐤉_preposition</code> ✓<br><br>
      <b>Rule:</b> any preposition longer than one character must live in <code>homographs.json</code> with the <code>_preposition</code> suffix.
    </div>
  </div>

  <h3>Checklist before creating or selecting a homograph key</h3>
  <table>
    <tr><th>Question</th><th>Why it matters</th></tr>
    <tr><td>What are <code>sp</code> and <code>pdp</code>?</td><td>These are the main splitters for same-letter forms.</td></tr>
    <tr><td>Do <code>gn</code>, <code>nu</code>, or <code>st</code> distinguish the meanings?</td><td>If yes, make or select a more specific key than plain <code>_noun</code>/<code>_verb</code>.</td></tr>
    <tr><td>Is the token really a name (<code>nmpr</code>) rather than a homograph-class word?</td><td>Names usually stay in the lexicon instead of the homograph table.</td></tr>
    <tr><td>Did affix stripping change the lexical base?</td><td>The parser may match on <b>trueRoot</b> before the visible surface, so build the key on the recovered base when appropriate.</td></tr>
    <tr><td>Would a shorter key already solve it?</td><td>Prefer the least specific key that still distinguishes the meaning.</td></tr>
  </table>

  <div class="callout">
    <b>Safe workflow for any same-character word:</b> inspect raw token → identify <code>sp</code>/<code>pdp</code> → note gender/number/state or stem/form if relevant → recover lexical base/root → choose the shortest homograph key that uniquely identifies the meaning.
  </div>
</section>

<!-- ════════════════════════════ MUTATIONS ════════════════════════════ -->
<section class="section" id="mutations">
  <h2>Root mutation patterns</h2>
  <p class="section-sub">What phonological processes produce a surface root different from the dictionary root</p>

  <table>
    <tr><th>Category</th><th>Rule</th><th>Examples</th></tr>
    <tr><td><b>Hollow (Ayin-Waw)</b></td><td>Medial Waw contracts out in conjugation. 2-letter surface → restore Waw.</td><td>𐤉𐤌→𐤉𐤅𐤌, 𐤔𐤁→𐤔𐤅𐤁, 𐤒𐤌→𐤒𐤅𐤌, 𐤌𐤀𐤓→𐤌𐤀𐤅𐤓</td></tr>
    <tr><td><b>Hollow (Ayin-Yad)</b></td><td>Medial Yad contracts. 2-letter surface → restore Yad.</td><td>𐤔𐤌→𐤔𐤉𐤌, 𐤓𐤍→𐤓𐤉𐤍</td></tr>
    <tr><td><b>Lamed-Hay</b></td><td>Final Hay drops in most forms. 2-letter surface → restore Hay.</td><td>𐤏𐤔→𐤏𐤔𐤄, 𐤓𐤀→𐤓𐤀𐤄, 𐤄𐤉→𐤄𐤉𐤄, 𐤔𐤍→𐤔𐤍𐤄</td></tr>
    <tr><td><b>Pe-Nun</b></td><td>Initial Nun assimilates into following consonant. 2-letter surface → restore Nun.</td><td>𐤔𐤀→𐤍𐤔𐤀, 𐤐𐤋→𐤍𐤐𐤋, 𐤐𐤔→𐤍𐤐𐤔, 𐤐𐤇→𐤍𐤐𐤇</td></tr>
    <tr><td><b>Pe-Yad</b></td><td>Initial Yad elides in imperfect/inf. 2-letter surface → restore Yad.</td><td>𐤃𐤏→𐤉𐤃𐤏, 𐤑𐤀→𐤉𐤑𐤀, 𐤓𐤃→𐤉𐤓𐤃</td></tr>
    <tr><td><b>Pe-Yad wayyiqtol</b></td><td>Waw-consecutive absorbs Yad; surface starts 𐤅. After pfm strips first 𐤅, residual 𐤅 = absorbed Yad.</td><td>𐤅𐤓𐤔→𐤉𐤓𐤔, 𐤅𐤃𐤏→𐤉𐤃𐤏</td></tr>
    <tr><td><b>Hitpael hollow doubled</b></td><td>Hitpael of hollow root: Waw contracts AND final radical doubles.</td><td>𐤁𐤔𐤔→𐤁𐤅𐤔, 𐤊𐤍𐤍→𐤊𐤅𐤍, 𐤔𐤁𐤁→𐤔𐤅𐤁</td></tr>
    <tr><td><b>Hifil matres lectionis</b></td><td>Hifil impf/ptca writes characteristic vowel with Yad (hireq yod). Extra Yad is vocalic, not radical.</td><td>𐤁𐤃𐤉𐤋→𐤁𐤃𐤋, 𐤆𐤓𐤉𐤏→𐤆𐤓𐤏, 𐤀𐤉𐤓→𐤀𐤅𐤓</td></tr>
    <tr><td><b>Hifil contracted impf</b></td><td>pfm(T/T=) + Hifil 𐤄 fuse into one letter. vbs=H present but 𐤄 not in word_raw.</td><td>𐤕𐤔𐤉𐤁→𐤔𐤅𐤁, 𐤕𐤃𐤔𐤀 (root 𐤃𐤔𐤀)</td></tr>
    <tr><td><b>Lamed-Hay residuals</b></td><td>After vbe strips the terminal Hay, 3fs afformative Thaw remains attached.</td><td>𐤄𐤉𐤕→𐤄𐤉𐤄, 𐤏𐤔𐤕→𐤏𐤔𐤄</td></tr>
  </table>
</section>

<!-- ════════════════════════════ EDGE CASES ════════════════════════════ -->
<section class="section" id="edge-cases">
  <h2>Edge cases &amp; gotchas</h2>

  <table>
    <tr><th>Situation</th><th>What it looks like</th><th>How to handle</th></tr>
    <tr><td><b>sp ≠ pdp</b></td><td>sp=verb, pdp=subs (participle used as noun) or sp=subs, pdp=prep (noun used prepositionally)</td><td>Translation key uses pdp. Display label uses sp. Both are shown.</td></tr>
    <tr><td><b>Empty word_raw art token</b></td><td>verse|ord||art|sp=art…</td><td>Article is phonologically fused to following noun. Skip empty word_raw silently; the visual merge happens through the pendingComponents queue.</td></tr>
    <tr><td><b>advb masquerading as subs</b></td><td>sp=subs, pdp=advb (e.g. 𐤌𐤏𐤈 "a little", 𐤌𐤀𐤃 "very")</td><td>pdp=advb means it functions as an adverb. Translation from lexicon under the subs form is usually fine.</td></tr>
    <tr><td><b>Infinitive construct + suffix</b></td><td>infc + prs=K or prs=H (subject of infinitive)</td><td>prs suffix on infc = the subject ("in his going") not possessive. Label as "his" but context implies subject.</td></tr>
    <tr><td><b>𐤄 as article vs. interrogative vs. Nifal impv prefix</b></td><td>All look like 𐤄 in word_raw</td><td>pos=art → article; pos=inrg → interrogative "?"; pos=verb + pfm=H + vbs=N → Nifal imperative prefix. The sp field distinguishes them.</td></tr>
    <tr><td><b>Nifal of Pe-Nun root</b></td><td>vbs=N but no extra Nun in word_raw (e.g. 𐤉𐤍𐤐𐤔)</td><td>The root Nun and Nifal Nun merge into one. After pfm strips 𐤉 and vbs strips 𐤍, display root 𐤐𐤔 maps back to 𐤍𐤐𐤔 via MUTATED_ROOTS.</td></tr>
    <tr><td><b>Construct chain with article</b></td><td>st=c noun followed by art + noun</td><td>The article belongs to the absolute noun, not the construct. Visually they are separate tokens but semantically they form one genitive unit.</td></tr>
    <tr><td><b>𐤁𐤅𐤀 vs 𐤁𐤅 residual</b></td><td>Both in MUTATED_ROOTS → 𐤁𐤅𐤀</td><td>𐤁𐤅𐤀 is the full lexical form. 𐤁𐤅 is the shortened residual after prefix stripping. Both map to the same root "to come".</td></tr>
    <tr><td><b>vt=wayq vs vt=perf with vbe=W</b></td><td>3mp wayyiqtol: pfm=J + vbe=W. 3mp perf: pfm=absent + vbe=W</td><td>Wayyiqtol always has pfm=J AND vt=wayq. Perfect 3mp has vt=perf and vbe=W but no pfm. Don't confuse them.</td></tr>
    <tr><td><b>Hitpael sibilant transposition</b></td><td>vbs=HCT or HT + root starts with 𐤔𐤎𐤑𐤆</td><td>The 𐤕 transposes before the sibilant: 𐤄𐤕𐤔 → 𐤄𐤔𐤕. Engine strips bare 𐤕 from start after pfm. Pattern: pfm strips first letter, then 𐤕 is at position 0 of remainder.</td></tr>
  </table>
</section>
`;
