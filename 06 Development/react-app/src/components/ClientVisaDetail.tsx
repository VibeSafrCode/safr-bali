import {lazy} from 'react';
import {YOGA_MINI_APP} from '../runtime/yoga-mini-app';
import {loadClientVisaPack,clientLoadedVisaArticle,requireClientVisaId} from '../i18n/client-visa-packs';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import type {ClientVisaId} from '../i18n/client-catalog-model';
import {ClientVisaArticleView} from './ClientVisaArticleView';

type Props={ui:ClientUiBindings;destinationName:string;summary?:string;price:string|null;preparing:boolean};
/** H1 and all body fragments resolve together, from one current locale. */
function ResolvedVisaDetail({visaId,...props}:Props&{visaId:ClientVisaId}){
  const ui=requireClientUiBindings(props.ui),article=clientLoadedVisaArticle(visaId,ui.locale);
  return <>
    <header className="page-heading compact-page-heading">
      <span className="eyebrow">{props.destinationName}</span>
      <h1>{article.title}</h1>
      <p>{props.summary}</p>
      {props.price&&<strong className="price-note">{props.price}</strong>}
    </header>
    {props.preparing&&<div className="empty-state preparation-state"><span className="eyebrow">{ui.text('catalog.soon')}</span><strong>{ui.text('catalog.preparing.title')}</strong><p>{ui.text('catalog.preparing.detail')}</p></div>}
    <ClientVisaArticleView visaId={visaId} ui={ui}/>
  </>;
}
const details=YOGA_MINI_APP?null:{
  e33g:lazy(()=>loadClientVisaPack('e33g').then(()=>({default:(props:Props)=><ResolvedVisaDetail {...props} visaId="e33g"/>}))),
  d12:lazy(()=>loadClientVisaPack('d12').then(()=>({default:(props:Props)=><ResolvedVisaDetail {...props} visaId="d12"/>}))),
  'd1-d2':lazy(()=>loadClientVisaPack('d1-d2').then(()=>({default:(props:Props)=><ResolvedVisaDetail {...props} visaId="d1-d2"/>}))),
  c1:lazy(()=>loadClientVisaPack('c1').then(()=>({default:(props:Props)=><ResolvedVisaDetail {...props} visaId="c1"/>}))),
  voa:lazy(()=>loadClientVisaPack('voa').then(()=>({default:(props:Props)=><ResolvedVisaDetail {...props} visaId="voa"/>}))),
};
export function ClientVisaDetail({visaId,...props}:Props&{visaId:string}){
  const ui=requireClientUiBindings(props.ui),id=requireClientVisaId(visaId);
  if(!details)throw new Error('CLIENT_CATALOG_MAIN_BUILD_ONLY');
  const Detail=details[id];return <Detail {...props} ui={ui}/>;
}
