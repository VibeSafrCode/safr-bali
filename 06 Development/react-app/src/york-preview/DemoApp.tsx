import React, {useState} from 'react';
import {activeDestinations,activeServices} from '../catalog';
import previewBrands from '../../../shared/brands/preview-brands.v1.json';
import {yogaRouteAllowed} from '../../../shared/src/yoga-content-policy.mjs';

const brand=previewBrands.brands.find(record=>record.brandId==='york-gangster');
if(!brand)throw new Error('Missing synthetic preview brand');
const brandName=brand.displayName;

type Locale='ru'|'en';
type Role='customer'|'partner';
type Props={route:string;locale:Locale};
declare const __YOGA_PREVIEW_BASE__:string;
const previewBase=typeof __YOGA_PREVIEW_BASE__==='string'?__YOGA_PREVIEW_BASE__:'';
if(!['','/yoga-preview'].includes(previewBase))throw new Error('Invalid synthetic preview base');
const sourceRoute=(route:string)=>route.startsWith('/en/')?route.slice(3):route;
const href=(route:string,locale:Locale)=>previewBase+(locale==='en'?'/en'+route:route);

function Tabs({owner=false,partner=false,route,locale}:Props&{owner?:boolean;partner?:boolean}) {
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  const entries=owner?[
    ['/owner/influencers/',t('Партнёры','Partners')],
    ['/owner/influencers/york-gangster/business/',t('Условия','Settings')],
    ['/owner/publications/',t('Публикации','Publications')],
  ]:partner?[
    ['/influencer/overview/',t('Обзор','Overview')],['/influencer/network/',t('Сеть','Network')],
    ['/influencer/earnings/',t('Начисления','Earnings')],['/influencer/terms/',t('Мои условия','My rates')],['/influencer/links/',t('Ссылки','Links')],
  ]:[['/account/',t('Обзор','Overview')],['/account/orders/',t('Заявки','Orders')],['/account/referrals/',t('Рефералы','Referrals')],['/account/points/','Points']];
  return <nav className="tabs" aria-label={t('Разделы демонстрации','Demo sections')}>{entries.map(([path,label])=><a key={path} href={href(path,locale)} aria-current={sourceRoute(route)===path?'page':undefined}>{label}</a>)}</nav>;
}

function Network({partner,locale}:{partner:boolean;locale:Locale}) {
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  const names=partner?[brandName+' · '+t('демо партнёра','partner demo'),'DEMO A','DEMO B','DEMO C']:['DEMO A · '+t('ваш демо аккаунт','your demo account'),'DEMO B','DEMO C','DEMO D'];
  return <section className="panel"><h2>{t('Три уровня приглашений','Three invitation levels')}</h2><p>{t('Все узлы вымышленные. Нет имён, контактов или данных клиентов.','Every node is fictional. No customer names, contacts or records are used.')}</p><ol className="network">{names.map((name,index)=><li key={name}><strong>{name}</strong><br/>{index===0?t('Корень этой демонстрационной сети','Root of this demo network'):t('Уровень','Level')+' '+index}</li>)}</ol><p>{t('Будущий сервер должен сохранять первоначального пригласившего. Переход по ссылке не даёт доступа к чужой сети.','The future server must retain the original inviter. Following a link cannot grant access to another network.')}</p></section>;
}

function Rates({locale}:{locale:Locale}) {
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  return <section className="panel"><h2>{t('Условия вознаграждений','Reward settings')}</h2><p>{t('Реальные ставки не назначены. Макет не рассчитывает выплаты или Points.','Actual rates are not configured. This demo calculates neither payouts nor Points.')}</p><div className="table-wrap" tabIndex={0} role="region" aria-label={t('Демонстрационная таблица ставок','Demo rates table')}><table><thead><tr><th scope="col">{t('Услуга','Service')}</th>{[1,2,3].map(level=><th scope="col" key={level}>{t('Уровень','Level')} {level}</th>)}</tr></thead><tbody>{['D12','E33G','eVOA'].map(service=><tr key={service}><th scope="row">{service}</th>{[1,2,3].map(level=><td key={level}>{t('Не заданы','Not configured')}</td>)}</tr>)}</tbody></table></div></section>;
}

function Enquiry({locale}:{locale:Locale}) {
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  const services=activeDestinations(locale).flatMap(country=>activeServices(country,locale).filter(service=>yogaRouteAllowed('/'+country.id+'/'+service.id+'/')).map(service=>({id:country.id+'/'+service.id,label:country.name+' · '+service.name})));
  const [status,setStatus]=useState('');
  return <section className="panel"><h2>{t('Демонстрация обращения','Enquiry demonstration')}</h2><p>{t('Не вводите личные данные. Текст остаётся только на этом экране и исчезает после обновления страницы.','Do not enter personal information. Text stays on this screen only and disappears after reloading.')}</p><form className="demo-form" onSubmit={event=>{event.preventDefault();setStatus(t('Демонстрация завершена. Заявка не создавалась, сообщение не отправлялось.','Demo completed. No order was created and no message was sent.'));}}><label>{t('Услуга из общего каталога','Service from the shared catalog')}<select name="demo-service">{services.map(service=><option key={service.id} value={service.id}>{service.label}</option>)}</select></label><label>{t('Пробный текст','Example text')}<textarea name="demo-text" rows={4} maxLength={1000} placeholder={t('Только вымышленный пример','Fictional example only')}/></label><button className="button" type="submit">{t('Посмотреть подтверждение','Preview confirmation')}</button></form><p className="status" role="status">{status}</p></section>;
}

function BotDemo({locale}:{locale:Locale}) {
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  const [role,setRole]=useState<Role>('customer');
  const [log,setLog]=useState<string[]>([]);
  const commands=role==='partner'?['/start','/services','/account','/referrals','/support','/language','/earnings','/network','/terms']:['/start','/services','/account','/referrals','/support','/language'];
  function run(command:string) {
    const responses:Record<string,string>={
      '/start':t(`Добро пожаловать в демонстрацию ${brandName}. Это не Telegram.`,`Welcome to the ${brandName} demo. This is not Telegram.`),
      '/services':activeDestinations(locale).map(country=>country.name+': '+activeServices(country,locale).filter(service=>yogaRouteAllowed('/'+country.id+'/'+service.id+'/')).map(service=>service.name).join(', ')).join('\n'),
      '/account':href(role==='partner'?'/influencer/overview/':'/account/',locale),
      '/referrals':t('Только вымышленная сеть. Первоначальный пригласивший не изменяется.','Fictional network only. The original inviter is retained.'),
      '/support':t('Макет обращения. Команде ничего не отправляется.','Enquiry demonstration. Nothing is sent to the team.'),
      '/language':t('RU / EN · язык можно сменить в шапке страницы.','RU / EN · change the language in the page header.'),
      '/earnings':t('Ставки не заданы. Реальных начислений нет.','Rates are not configured. No real earnings exist.'),
      '/network':brandName+' → DEMO A → DEMO B → DEMO C',
      '/terms':t('Условия будущего партнёра пока не назначены.','Future partner terms are not configured.'),
    };
    setLog(previous=>[...previous,command+'\n'+responses[command]].slice(-20));
  }
  return <section className="panel"><div className="role-selector"><label htmlFor="bot-demo-role">{t('Демонстрационная роль','Demo role')}</label><select id="bot-demo-role" value={role} onChange={event=>{setRole(event.target.value as Role);setLog([]);}}><option value="customer">{t('Клиент','Customer')}</option><option value="partner">{t('Партнёр','Partner')}</option></select></div><h2>{role==='partner'?t('Меню партнёра','Partner menu'):t('Меню клиента','Customer menu')}</h2><p>{t('Нет токена, Telegram-соединения, авторизации или регистрации.','No token, Telegram connection, authentication or registration.')}</p><div className="bot-menu">{commands.map(command=><button className="button secondary" key={command} onClick={()=>run(command)}>{command}</button>)}</div><div className="bot-log" role="log" aria-label={t('Демонстрационный диалог','Demo conversation')}>{log.map((message,index)=><div key={index} className="bot-message">{message}</div>)}</div><button className="button secondary" onClick={()=>setLog([])}>{t('Сбросить диалог','Reset conversation')}</button></section>;
}

export function DemoApp({route,locale}:Props) {
  const source=sourceRoute(route);
  const t=(ru:string,en:string)=>locale==='ru'?ru:en;
  if(source==='/contacts/')return <Enquiry locale={locale}/>;
  if(source==='/bot-demo/')return <BotDemo locale={locale}/>;
  if(source.startsWith('/owner/'))return <><p className="notice">{t('Лаборатория владельца, не защищённая админка. Все данные вымышленные. В production этот интерфейс здесь не публикуется.','Owner laboratory, not a protected admin. All records are fictional. This interface is not published here in production.')}</p><Tabs owner route={route} locale={locale}/>{source==='/owner/publications/'?<section className="panel"><h2>{t('Общая публикация контента','Shared content publication')}</h2><p>{t('RU/EN читаются напрямую из утверждённого Registry. Очередь доставки и рабочий выпуск не подключены.','RU/EN are imported directly from the approved Registry. Delivery queues and live publishing are not connected.')}</p></section>:source==='/owner/influencers/'?<a className="catalog-card" href={href('/owner/influencers/york-gangster/business/',locale)}><h2>{brandName}</h2><p>{t('Демонстрационный бренд · RU/EN','Demo brand · RU/EN')}</p></a>:<><section className="panel"><h2>{t('Каталог и цены','Catalog and pricing')}</h2><p>{t('Только общий опубликованный каталог. Персональные цены и коммерческие переопределения не реализованы.','Shared published catalog only. Individual prices and commercial overrides are not implemented.')}</p></section><Rates locale={locale}/></>}</>;
  const partner=source.startsWith('/influencer/');
  if(source==='/influencer/')return <section className="panel"><h2>{t('Посмотреть кабинет','Explore the account')}</h2><p>{t('Без входа: это вымышленные записи, а не авторизованный партнёр.','No sign-in: these are fictional records, not an authenticated partner.')}</p><a className="button" href={href('/influencer/overview/',locale)}>{t('Открыть демо партнёра','Open partner demo')}</a></section>;
  return <><p className="notice">{t('Синтетические записи. Переход между ролями не является входом или разрешением доступа.','Synthetic records. Switching roles is neither sign-in nor access authorization.')}</p><Tabs route={route} locale={locale} partner={partner}/>{source.endsWith('/network/')||source.endsWith('/referrals/')?<Network locale={locale} partner={partner}/>:source.endsWith('/terms/')?<Rates locale={locale}/>:source.endsWith('/links/')?<section className="panel"><h2>{t('Демонстрационная ссылка','Demo link')}</h2><p>{href('/account/',locale)}?demo_ref=york-gangster</p><p>{t('Это только пример, регистрация и назначение пригласившего не выполняются.','Illustration only: no registration or inviter assignment takes place.')}</p></section>:source.endsWith('/orders/')?<section className="panel"><h2>DEMO D12</h2><p>{t('Вымышленная заявка · ожидает ответа команды. Реальный заказ не создавался.','Fictional request · awaiting the team. No real order was created.')}</p><a className="button" href={href('/contacts/',locale)}>{t('Демо обращения','Demo enquiry')}</a></section>:<><div className="metrics">{[t('Начислено','Earned'),t('Выплачено','Paid'),t('Доступно','Available')].map(label=><section className="panel" key={label}><span>{label}</span><strong className="metric-value">—</strong><small>{t('Не реальный баланс','Not a real balance')}</small></section>)}</div><section className="panel"><h2>{t('История начислений','Earnings history')}</h2><p>{t('Нет реального кошелька, ставок, выплат или начислений. Подтверждение оплаты и выполнения услуги пока является будущим серверным контрактом.','No real wallet, rates, payouts or earnings. Confirmed payment and service completion remain a future server contract.')}</p></section></>}</>;
}
