import type{APIRoute}from'astro';
import{publicSiteEntries,publicSiteAlternates}from'../lib/public-site-publication';
import{canonicalUrl}from'../lib/seo';
const xml=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
export const GET:APIRoute=async()=>{
 const urls=publicSiteEntries().filter(row=>row.page.indexable).map(row=>`  <url>
    <loc>${xml(canonicalUrl(row.route))}</loc>
    ${publicSiteAlternates(row.route).map(value=>`<xhtml:link rel="alternate" hreflang="${value.locale}" href="${xml(canonicalUrl(value.href))}" />`).join('\n    ')}
    ${row.page.publication?.lastmod?`<lastmod>${xml(row.page.publication.lastmod)}</lastmod>`:''}
  </url>`).join('\n');
 return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
};
