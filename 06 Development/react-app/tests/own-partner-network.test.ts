import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {partnerNetwork} from '../src/api/partner-network';

const fixture = {restricted_partner: true, direct_count: 1,
  nodes: [{label: '№1', level: 1, created_at: '2026-10-30T00:00:00'},
    {label: '№2', level: 2, created_at: null}],
  has_more: false, page_limited: false, depth_limited: false, offset: 0, limit: 50, next_offset: null};
const require = createRequire(import.meta.url), component: {exports: any} = {exports: {}};
const filename = new URL('../src/components/OwnPartnerNetwork.tsx', import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {fileName: filename.pathname,
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText;
vm.runInThisContext('(function(require,module,exports){' + compiled + '\n})', {filename: filename.pathname})(require, component, component.exports);

test('actual whitelist drops contacts and rejects untrusted identity-shaped or malformed rows', () => {
  const safe = partnerNetwork({...fixture, username: 'PRIVATE', nodes: fixture.nodes.map(n => ({...n, telegram_id: 999, name: 'PRIVATE'}))});
  assert.deepEqual(safe, fixture);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|999|telegram_id|username/);
  for (const invalid of [null, {}, {...fixture, restricted_partner: false}, {...fixture, nodes: [{label: '<script>PRIVATE</script>', level: 1, created_at: null}]},
    {...fixture, nodes: [{label: '№1', level: 33, created_at: null}]}, {...fixture, offset: -1},
    {...fixture, nodes: [{label: '№1', level: 1, created_at: 'PRIVATE'}]}, {...fixture, next_offset: 50}])
    assert.equal(partnerNetwork(invalid), undefined);
});

test('actual React list renders safe anonymous levels/date and native pagination in ten locales', () => {
  for (const locale of ['ru', 'en', 'de', 'fr', 'es', 'pt', 'zh', 'ja', 'hi', 'ar']) {
    const markup = renderToStaticMarkup(React.createElement(component.exports.OwnPartnerNetwork, {
      network: partnerNetwork(fixture), locale, title: 'Network <safe>', loading: true, error: '', onPage: () => {},
    }));
    assert.match(markup, /№1/);assert.match(markup, /№2/);
    assert.match(markup, /aria-busy="true"/);assert.match(markup, /aria-live="polite"/);
    assert.equal((markup.match(/<button /g) ?? []).length, 2);
    assert.equal((markup.match(/disabled=""/g) ?? []).length, 2);
    assert.match(markup, /Network &lt;safe&gt;/);
    assert.doesNotMatch(markup, /href=|PRIVATE|telegram_id|username|user_id/);
  }
});

test('pagination distinguishes a reachable next page, real end and bounded truncation', () => {
  assert.ok(partnerNetwork({...fixture, offset: 4950, has_more: true, next_offset: 5000}));
  const limited = {...fixture, offset: 4975, limit: 50, has_more: true, page_limited: true, next_offset: null};
  assert.ok(partnerNetwork(limited));
  assert.equal(partnerNetwork({...limited, page_limited: false}), undefined);
  assert.equal(partnerNetwork({...limited, next_offset: 5025}), undefined);
  assert.equal(partnerNetwork({...fixture, has_more: true}), undefined);
  const markup = renderToStaticMarkup(React.createElement(component.exports.OwnPartnerNetwork, {
    network: partnerNetwork(limited), locale: 'ru', title: 'Network', loading: false, error: '', onPage: () => {},
  }));
  assert.match(markup, /Показана часть сети/);
  assert.match(markup, /disabled="">Далее/);
});
