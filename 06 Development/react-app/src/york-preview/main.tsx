import {createRoot} from 'react-dom/client';
import React from 'react';
import {DemoApp} from './DemoApp';

const target=document.getElementById('york-demo');
if(target) {
  const locale=target.dataset.locale;
  const route=target.dataset.route;
  if((locale!=='ru'&&locale!=='en')||!route?.startsWith('/'))throw new Error('Invalid synthetic preview context');
  createRoot(target).render(<DemoApp route={route} locale={locale}/>);
}
