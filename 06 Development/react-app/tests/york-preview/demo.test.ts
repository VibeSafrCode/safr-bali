import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DemoApp} from '../../src/york-preview/DemoApp';

test('synthetic React client, partner, owner and contact views render without live providers',()=>{
  for(const locale of ['ru','en'] as const)for(const path of [
    '/account/','/account/orders/','/account/referrals/','/account/points/',
    '/influencer/','/influencer/overview/','/influencer/network/','/influencer/earnings/','/influencer/terms/','/influencer/links/',
    '/owner/influencers/','/owner/influencers/york-gangster/business/','/owner/publications/',
    '/contacts/','/services/','/about/','/stories/',
  ]) {
    const route=locale==='en'?'/en'+path:path;
    const html=renderToStaticMarkup(createElement(DemoApp,{route,locale}));
    assert.ok(html.length>100,route);
    assert.doesNotMatch(html,/type="password"|data-auth-|href="https:\/\/t\.me|action="\/api\//,route);
    assert.doesNotMatch(html,/York Gangster/);
    if(path==='/services/')assert.doesNotMatch(html,/catalog-card|catalog-grid/);
    if(path.includes('referrals')||path.includes('network'))assert.match(html,/DEMO A/);
    if(path==='/contacts/')assert.match(html,/role="status"/);
  }
});

test('bot defaults to explicit customer role without partner commands or Telegram transport',()=>{
  for(const locale of ['ru','en'] as const) {
    const html=renderToStaticMarkup(createElement(DemoApp,{route:'/bot-demo/',locale}));
    assert.match(html,/id="bot-demo-role"/);
    assert.match(html,/value="customer" selected/);
    assert.match(html,/role="log"/);
    assert.match(html,/>\/services<\/button>/);
    for(const command of ['/earnings','/network','/terms'])assert.ok(!html.includes('>'+command+'</button>'));
    assert.doesNotMatch(html,/iframe|src="https?:/);
  }
});
