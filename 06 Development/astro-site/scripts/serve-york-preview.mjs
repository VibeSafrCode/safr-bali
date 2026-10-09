import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {previewBrand,previewAuthorityAllowed} from '../../shared/src/preview-brand.mjs';

export const PREVIEW_CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://i.ytimg.com; font-src 'self'; connect-src 'none'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.pdf':'application/pdf'};

export async function createYorkPreviewServer({port=4380,root=fileURLToPath(new URL('../dist-york-preview/',import.meta.url))}={}) {
  const brand=previewBrand('york-gangster');
  if(port!==4380&&port!==4381)throw new Error('Preview port must be explicitly allowlisted');
  const base=await realpath(root);
  const receipt=JSON.parse(await readFile(path.join(base,'preview-build.json'),'utf8'));
  if(receipt.brandId!==brand.brandId||receipt.stage!=='LOCAL_SYNTHETIC_PREVIEW'||receipt.liveApi!==false)throw new Error('Not a verified synthetic preview output');
  const server=createServer(async(req,res)=>{
    const headers={'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store','Content-Security-Policy':PREVIEW_CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    const finish=(status,body='',type='text/plain; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(req.method==='HEAD'?'':body);};
    if(!previewAuthorityAllowed(brand,req.headers.host,req.headers)||!req.headers.host.endsWith(':'+port))return finish(421,'Preview authority rejected');
    if(req.method!=='GET'&&req.method!=='HEAD')return finish(405,'Read-only preview');
    let pathname;
    try{pathname=decodeURIComponent(req.url.split('?')[0]);}catch{return finish(400,'Invalid path');}
    if(!pathname.startsWith('/')||pathname.includes('%')||pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(segment=>segment.startsWith('.')))return finish(400,'Invalid path');
    if(/^\/(api|auth|mini|admin)(\/|$)/.test(pathname)||pathname.includes('/src/')||pathname.includes('/shared/')||pathname.includes('/node_modules/'))return finish(404,'No live or source endpoints');
    if(pathname.endsWith('/'))pathname+='index.html';
    const candidate=path.resolve(base,'.'+pathname);
    if(!candidate.startsWith(base+path.sep))return finish(400,'Invalid path');
    try {
      const file=await realpath(candidate);
      if(!file.startsWith(base+path.sep)||!mime[path.extname(file)]||!(await stat(file)).isFile())return finish(404,'Not found');
      return finish(200,await readFile(file),mime[path.extname(file)]);
    } catch {
      if(req.headers.accept?.includes('text/html'))return finish(404,await readFile(path.join(base,pathname.startsWith('/en/')?'en/404/index.html':'404.html')),mime['.html']);
      return finish(404,'Not found');
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.argv[2]??4380);
  const server=await createYorkPreviewServer({port});
  console.log(`York synthetic preview: http://127.0.0.1:${port}/ — no live API or background processes`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
