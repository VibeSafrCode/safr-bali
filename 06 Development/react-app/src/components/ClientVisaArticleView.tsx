import {clientLoadedVisaArticle} from '../i18n/client-visa-packs';
import {requireClientUiBindings,type ClientUiBindings} from '../i18n/client-ui-bindings';
import './client-visa-article.css';

/** HTML is obtained exclusively from the byte-pinned, frozen Registry compiler
 * output. No route/prop/API-supplied HTML, raw markdown or QA metadata is parsed.
 * Keep every source fragment in order, including visible FAQ without schema. */
export function ClientVisaArticleView({visaId,ui}:{visaId:string;ui:ClientUiBindings}) {
  const client=requireClientUiBindings(ui);
  const article=clientLoadedVisaArticle(visaId,client.locale);
  return <div className="content-card client-visa-article" lang={article.locale} dir={article.dir} data-content-id={article.contentId}>
    {article.directHtml&&<div data-registry-fragment="direct" dangerouslySetInnerHTML={{__html:article.directHtml}}/>}
    {article.introHtml&&<div data-registry-fragment="intro" dangerouslySetInnerHTML={{__html:article.introHtml}}/>}
    {article.factHtml&&<div data-registry-fragment="facts" dangerouslySetInnerHTML={{__html:article.factHtml}}/>}
    {article.sections.map(section=><section key={section.id} data-registry-section={section.id}>
      <h2>{section.heading}</h2>
      <div dangerouslySetInnerHTML={{__html:section.html}}/>
    </section>)}
  </div>;
}
