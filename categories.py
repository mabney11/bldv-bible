#!/usr/bin/env python3
"""Single source of truth for content categories, so anything can be filtered
out cleanly. categorize(rec) -> one of:
  scripture | deuterocanon | pseudepigrapha | nt-apocrypha |
  apostolic-fathers | patristic | classical | ethiopic-literary
Removal is then: keep/drop by corpus, category, src, or work."""
import re
GEEZ_CANON={'GEN','EXOD','LEV','NUM','DEUT','JOSH','JUDG','RUTH','1SAM','2SAM','1KGS','2KGS',
 '1CHR','2CHR','EZRANEH','EST','JOB','PSA','PROV','ECCL','SONG','ISA','JER','LAM','BAR','EPJER',
 'EZK','DAN','HOS','JOEL','AMO','OBA','JONAH','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','TOB',
 'JDT','SIR','WIS','1MEQ','2MEQ','3MEQ','1EN','JUB','4BAR','APEZ','MAT','MRK','LUK','JHN','ACT',
 'ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS',
 '1PE','2PE','1JN','2JN','3JN','JUD','REV'}
LXX_DEUTERO={'Tob','Tbs','Jdt','Wis','Sir','Sip','Bar','Epj','1Ma','2Ma','3Ma','4Ma',
 'Sus','Sut','Bel','Bet','1Es','2Es','Dat','AddEsth','PrMan'}
LXX_PSEUD={'1En','Pss','Ode'}
AF=re.compile(r'didach|clement|clemen|ignat|polycarp|barnab|herma|diognet|martyr',re.I)
NTA=re.compile(r'(gospel|evangel|acts|acta|apocaly).{0,40}(thomas|peter|paul|john|andrew|james|pilate|nicodemus|mary|infan)|protevangel',re.I)
PSEU=re.compile(r'enoch|henoch|jubile|testament|sibyl|aristeas|aseneth|\badam\b|abraham|esdras|esdrae|psalms? of solomon|\bodes?\b',re.I)
SCRIP_URN=re.compile(r'tlg0527|tlg0031')

def categorize(rec):
    corp=rec.get('corpus'); book=rec.get('book') or ''; work=rec.get('work') or ''
    title=(rec.get('title') or '')+' '+(rec.get('author') or '')
    if corp=='GNT': return 'scripture'
    if corp=='LXX':
        if book in LXX_PSEUD: return 'pseudepigrapha'
        if book in LXX_DEUTERO: return 'deuterocanon'
        return 'scripture'
    if corp=='GEZ':
        if book in GEEZ_CANON:
            if book in {'1EN','JUB','1MEQ','2MEQ','3MEQ','4BAR','APEZ'}: return 'pseudepigrapha'
            if book in {'TOB','JDT','SIR','WIS','BAR','EPJER'}: return 'deuterocanon'
            return 'scripture'
        return 'ethiopic-literary'

    if corp=='HEB':
        if book in GEEZ_CANON and book not in {'1EN','JUB','1MEQ','2MEQ','3MEQ','4BAR','APEZ','TOB','JDT','SIR','WIS','BAR','EPJER','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'}:
            return 'scripture'
        if book in {'1MAC','2MAC','3MAC','4MAC'}: return 'deuterocanon'
        if book in {'JUB','1EN','TEST12','ARISTEAS','MEGANT'}: return 'pseudepigrapha'
        return rec.get('cat') or 'hebrew-literary'
    if corp=='LAT':
        return rec.get('cat') or 'classical'      # patristic (CSEL) / classical (Perseus)
    if corp=='GRC':
        if SCRIP_URN.search(work): return 'scripture'
        if AF.search(title): return 'apostolic-fathers'
        if NTA.search(title): return 'nt-apocrypha'
        if PSEU.search(title): return 'pseudepigrapha'
        return 'patristic' if rec.get('cat')=='biblical' else 'classical'
    return 'unknown'
