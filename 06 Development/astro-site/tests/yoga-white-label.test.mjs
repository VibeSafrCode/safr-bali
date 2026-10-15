import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {yogaPresentationText} from '../../shared/src/yoga-presentation.mjs';
import {yogaDisplayCopy,yogaVisiblePage,yogaVisibleRegistry} from '../src-york/lib/brand-copy.ts';

test('trusted copy only: Main and opaque interpolation/address tokens are unchanged',()=>{
  const source='  SAFRWAY · SAFR Points · SAFRWAY Points · сервис SAFR · SAFR Bali\n{name} {SAFRWAY} https://safrway.online/ @x user@safrway.online  ';
  assert.equal(yogaPresentationText(source,false),source);
  assert.equal(yogaPresentationText('HTTPS://SAFRWAY.ONLINE/x?SAFRWAY=1'), 'HTTPS://SAFRWAY.ONLINE/x?SAFRWAY=1');
  assert.equal(yogaPresentationText(source),'  Yoga Ganster · Points · Points · сервис Yoga Ganster · Yoga Ganster\n{name} {SAFRWAY} https://safrway.online/ @x user@safrway.online  ');
});

test('HTML projects actual visible attributes/text, never quoted attribute-looking data',()=>{
  const input=`<a data-note=' keep title="SAFRWAY" alt="SAFR" ' href='/same?note= title="SAFRWAY" ' id="SAFRWAY" title="SAFRWAY > SAFR Points" aria-label='SAFRWAY' data-title="SAFRWAY">SAFRWAY</a><!-- SAFRWAY title="SAFRWAY" -->`;
  assert.equal(yogaDisplayCopy(input,'/privacy/'),input
    .replace('title="SAFRWAY > SAFR Points"','title="Yoga Ganster > Points"')
    .replace("aria-label='SAFRWAY'","aria-label='Yoga Ganster'")
    .replace('>SAFRWAY</a>','>Yoga Ganster</a>'));
  assert.equal(yogaDisplayCopy('<img alt=SAFRWAY src="/SAFRWAY.png" />','/'),'<img alt="Yoga Ganster" src="/SAFRWAY.png" />');
  assert.throws(()=>yogaDisplayCopy('<script>SAFRWAY</script>','/'),/Executable/);
});

test('privacy/partners visible service names are covered, obligations/numbers/identities stay exact',()=>{
  for(const route of ['/privacy/','/en/privacy/','/partners/','/en/partners/']) {
    const body='SAFRWAY: 13 / 36 months; 5% / $100 / 1,000 IDR; {user}; https://example.org/';
    const page={route,title:'SAFRWAY',body,cards:[],breadcrumbs:[],relatedRoutes:[],sourceRevision:'SAFRWAY-internal'};
    const result=yogaVisiblePage(page);
    assert.equal(result.body,body.replace('SAFRWAY','Yoga Ganster'));
    assert.equal(result.sourceRevision,page.sourceRevision);
    assert.equal(page.title,'SAFRWAY','do not mutate canonical input');
    const registry={route,title:'SAFRWAY',contentId:'SAFRWAY_internal',sections:[{heading:'SAFRWAY',html:'<p>SAFRWAY · 13</p>'}],breadcrumbs:[],related:[],ctaActions:[{label:'SAFRWAY',href:'https://example.org/SAFRWAY'}]};
    const projected=yogaVisibleRegistry(registry);
    assert.equal(projected.sections[0].html,'<p>Yoga Ganster · 13</p>');
    assert.equal(projected.contentId,registry.contentId);
    assert.equal(projected.ctaActions[0].href,registry.ctaActions[0].href);
  }
});

test('Yoga has one noninteractive partner wordmark; agency shared, Main unchanged brand',()=>{
  const home=readFileSync(new URL('../src-york/pages/index.astro',import.meta.url),'utf8');
  assert.match(home,/const page=yogaVisiblePage\(yogaPublicPage\(getLocalizedPublicPage\('\/','ru'\)\)\)/,'The dedicated RU home must use the same visible/meta brand projection as dynamic routes');
  const yoga=readFileSync(new URL('../src-york/layouts/YorkPreviewLayout.astro',import.meta.url),'utf8');
  const credits=readFileSync(new URL('../src/components/FooterCredits.astro',import.meta.url),'utf8');
  const logo=readFileSync(new URL('../src/components/SafrwayWordmark.astro',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/components/SiteFooter.astro',import.meta.url),'utf8');
  assert.equal((yoga.match(/<SafrwayWordmark\s*\//g)||[]).length,1);
  assert.match(yoga,/<div class="partner-brand partner-safrway"><SafrwayWordmark \/><\/div>/);
  assert.match(yoga,/<FooterCredits includePlatform=\{false\}/);
  assert.doesNotMatch(logo,/<a\b|href=|onclick=|tabindex=/i);
  assert.match(credits,/AI Creative Agency/);assert.match(credits,/NИИK/);
  assert.match(main,/<FooterCredits\s*\//);
});
