#!/usr/bin/env python3
"""Family KITAS all-ten-locale editorial QA.
Structural/document integrity and salient facts, NOT native/legal/browser/production QA.
Run: python QA/validate_bundle.py --self-test
"""
from pathlib import Path
from collections import Counter
import sys, re, json, hashlib, copy, argparse
ROOT=Path(__file__).resolve().parent.parent
MAP=[('01_FAMILY_KITAS_MAIN_RU_v1.md','01_FAMILY_KITAS_MAIN_{code}.md'),
 ('02_FAMILY_SPOUSE_E31B_RU_v1.md','02_FAMILY_SPOUSE_E31B_{code}.md'),
 ('03_CHILD_E31E_RU_v1.md','03_CHILD_E31E_{code}.md'),
 ('04_PARENTS_E31H_RU_v1.md','04_PARENTS_E31H_{code}.md'),
 ('05_DOCUMENTS_KNOWLEDGE_RU_v1.md','05_DOCUMENTS_KNOWLEDGE_{code}.md')]
LANGS={
 'RU':('ru','Частые вопросы','ltr',''),
 'EN':('en','Frequently Asked Questions','ltr','/en'),
 'DE':('de','Häufige Fragen','ltr','/de'),
 'ZH-HANS':('zh-Hans','常见问题','ltr','/zh-cn'),
 'KO':('ko','자주 묻는 질문','ltr','/ko'),
 'FR':('fr','Questions fréquentes','ltr','/fr'),
 'JA':('ja','よくある質問','ltr','/ja'),
 'HI':('hi','अक्सर पूछे जाने वाले प्रश्न','ltr','/hi'),
 'ES':('es','Preguntas frecuentes','ltr','/es'),
 'AR':('ar','الأسئلة الشائعة','rtl','/ar')}
LINKS=re.compile(r'\]\((/[^)# ]+)(?:#[^)]*)?\)')
CODES=re.compile(r'(?<![A-Za-z0-9])(?:E31A|E31B|E31E|E31H|E33G|E28A|E23)(?![A-Za-z0-9])')
FIELDS=['Status','Content intent','Proposed route','SEO title','SEO description','Last editorial review']
SCRIPT={'ZH-HANS':r'[\u4e00-\u9fff]','KO':r'[\uac00-\ud7a3]','JA':r'[\u3040-\u30ff\u4e00-\u9fff]','HI':r'[\u0900-\u097f]','AR':r'[\u0600-\u06ff]'}

def sha(x): return hashlib.sha256(x.encode('utf-8')).hexdigest()
def statistics(s,faq_title):
    lines=s.splitlines();faq=False;qs=[];answers=[]
    for i,x in enumerate(lines):
        if x.startswith('## '):faq=(x=='## '+faq_title)
        if faq and x.startswith('### '):
            qs.append(x[4:]); j=i+1
            while j<len(lines) and not lines[j].strip():j+=1
            answers.append(j<len(lines) and not lines[j].startswith('#') and bool(lines[j].strip()))
    return {'h1':len(re.findall(r'^# ',s,re.M)),'h2':len(re.findall(r'^## ',s,re.M)),
        'h3':len(re.findall(r'^### ',s,re.M)), 'bullets':len(re.findall(r'^- ',s,re.M)),
        'ordered':len(re.findall(r'^\d+\. ',s,re.M)), 'table_rows':len(re.findall(r'^\|',s,re.M)),
        'links':Counter(LINKS.findall(s)),'codes':set(CODES.findall(s)),
        'faq':len(qs),'faq_answers_all':all(answers),
        'meta':all(('**'+k+':**') in s for k in FIELDS),
        'cta': '**Primary button:**' in s or '**Основная кнопка:**' in s,
        'safrway':s.count('SAFRWAY')}

def validate_text(ru,s,language,page_num):
    _,faq_title,_,_=LANGS[language]
    ref=statistics(ru,'Частые вопросы');cur=statistics(s,faq_title);issues=[]
    for field in ('h1','h2','h3','bullets','ordered','table_rows','faq'):
        if ref[field]!=cur[field]:issues.append(f'{field}: {cur[field]} != {ref[field]}')
    if ref['links']!=cur['links']:issues.append('internal URL/multiplicity mismatch')
    if ref['codes']!=cur['codes']:issues.append('visa-code-set mismatch')
    if not cur['faq_answers_all']:issues.append('FAQ answer empty')
    if not cur['meta']:issues.append('metadata key missing')
    if not cur['cta']:issues.append('primary CTA missing')
    if cur['safrway']<2:issues.append('brand reference insufficient')
    if not s.startswith('# ') or not s.endswith('\n'):issues.append('file boundary invalid')
    if re.search(r'[А-Яа-яЁё]{8,}',s) and language!='RU':issues.append('Russian untranslated prose')
    if language in SCRIPT and len(re.findall(SCRIPT[language],s))<400:issues.append('target writing system insufficient')
    if language in ('EN','DE','FR','ES') and len(s.split())<min(460,len(ru.split())*.53):issues.append('unusually short translation')
    if page_num==1:
        for c in ('E31A','E31B','E31E','E31H','E33G','18'):
            if c not in s:issues.append('missing hub condition '+c)
    if page_num==2:
        for c in ('E31A','E31B','E33G'):
            if c not in s:issues.append('missing spouse condition '+c)
        # Chinese expresses 12/14 million as 1200万/1400万; both are equivalent.
        if not ('12/14' in s or (language=='ZH-HANS' and '1200 万' in s and '1400 万' in s)):
            issues.append('missing spouse explanation of principal E33G 12/14m')
    if page_num==3:
        for c in ('E31E','E33G','18'):
            if c not in s:issues.append('missing child condition '+c)
    if page_num==4:
        for c in ('E31H','E33G'):
            if c not in s:issues.append('missing parent condition '+c)
    if page_num==5:
        for c in ('E31A','E31B','E31E','E31H','E28A','E23','E33G','12','18','6'):
            if c not in s:issues.append('missing document condition '+c)
        if not re.search(r'(2[ ,.\u00a0]?000)',s):issues.append('missing USD 2000 example')
    return issues,cur

def test_record_import(payload):
    errors=[]
    if len(payload.get('records',[]))!=50:errors.append('record count != 50')
    keyset=set()
    for r in payload.get('records',[]):
        ident=(r.get('content_key_proposed'),r.get('locale'))
        if ident in keyset:errors.append('duplicate content/locale record '+str(ident))
        keyset.add(ident)
        if r.get('direction')!=('rtl' if r.get('locale')=='ar' else 'ltr'):errors.append('wrong direction '+str(ident))
        if r.get('pricing_ref')!='QUOTE_ONLY_NO_APPROVED_FIXED_FAMILY_RATE':errors.append('unapproved fixed family pricing '+str(ident))
        if r.get('faq_rendering')!='ALREADY_IN_BODY_DO_NOT_APPEND_DUPLICATE':errors.append('FAQ double-render risk')
        if r.get('body_contains_metadata') is not False:errors.append('metadata risk')
        if not r.get('source_file'):errors.append('missing source_file')
        if 'body_sha256' not in r or sha(r['body_markdown'])!=r['body_sha256']:errors.append('bad body SHA')
        if r.get('route_is_final') is not False:errors.append('unverified live route marked final')
        if r.get('locale')=='ar' and not r.get('proposed_localized_route','').startswith('/ar/'):errors.append('Arabic route missing prefix')
    return errors

def validate_files():
    problems=[];records=[];counterFAQ=0;counterlinks=0
    for j,(ru_name,pattern) in enumerate(MAP,1):
        ru=(ROOT/'RU'/ru_name).read_text(encoding='utf-8')
        for lang in LANGS:
            if lang=='RU':continue
            fp=ROOT/lang/pattern.format(code=lang)
            if not fp.exists():problems.append('MISSING '+str(fp));continue
            s=fp.read_text(encoding='utf-8');errs,x=validate_text(ru,s,lang,j)
            problems.extend(str(fp.relative_to(ROOT))+': '+m for m in errs)
            counterFAQ+=x['faq'];counterlinks+=sum(x['links'].values())
            records.append({'file':str(fp.relative_to(ROOT)),'locale':LANGS[lang][0],
             'sha256':sha(s),'h2':x['h2'],'h3':x['h3'],'faq':x['faq'],
             'links':sum(x['links'].values()),'issues':errs})
    import_data=json.loads((ROOT/'CONTENT_LOCALIZED_IMPORT.json').read_text(encoding='utf-8'))
    problems.extend(test_record_import(import_data))
    imp={(r['content_key_proposed'],r['locale']):r for r in import_data['records']}
    for original,pattern,key,_,_ in [
      (MAP[0][0],MAP[0][1],'family-kitas',None,None),
      (MAP[1][0],MAP[1][1],'family-kitas-spouse',None,None),
      (MAP[2][0],MAP[2][1],'child-kitas',None,None),
      (MAP[3][0],MAP[3][1],'family-kitas-parents',None,None),
      (MAP[4][0],MAP[4][1],'family-kitas-documents',None,None)]:
        ru=(ROOT/'RU'/original).read_text(encoding='utf-8')
        for directory,(locale,_,_,_) in LANGS.items():
            rec=imp.get((key,locale))
            if rec is None: problems.append(f'MISSING STAGING RECORD {key}/{locale}');continue
            if rec['canonical_ru_sha256']!=sha(ru):problems.append(f'RU SHA DIFFERENCE {key}/{locale}')
            p=ROOT/rec['source_file']
            if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=rec['source_file_sha256']:
               problems.append(f'SOURCE FILE SHA DIFFERENCE {key}/{locale}')
    return {'status':'PASS' if not problems else 'FAIL','source_ru_pages':5,'foreign_languages':9,
         'translated_pages':len(records),'faq_translated_total':counterFAQ,
         'internal_link_occurrences':counterlinks,'import_records':len(import_data['records']),
         'issues':problems,'page_records':records,
         'limitations':'Structural, code, links, numeric sample, script and checksum validation. No human/native, legal, renderer or Google index QA.'}

def adversarial_tests():
  src=(ROOT/'RU'/MAP[0][0]).read_text(encoding='utf-8');translation=(ROOT/'AR'/MAP[0][1].format(code='AR')).read_text(encoding='utf-8')
  cases=[]
  changes=[
    ('deleted_FAQ',translation.replace('### هل يكفي تصريح Family KITAS واحد لكل أفراد الأسرة؟\n\nلا. يجب تقديم طلب مستقل لكل فرد من الأسرة وفق الأساس المناسب.\n\n','',1), lambda s:validate_text(src,s,'AR',1)[0]),
    ('broken_link',translation.replace('/bali/visas/child-kitas/','/bali/visas/fake-child-kitas/',1),lambda s:validate_text(src,s,'AR',1)[0]),
    ('missing_CTA',translation.replace('**Primary button:**','**Not a button:**',1),lambda s:validate_text(src,s,'AR',1)[0]),
    ('visa_code_swap',translation.replace('E31H','E29Z'),lambda s:validate_text(src,s,'AR',1)[0]),
  ]
  for name,data,check in changes:
    found=check(data);cases.append({'case':name,'detected':bool(found),'errors':found})
  payload=json.loads((ROOT/'CONTENT_LOCALIZED_IMPORT.json').read_text())
  mod=copy.deepcopy(payload)
  next(r for r in mod['records'] if r['locale']=='ar')['direction']='ltr'
  cases.append({'case':'arabic_wrong_direction','detected':bool(test_record_import(mod)),'errors':test_record_import(mod)[:2]})
  mod=copy.deepcopy(payload)
  next(r for r in mod['records'] if r['locale']=='en')['pricing_ref']='FIXED_12M_IDR'
  cases.append({'case':'invented_family_price','detected':bool(test_record_import(mod)),'errors':test_record_import(mod)[:2]})
  mod=copy.deepcopy(payload)
  next(r for r in mod['records'] if r['locale']=='fr')['body_markdown']+=' accidental extra text'
  cases.append({'case':'body_hash_modified','detected':bool(test_record_import(mod)),'errors':test_record_import(mod)[:2]})
  return cases

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--self-test',action='store_true');a=parser.parse_args()
    report=validate_files()
    if a.self_test:
       tests=adversarial_tests();report['negative_tests']=tests
       if not all(x['detected'] for x in tests):report['issues'].append('negative test not detected')
    report['status']='PASS' if not report['issues'] else 'FAIL'
    (ROOT/'QA'/'parity_results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('STATUS:',report['status']);print('RU:',report['source_ru_pages'],'FOREIGN:',report['foreign_languages'], 'TRANSLATIONS:',report['translated_pages'], 'STAGING:',report['import_records'])
    print('FAQ:',report['faq_translated_total'],'LINKS:',report['internal_link_occurrences'], 'ERRORS:',len(report['issues']))
    if a.self_test:
       print('NEGATIVE:',sum(x['detected'] for x in report['negative_tests']),'/',len(report['negative_tests']))
       for x in report['negative_tests']:print('  ',x['case'], 'DETECTED' if x['detected'] else 'MISSED')
    for x in report['issues'][:20]:print('ERROR:',x)
    sys.exit(0 if report['status']=='PASS' else 1)
