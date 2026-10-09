#!/usr/bin/env python3
"""Structural and material-sentinel QA for SAFRWAY Partners all 10 locale staging records.

Not a native-speaker, live browser, legal or production certification.
"""
import argparse, copy, hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SHA='f97f75861d7f90504f551b665a3c149f05f3e15c7f50cf120ca5e7ac08c76d70'
LOCALES=['ru','en','de','zh-Hans','ko','fr','ja','hi','es','ar']
PREFIXES={'ru':'','en':'/en','de':'/de','zh-Hans':'/zh-cn','ko':'/ko','fr':'/fr','ja':'/ja','hi':'/hi','es':'/es','ar':'/ar'}
FAQ={
 'ru':'Частые вопросы', 'en':'Frequently asked questions', 'de':'Häufige Fragen', 'zh-Hans':'常见问题',
 'ko':'자주 묻는 질문','fr':'Questions fréquentes','ja':'よくあるご質問',
 'hi':'अक्सर पूछे जाने वाले प्रश्न','es':'Preguntas frecuentes','ar':'الأسئلة الشائعة'
}
IMPORTANT={
 'ru':['решение принимает','безопасного канала','по конкретному обращению','универсальная публичная сетка','не обещается'],
 'en':['final decision rests','secure transfer channel','each specific request','universal public rate','do not promise'],
 'de':['endgültige entscheidung trifft','sicherer übermittlungskanal','jede konkrete anfrage','keine bestätigte allgemeine öffentliche preisliste','versprechen wir nicht'],
 'zh-Hans':['最终决定由','安全传输渠道','每个具体需求','统一公开的价格','不会承诺'],
 'ko':['최종 결정은 권한이 있는 정부기관','안전한 전달 채널','각 의뢰별로','확정된 공개 요금표','약속하지 않습니다'],
 'fr':['décision finale appartient','canal de transmission sécurisé','chaque demande précise','grille tarifaire publique universelle','ne promettons pas'],
 'ja':['最終判断は権限を有する政府機関','安全な送付方法','個別のご依頼ごと','確定済みの公開料金表','お約束しません'],
 'hi':['अंतिम निर्णय अधिकृत सरकारी प्राधिकरण','सुरक्षित माध्यम','प्रत्येक विशिष्ट अनुरोध','सार्वभौमिक सार्वजनिक दर-सूची','वादा नहीं किया जाता'],
 'es':['decisión definitiva corresponde','canal seguro','cada solicitud concreta','lista de tarifas pública y universal','no prometemos'],
 'ar':['القرار النهائي تتخذه','قناة آمنة','لكل طلب محدد','قائمة أسعار عامة وموحدة','لا نَعِد'],
}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def structure(body):
 return tuple(len(re.findall(p,body,flags=re.M)) for p in (r'^# ',r'^## ',r'^### ',r'^- ',r'^[1-5]\. '))

def verify(payload, disk=True):
 issues=[]
 records=payload.get('records',[])
 if [x.get('locale') for x in records]!=LOCALES:issues.append('Incorrect order or locale set')
 if len(records)!=10 or len({x.get('locale') for x in records})!=10:issues.append('Missing/duplicate locale')
 if payload.get('schema')!='safrway_editorial_staging_not_runtime_v1':issues.append('Invalid staging schema')
 if payload.get('sourceSha256')!=SHA:issues.append('RU source hash mismatch')
 if payload.get('routeMustBeReconciledByCodex') is not True:issues.append('Unsafe verified-route assertion')
 if payload.get('referralSeparate',{}).get('stage')!='preview_only_not_indexable':issues.append('Referral became public')
 for r in records:
  loc=r.get('locale')
  if loc not in LOCALES:continue
  body=r.get('bodyMarkdown','')
  def error(s):issues.append(loc+': '+s)
  if r.get('pageKey')!='partners_b2b':error('Incorrect page key')
  if r.get('sourceRevision')!='partners-b2b-ru-2026-10-09-v1' or r.get('sourceSha256')!=SHA:error('Source-revision mismatch')
  if r.get('routeHint')!=PREFIXES[loc]+'/partners/' or r.get('routeHintVerified') is not False:error('Invalid/unverified route')
  if r.get('direction')!=('rtl' if loc=='ar' else 'ltr'):error('Incorrect writing direction')
  if structure(body)!=(1,7,14,4,5):error('Body hierarchy mismatch '+str(structure(body)))
  if r.get('faqCount')!=9:error('FAQ count wrong')
  if ('## '+FAQ[loc]) not in body:error('FAQ section missing')
  if len(body) < (1300 if loc in ['zh-Hans','ja','ko'] else 3000):error('Body suspiciously short')
  if '## SEO (metadata' in body or '## Content references for Codex' in body or '**Status:**' in body:error('Internal metadata leaked into body')
  if re.search(r'\b(?:10|12|14|15|20|25|30)\s*%',body,re.I) or re.search(r'\b(?:12|14)\s*000\s*000\s*IDR\b',body,re.I):error('Invented commission or unrelated price')
  if re.search(r'\]\(/(?:partners|referral)/',body):error('Unverified referral link')
  seo=r.get('seo',{})
  if not all(seo.get(k) for k in ('title','description','h1')):error('SEO incomplete')
  if body.splitlines()[0].removeprefix('# ').strip()!=seo.get('h1'):error('H1 mismatch')
  cta=r.get('cta',{})
  if not all(cta.get(k) for k in ('primaryLabel','secondaryAnchorLabel','finalLabel','secondaryReferralCopy')):error('CTA incomplete')
  if cta.get('primaryAction')!='existing_b2b_lead_or_contact_flow' or cta.get('secondaryAction')!='scroll_to_partner_services_section':error('CTA invented action')
  if cta.get('secondaryReferralDisplay')!='only_if_referral_public_with_approved_terms':error('Referral link prematurely visible')
  if r.get('translationStatus') != ('RU_REVIEW' if loc=='ru' else 'MODEL_TRANSLATED_PENDING_RENDER_QA'):error('Incorrect content approval state')
  if r.get('publicationStage')!='candidate_public_indexable_after_gate':error('Premature publication')
  for fragment in IMPORTANT[loc]:
    if fragment.casefold() not in body.casefold():error('Semantic marker missing: '+fragment)
  if disk:
   p=ROOT/r.get('contentFile','')
   if not p.is_file():error('Missing source file')
   else:
    if sha(p.read_bytes())!=r.get('contentSha256'):error('Source file SHA mismatch')
    if r.get('sourceSha256')!=SHA:error('Source does not match master')
 if disk:
  ru=ROOT/'CONTENT/RU/PARTNERS_B2B_RU_v1_REVIEW.md'
  if not ru.is_file() or sha(ru.read_bytes())!=SHA:issues.append('RU original changed')
 return issues

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--self-test',action='store_true')
 args=p.parse_args()
 payload=json.loads((ROOT/'CONTENT_IMPORT_STAGING.json').read_text(encoding='utf-8'))
 issues=verify(payload)
 if issues:
  print('QA FAIL:',json.dumps(issues,ensure_ascii=False,indent=2));raise SystemExit(1)
 print('PASS | 10/10 locale records | 9/9 translations | 81 translated FAQ | 0 structural/sentinel issues')
 print('PASS | RU source fingerprint: '+SHA)
 if args.self_test:
  cases=[]
  def test(label,func):
   clone=copy.deepcopy(payload);func(clone);cases.append((label,clone))
  test('Removed FAQ',lambda x:x['records'][1].update(bodyMarkdown=x['records'][1]['bodyMarkdown'].replace('## Frequently asked questions','FAQ removed')))
  test('False fixed commission',lambda x:x['records'][8].update(bodyMarkdown=x['records'][8]['bodyMarkdown']+'\nComisión garantizada 20%'))
  test('Referral published',lambda x:x['referralSeparate'].update(stage='public_indexable'))
  test('Wrong AR direction',lambda x:x['records'][9].update(direction='ltr'))
  test('Wrong source SHA',lambda x:x.update(sourceSha256='00000'))
  test('Empty CTA',lambda x:x['records'][7]['cta'].update(primaryLabel=''))
  test('Hidden internal notes exposed',lambda x:x['records'][2].update(bodyMarkdown=x['records'][2]['bodyMarkdown']+'\n## Content references for Codex'))
  test('Broken route',lambda x:x['records'][8].update(routeHint='/en/partners/'))
  test('Missing disclaimer',lambda x:x['records'][9].update(bodyMarkdown=x['records'][9]['bodyMarkdown'].replace('القرار النهائي تتخذه','لا توجد قيود')))
  test('Removed secure handling',lambda x:x['records'][7].update(bodyMarkdown=x['records'][7]['bodyMarkdown'].replace('सुरक्षित माध्यम','ईमेल')))
  test('Missing step',lambda x:x['records'][8].update(bodyMarkdown=x['records'][8]['bodyMarkdown'].replace('5. **Coordinamos','**Coordinamos')))
  failures=[label for label,data in cases if not verify(data,disk=False)]
  if failures:raise SystemExit('NEGATIVE TESTS MISSED: '+', '.join(failures))
  print('NEGATIVE TEST PASS | 11/11 corruptions correctly detected')
if __name__=='__main__':main()
