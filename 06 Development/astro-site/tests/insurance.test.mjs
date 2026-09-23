import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const countries = ['bali','thailand','nepal','uae'];
const html = route => readFile(new URL(`../dist/${route}index.html`,import.meta.url),'utf8');

test('insurance pages and entry links exist in both languages, except Russia', async () => {
  for (const prefix of ['', 'en/']) {
    const home = await html(prefix);
    for (const country of countries) {
      const route = `${prefix}${country}/insurance/`;
      assert.ok(home.includes(`href="/${route}"`),route);
      if (country !== 'uae') assert.ok((await html(`${prefix}${country}/`)).includes(`href="/${route}"`));
      const page = await html(route);
      assert.match(page, /<h2>LUMA<\/h2>/);
      assert.match(page, /<h2>SafetyWing<\/h2>/);
      assert.ok(page.includes('data-insurance-provider="LUMA"') && page.includes('data-insurance-provider="SafetyWing"'));
      assert.ok(page.includes(prefix ? 'calculated individually' : 'индивидуально для каждого клиента'));
      assert.equal((page.match(/aria-label="(?:Написать менеджеру|Message a manager): (?:LUMA|SafetyWing)"/g) ?? []).length,2);
      assert.match(page, new RegExp(`data-world="${country}"`));
      assert.ok(page.includes('https://www.lumahealth.com/') && page.includes('https://safetywing.com/'));
    }
    assert.ok(!(await html(`${prefix}russia/`)).includes('/russia/insurance/'));
    assert.ok(!home.includes('/russia/insurance/'));
  }
});
