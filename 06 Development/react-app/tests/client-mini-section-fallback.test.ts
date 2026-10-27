import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CLIENT_RUNTIME_LOCALES} from '../src/i18n/client-runtime';
import {Harness} from './client-current-parent-integration.test';

// Actual current parent functions use the existing deterministic hook/API
// fixture. The real SectionBoundary is compiled with automatic JSX and its
// failed state is set explicitly: this is not ReactDOM/error-capture/browser
// evidence. This JSX-free .test.ts is included by the existing public profile;
// importing the Harness also registers its current-parent regression cases.
const prefix = 'mini section fallback: ';
const legacy = {
  ru: ['Не удалось загрузить раздел', 'Откройте другой раздел через меню или перезагрузите Mini App.', 'Перезагрузить Mini App'],
  en: ['Could not load this section', 'Use the menu to open another section, or reload the Mini App.', 'Reload Mini App'],
} as const;
function nodes(value: any): any[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(nodes);
  return [value, ...nodes(value.props?.children)];
}
function text(value: any): string {
  if (value == null || typeof value === 'boolean') return '';
  if (Array.isArray(value)) return value.map(text).join('');
  return typeof value === 'object' ? text(value.props?.children) : String(value);
}
function failedBoundary(h: Harness) {
  const element = h.component('SectionBoundary');
  assert.ok(element, 'Ready parent retains its shared SectionBoundary');
  const {SectionBoundary} = h.load('components/SectionBoundary.tsx', true);
  const instance = new SectionBoundary(element.props);
  assert.equal(instance.render(), element.props.children);
  instance.state = {...instance.state, ...SectionBoundary.getDerivedStateFromError()};
  assert.equal(instance.state.failed, true);
  return {element, instance};
}

for (const locale of CLIENT_RUNTIME_LOCALES) test(prefix + 'Main renders accepted ' + locale + ' copy, not contact EN', async () => {
  const h = new Harness('mini');
  h.uiLocale = locale;
  h.contact = 'en';
  let reloads = 0;
  h.location.reload = () => {reloads++;};
  try {
    h.mount();
    await h.settle();
    assert.equal(h.readyActor(), 101);
    assert.equal(h.client.ui.locale, locale);
    const {element, instance} = failedBoundary(h);
    assert.equal(element.props.locale, 'en');
    assert.ok(element.props.errorFallback);
    const output = instance.render();
    assert.equal(output.props.role, 'alert');
    assert.equal(output.props.lang, locale);
    assert.equal(output.props.dir, locale === 'ar' ? 'rtl' : 'ltr');
    const heading = nodes(output).find(node => node.type === 'h2');
    const buttons = nodes(output).filter(node => node.type === 'button');
    assert.equal(text(heading), h.client.ui.text('mini.error.title'));
    assert.equal(buttons.length, 1);
    assert.equal(text(buttons[0]), h.client.ui.text('mini.action.retry'));
    assert.equal(buttons[0].props.type, 'button');
    const html = renderToStaticMarkup(output);
    assert.match(html, /role="alert"/);
    assert.equal(html.includes('undefined'), false);
    assert.equal(text(output).includes(legacy.en[1]), false);
    const before = h.calls.length;
    buttons[0].props.onClick();
    assert.equal(reloads, 1);
    assert.equal(h.calls.length, before);
    assert.deepEqual(h.calls.map(call => [call.path, call.options.method ?? 'GET']), [
      ['/mini-app/me', 'GET'], ['/mini-app/preferences/ui-locale', 'GET'],
    ]);
  } finally {
    h.unmount();
  }
});

test(prefix + 'failed instance follows AR to JA without locale remount; navigation remains outside', async () => {
  const h = new Harness('mini');
  h.uiLocale = 'ar';
  try {
    h.mount();
    await h.settle();
    const {element, instance} = failedBoundary(h);
    const before = h.calls.length;
    await h.client.controller.choose('ja');
    await h.settle();
    const next = h.component('SectionBoundary');
    assert.equal(next.key, element.key, 'Locale is not the section remount key');
    assert.equal(next.type, element.type);
    instance.props = next.props;
    assert.equal(instance.state.failed, true);
    assert.equal(instance.render().props.lang, 'ja');
    assert.equal(instance.render().props.dir, 'ltr');
    assert.equal(text(nodes(instance.render()).find(node => node.type === 'h2')), h.client.ui.text('mini.error.title'));
    assert.equal(text(nodes(instance.render()).find(node => node.type === 'button')), h.client.ui.text('mini.action.retry'));
    assert.deepEqual(h.calls.slice(before).map(call => [call.path, call.options.method]), [['/mini-app/preferences/ui-locale', 'PATCH']]);
    assert.equal(h.contact, 'en');
    assert.equal(h.readyActor(), 101);
    const shell = h.component('AppShell');
    assert.ok(shell, 'Navigation shell remains outside the failed boundary');
    shell.props.onNavigate('profile');
    await h.settle();
    assert.equal(h.location.hash, '#/profile');
    assert.notEqual(h.component('SectionBoundary').key, element.key, 'Route change keeps its existing remount behavior');
    assert.equal(h.client.ui.locale, 'ja');
  } finally {
    h.unmount();
  }
});

for (const locale of ['ru', 'en'] as const) test(prefix + 'Yoga ' + locale + ' retains the real default fallback and reload', async () => {
  const h = new Harness('mini', '/mini-app/', true);
  h.contact = locale;
  let reloads = 0;
  h.location.reload = () => {reloads++;};
  try {
    h.mount();
    await h.settle();
    await h.component('AppShell').props.onLocaleChange(locale);
    await h.settle();
    assert.equal(h.client.controller, null);
    const {element, instance} = failedBoundary(h);
    assert.equal(element.props.locale, locale);
    assert.equal(element.props.errorFallback, undefined);
    const output = instance.render();
    const expected = React.createElement('section', {className: 'panel', role: 'alert'},
      React.createElement('h2', null, legacy[locale][0]),
      React.createElement('p', null, legacy[locale][1]),
      React.createElement('button', {type: 'button', className: 'button secondary'}, legacy[locale][2]));
    assert.equal(renderToStaticMarkup(output), renderToStaticMarkup(expected));
    const before = h.calls.length;
    nodes(output).find(node => node.type === 'button').props.onClick();
    assert.equal(reloads, 1);
    assert.equal(h.calls.length, before);
    assert.ok(h.calls.every(call => !call.path.includes('/preferences/') && !call.path.startsWith('/api/web/')));
  } finally {
    h.unmount();
  }
});
