import assert from 'node:assert/strict';
import test from 'node:test';
import {GUEST_CHAT_LOCALES,GUEST_CHAT_KEYS,guestChatLocale,guestChatText} from '../src/lib/guest-chat-copy.mjs';

const locales=['ru','en','zh-Hans','ko','fr','de','ja','hi','es','ar'];

test('guest chat has the same nonempty caption contract in all ten existing public languages',()=>{
 assert.deepEqual(GUEST_CHAT_LOCALES,locales);
 assert.equal(new Set(GUEST_CHAT_KEYS).size,GUEST_CHAT_KEYS.length);
 assert.ok(GUEST_CHAT_KEYS.length>0);
 const titles=new Set();
 for(const locale of locales){
  assert.equal(guestChatLocale(locale),locale);
  const captions=Object.fromEntries(GUEST_CHAT_KEYS.map(key=>[key,guestChatText(key,locale)]));
  assert.deepEqual(Object.keys(captions),GUEST_CHAT_KEYS);
  for(const value of Object.values(captions)){
   assert.equal(typeof value,'string');assert.ok(value.trim().length>0);
  }
  titles.add(captions.title);
 }
 assert.equal(titles.size,locales.length,'each existing locale has its own chat title');
 assert.equal(guestChatLocale('ar'),'ar');
 assert.equal(guestChatLocale('zh-cn'),'zh-Hans');
 assert.equal(guestChatText('title','zh-cn'),guestChatText('title','zh-Hans'));
});

test('unknown captions and unsupported locales cannot silently fall back to English',()=>{
 for(const locale of locales)assert.throws(()=>guestChatText('missing-key',locale),/Unknown guest chat caption/);
 for(const locale of ['it','',null,undefined,'__proto__']){
  assert.throws(()=>guestChatLocale(locale),/Unsupported guest chat locale/);
  assert.throws(()=>guestChatText('title',locale),/Unsupported guest chat locale/);
 }
 assert.throws(()=>guestChatText('__proto__','en'),/Unknown guest chat caption/);
});
