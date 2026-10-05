// Synthetic saved-frame gate. No production data/session, personal browser or writes.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=fileURLToPath(new URL('../../../AUDIT/SYNC_FINAL_2026-10-05/',import.meta.url));mkdirSync(output+'screenshots',{recursive:true});
const dashboard={telegram_id:5,first_name:'Синтетический клиент',username:'synthetic_client',locale:'ru',balance:0,referral_count:0,orders:[]};
const client={id:5,first_name:'Синтетический клиент',username:'synthetic_client',telegram_id_mask:'••••0005',bot_status:'active',tags:[],active_visa_count:1,requires_attention:false};
const common={user_id:5,description:'Локальный синтетический пример.',link_url:null,start_date:'2026-09-01',end_date:'2026-11-15',price_amount:'2500000',price_currency:'IDR',price_unit:'month',publication_status:'PUBLISHED',version:1,notifications_enabled:false,notifications_available:false,created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
const life=[{...common,id:21,kind:'bike',title:'Yamaha NMAX · тест',quantity:2,rental_mode:'monthly',end_date:null},{...common,id:22,kind:'housing',title:'Вилла · тест',housing_type:'villa',quantity:1},{...common,id:23,kind:'insurance',title:'Страховка · тест',price_unit:'policy',quantity:1}];
const visas=[{id:41,user_id:5,country_code:'ID',visa_type:{code:'E33G',name:'E33G · тест',version:1},lifecycle_status:'ACTIVE',service_status:'COMPLETED',publication_status:'PUBLISHED',notifications_enabled:false,entered_on:'2026-09-01',entry_deadline:'2026-09-01',stay_end:'2027-09-01',date_source:'BOSS_ADMIN',processes:[],version:1}];
const projection={projection_id:'synthetic-preview-only',publication_version:1,catalog_version_id:1,catalog_version:1,fx_snapshot_id:1,formula_version:'existing-test-fixture',currency:'IDR',fx:{version:1,status:'unavailable',ask_idr_per_usdt:null,is_manual_override:false},items:[],derived_expires_at:new Date(Date.now()-1000).toISOString()};
const result={status:'RUNNING',error:null,cases:[],errors:[],unexpectedMutations:0,expectedPermissionDenials:0,realCustomerData:false,personalProfileUsed:false,realSubmissions:false};let server,browser,analyticsScope='owner';
try{
 const fixture={name:'client-preview-synthetic-route',configureServer(server){server.middlewares.use((req,res,next)=>{const path=req.url.split('?')[0];if(path.startsWith('/account/preview/')){res.setHeader('Content-Security-Policy',"frame-ancestors 'self'");req.url='/account/index.html';}else if(/^\/admin\/.+\/$/.test(path))req.url='/admin/index.html';next();});}};
 server=await createServer({root,plugins:[fixture],server:{host:'127.0.0.1',port:0}});await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.REGISTRY_BROWSER_EXECUTABLE,args:['--autoplay-policy=user-gesture-required','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'ru',reducedMotion:'reduce'});let previewGets=0;
 await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());const json=value=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  if(u.origin!==base)return route.fulfill({status:200,contentType:'application/javascript',body:''});
  if(!['GET','HEAD'].includes(req.method())){result.unexpectedMutations++;return route.abort();}
  if(u.pathname==='/api/catalog/pricing')return json(projection);
  if(u.pathname==='/api/web/admin/session')return json({authenticated:true,actor:{id:1,role:'admin',first_name:'Synthetic admin',locale:'ru'},csrf_token:'synthetic-only'});
  const preview=u.pathname.match(/^\/api\/web\/admin\/clients\/5\/account-preview\/(.*)$/);if(preview){previewGets++;if(preview[1]==='account')return json(dashboard);if(preview[1]==='life-services')return json({items:life});if(preview[1]==='visa-cases')return json({items:visas});if(preview[1]==='chat')return json({items:[],messages:[]});}
  if(u.pathname==='/api/web/admin/clients')return json({items:[client],total:1});
  if(u.pathname==='/api/web/admin/clients/5')return json({client,visa_cases:visas,notes:[],credentials:[],dialogue:{id:null,status:'empty',messages:[]}});
  if(u.pathname==='/api/web/admin/clients/5/life-services')return json({items:life});
  if(u.pathname==='/api/web/admin/settings')return json({visa_types:[{code:'E33G',name:'E33G',settings_version:1,active:true,rules_verified:false}],services:[],exchange_routes:[]});
  if(u.pathname==='/api/web/admin/service-reminders')return json({version:1,versions:[],policy:{enabled:false,long_term_threshold_days:100,long_offsets:[40,30,15,7,3,2,1],short_offsets:[15,7,3,2,1],timezone:'Asia/Makassar',monthly_basis:'explicit_end_only'}});
  if(u.pathname==='/api/web/admin/onboarding')return json({enabled:false,revision:1,activation_cutoff:null,published_version:null,draft:{welcome_text:'Synthetic only',followup_text:'Synthetic only'},preview:{parts:[],followup_text:'Synthetic only',valid:true},versions:[]});
  if(u.pathname==='/api/web/admin/pricing')return json({active:null,active_fx:null,items:[],catalog_history:[],fx_history:[]});
  if(u.pathname==='/api/web/admin/analytics/policy'){if(analyticsScope==='staff'){result.expectedPermissionDenials++;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({detail:'synthetic-policy-access-denied'})});}return json({enabled:false,policy_revision:1,privacy_notice_version:'synthetic-local-only'});}
  if(u.pathname==='/api/web/admin/analytics/aggregates')return json({scope:analyticsScope==='owner'?'owner':'assigned_services',items:[{day:'2026-10-05',event_name:'page_view',service_id:'visa',event_count:5}]});
  if(u.pathname==='/api/web/admin/analytics/events'){if(analyticsScope==='staff'){result.expectedPermissionDenials++;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({detail:'synthetic-raw-access-denied'})});}return json({scope:'owner',next_after_id:1,items:[{id:1,event_key:'synthetic-key',session_key:'synthetic-session',received_at:'2026-10-05T12:00:00Z',event_name:'page_view',content_id:'e33g',service_id:'visa',country:'ID',locale:'ru',browser:'other',device:'desktop',amount:null,currency:null}]});}
  if(u.pathname.startsWith('/api/'))return json({items:[],total:0});return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
 await page.goto(base+'/admin/clients/5/preview/',{waitUntil:'load'});
 const frame=()=>page.frameLocator('iframe.account-preview-frame');await frame().locator('.life-card').first().waitFor();assert.equal(await frame().locator('.life-card').count(),4);
 const buttons=[['Телефон',390],['Планшет',820],['Компьютер',1440]];
 for(const [label,width] of buttons){await page.getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(80);assert.equal(Math.round(await page.locator('iframe').evaluate(el=>el.getBoundingClientRect().width)),width);assert.equal(await frame().locator('.life-card').count(),4);assert.equal(await frame().locator('.account-preview-banner').count(),1);
  await page.screenshot({path:output+'screenshots/client-preview-'+width+'.png',fullPage:false});result.cases.push({id:'client-preview',width,status:'PASS'});
 }
 const iframePage=page.frames().find(f=>f.url().includes('/account/preview/5/'));assert.ok(iframePage);
 const denied=await iframePage.evaluate(async()=>{const {appApiClient}=await import('/src/api/client.ts');try{await appApiClient().request('/api/web/chat',{method:'POST',body:'{}'});return false;}catch{return true;}});assert.equal(denied,true);
 await iframePage.locator('.life-categories button').filter({hasText:'Визы'}).click();assert.equal(await iframePage.locator('.life-card').count(),1);
 await iframePage.getByRole('button',{name:'Профиль',exact:true}).first().click();assert.ok(iframePage.url().includes('/account/preview/5/profile/'));assert.ok(previewGets>0);
 await page.goto(base+'/admin/clients/5/',{waitUntil:'load'});await page.locator('.admin-client-preview-link').waitFor();await page.locator('.admin-visa-tiles .admin-service-countdown').first().waitFor();assert.equal(await page.locator('.admin-visa-tiles button').count(),1);
 await page.locator('.admin-visa-tiles').scrollIntoViewIfNeeded();await page.screenshot({path:output+'screenshots/admin-service-tiles-desktop.png'});result.cases.push({id:'admin-visa-countdown',status:'PASS'});
 for(const role of ['owner','staff']){
  analyticsScope=role;await page.goto(base+'/admin/settings/',{waitUntil:'load'});await page.getByRole('button',{name:'Аналитика',exact:true}).click();
  const panel=page.locator('section[aria-labelledby="analytics-heading"]');await panel.locator('tbody tr').first().waitFor();assert.equal(await panel.locator('tbody tr').first().locator('td').nth(3).textContent(),'5');
  if(role==='owner'){await panel.locator('code').waitFor();assert.equal(await panel.locator('code').textContent(),'synthetic-session');assert.equal(await panel.locator('details').count(),1);assert.equal(await panel.getByRole('button',{name:'Следующие 50 событий',exact:true}).isDisabled(),true);}
  else{await panel.getByText('История событий недоступна этому аккаунту.',{exact:false}).waitFor();assert.equal(await panel.locator('details').count(),0);assert.equal(await panel.locator('tbody tr').count(),1);}
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:output+'screenshots/admin-analytics-'+role+'-desktop.png'});result.cases.push({id:'analytics-read-only-'+role,status:'PASS'});
 }
 assert.equal(result.unexpectedMutations,0);assert.deepEqual(result.errors,[]);result.status='PASS';await context.close();console.log(JSON.stringify({status:result.status,cases:result.cases.length}));
}catch(error){result.status='FAIL';result.error=String(error);throw error;}
finally{if(browser)await browser.close();if(server)await server.close();result.browserClosed=true;result.ownedServerStopped=true;writeFileSync(output+'CLIENT_PREVIEW_BROWSER_VERIFICATION.json',JSON.stringify(result,null,2)+'\n');}
