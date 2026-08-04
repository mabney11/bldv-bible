// tokenLabels.js — descriptive labels for raw BHS token fields, used when
// rendering the "{ } descriptive raw tokens" textarea in the Hebrew viewer.

export const TOKEN_FIELD_LABELS = {
  verse:'verse',
  token_ordinal:'token_ordinal',
  word_raw:'word_raw',
  pos:'part_of_speech',
  sp:'speech_part',
  pdp:'parser_part_of_speech',
  gn:'gender',
  nu:'number',
  st:'state',
  prs:'pronominal_suffix',
  uvf:'unclassified_final',
  vs:'verbal_stem',
  vt:'verbal_tense_form',
  ps:'person',
  pfm:'prefix_marker',
  vbs:'verbal_stem_marker',
  nme:'nominal_ending',
  vbe:'verbal_ending',
};

export const TOKEN_VALUE_LABELS = {
  pos: {
    adjv:'adjective', advb:'adverb', art:'article', conj:'conjunction',
    inrg:'interrogative', intj:'interjection', nega:'negative',
    nmpr:'proper_name', prep:'preposition', prde:'demonstrative_pronoun',
    prin:'interrogative_pronoun', prps:'personal_pronoun', subs:'noun', verb:'verb',
  },
  sp: {
    adjv:'adjective', advb:'adverb', art:'article', conj:'conjunction',
    inrg:'interrogative', intj:'interjection', nega:'negative',
    nmpr:'proper_name', prep:'preposition', prde:'demonstrative_pronoun',
    prin:'interrogative_pronoun', prps:'personal_pronoun', subs:'noun', verb:'verb',
  },
  pdp: {
    adjv:'adjective', advb:'adverbial_use', art:'article', conj:'conjunction',
    inrg:'interrogative', intj:'interjection', nega:'negative',
    nmpr:'proper_name', prep:'preposition', prde:'demonstrative_pronoun',
    prin:'interrogative_pronoun', prps:'personal_pronoun', subs:'noun', verb:'verb',
  },
  gn: { m:'masculine', f:'feminine', c:'common' },
  nu: { sg:'singular', pl:'plural', du:'dual' },
  st: { a:'absolute', c:'construct', d:'determined' },
  vs: {
    qal:'qal', nif:'nifal', piel:'piel', pual:'pual', hif:'hifil', hof:'hofal',
    hit:'hitpael', htpo:'hitpolel', hotp:'hotpaal', poel:'poel', polel:'polel',
    poal:'poal', polal:'polal', hith:'hishtaphel', pasq:'passive_qal',
  },
  vt: {
    perf:'perfect', impf:'imperfect', wayq:'wayyiqtol', impv:'imperative',
    infc:'infinitive_construct', infa:'infinitive_absolute',
    ptca:'participle_active', ptcp:'participle_passive',
  },
  ps: { p1:'first_person', p2:'second_person', p3:'third_person' },
  pfm: {
    J:'3ms_prefix_(he/it)', 'T':'2ms/2fs/3fs_prefix', 'T=':'2ms/2fs/3fs_prefix',
    '>':'1cs_prefix_(I)', '<':'1cs_prefix_(I)', N:'1cp_prefix_(we)', M:'participle_mem_prefix',
  },
  vbs: {
    H:'hifil_marker_(causative)', N:'nifal_marker', HT:'hitpael_marker_(reflexive)',
    HCT:'hitpael_marker_(reflexive)',
  },
  prs: {
    J:'1cs_(my/me)', NJ:'1cs_(me)', NW:'1cp_(our/us)', K:'2ms_(your/you)',
    KM:'2mp_(your/you_pl)', KN:'2fp_(your/you_fpl)', W:'3ms_(his/him)', HW:'3ms_(his/him)',
    H:'3fs_(her)', M:'3mp_(them)', HM:'3mp_(them)', N:'3fp_(them_f)', HN:'3fp_(them_f)',
  },
  uvf: { H:'directional_he', J:'paragogic_yod', N:'paragogic_nun' },
  nme: {
    H:'he_ending', T:'feminine_tav_ending', J:'construct_or_1cs_yod', 'J=':'construct_or_1cs_yod',
    JM:'masculine_plural_ending', 'JM=':'masculine_plural_ending', WT:'feminine_plural_ending',
    WTJ:'feminine_plural_construct_ending', NH:'feminine_plural_pronominal_ending',
  },
  vbe: {
    TJ:'1cs_verbal_ending', NW:'1cp_verbal_ending', T:'2fs_or_3fs_verbal_ending',
    TM:'2mp_verbal_ending', TN:'2fp_verbal_ending', W:'3mp_verbal_ending',
    WN:'3fp_verbal_ending', NH:'3fp_verbal_ending', H:'3fs_verbal_ending', 'H=':'3fs_verbal_ending',
  },
};

export function describeTokenValue(key, value) {
  if (value == null || value === '') return '';
  if (value === 'absent') return 'none';
  const table = TOKEN_VALUE_LABELS[key];
  if (table && table[value]) return table[value];
  return value;
}

export function parseMorphString(morph) {
  if (!morph) return [];
  return morph.split('|').map(part => {
    const eq = part.indexOf('=');
    return eq === -1
      ? { key: part, value: '' }
      : { key: part.slice(0, eq), value: part.slice(eq + 1) };
  });
}

export function formatTokenRowDescriptive(r) {
  const parts = [
    `${TOKEN_FIELD_LABELS.verse}=${r.verse}`,
    `${TOKEN_FIELD_LABELS.token_ordinal}=${r.token_ordinal}`,
    `${TOKEN_FIELD_LABELS.word_raw}=${r.word_raw || ''}`,
    `${TOKEN_FIELD_LABELS.pos}=${describeTokenValue('pos', r.pos || '')}`,
  ];
  parseMorphString(r.morph || '').forEach(({ key, value }) => {
    const label = TOKEN_FIELD_LABELS[key] || key;
    parts.push(`${label}=${describeTokenValue(key, value)}`);
  });
  return parts.join('|');
}

export const TRANSLIT_DATA = [
  {g:'𐤀',n:'Alap',   med:'a',   fin:'a'},   {g:'𐤁',n:'Bayath', med:'ba',  fin:'b'},
  {g:'𐤂',n:'Gamal',  med:'ga',  fin:'g'},   {g:'𐤃',n:'Dalath', med:'da',  fin:'d'},
  {g:'𐤄',n:'Hay',    med:'ha',  fin:'h'},   {g:'𐤅',n:'Waw',    med:'wa',  fin:'w'},
  {g:'𐤆',n:'Zayan',  med:'za',  fin:'z'},   {g:'𐤇',n:'Chayath',med:'cha', fin:'ch'},
  {g:'𐤈',n:'Tayath', med:'ta',  fin:'t'},   {g:'𐤉',n:'Yad',    med:'ya',  fin:'y'},
  {g:'𐤊',n:'Kap',    med:'ka',  fin:'k'},   {g:'𐤋',n:'Lamad',  med:'la',  fin:'l'},
  {g:'𐤌',n:'Mayam',  med:'ma',  fin:'m'},   {g:'𐤍',n:'Nawan',  med:'na',  fin:'n'},
  {g:'𐤎',n:'Samak',  med:'sa',  fin:'s'},   {g:'𐤏',n:'Iyan',   med:'i',   fin:'i'},
  {g:'𐤐',n:'Pah',    med:'pa',  fin:'p'},   {g:'𐤑',n:'Tzaday', med:'tza', fin:'tz'},
  {g:'𐤒',n:'Qap',    med:'qa',  fin:'q'},   {g:'𐤓',n:'Rash',   med:'ra',  fin:'r'},
  {g:'𐤔',n:'Shayan', med:'sha', fin:'sh'},  {g:'𐤕',n:'Thaw',   med:'tha', fin:'th'},
];
