import { useMemo, useState, type ReactNode } from 'react';
import { AdminPricingCatalog } from './AdminPricingCatalog';
import { BusinessSettingsEditor, ExchangeSettingsEditor } from './AdminBusinessSettings';
import { AppIcon } from './AppIcon';
import {AdminAnalytics} from './AdminAnalytics';
import { businessEntityAvailability, businessEntityLabel, businessEntityMatches, groupBusinessEntities, BUSINESS_CATEGORIES, type BusinessEntityGroup, type BusinessPriceIdentity } from './businessCategories';
import './business-settings.css';

type Entity = Record<string, unknown>;
type Props = { locale: 'ru' | 'en'; csrfToken: string; data: null | { visa_types?: Entity[]; services?: Entity[]; exchange_routes?: Entity[] }; onChanged: () => Promise<void> | void; notifications: ReactNode };

export function AdminBusinessWorkspace({ locale, csrfToken, data, onChanged, notifications }: Props) {
  const [section, setSection] = useState('catalog');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [priceItems, setPriceItems] = useState<BusinessPriceIdentity[] | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const entities = useMemo(() => groupBusinessEntities(data, priceItems ?? []), [data, priceItems]);
  const visible = entities.filter(entity => entity.id === selectedEntity || businessEntityMatches(entity, category, query));
  const tabs = [
    { id: 'catalog', ru: 'Каталог и цены', en: 'Catalog & prices', icon: '▦' },
    { id: 'availability', ru: 'Доступность услуг', en: 'Availability', icon: 'check' },
    { id: 'fx', ru: 'Курс', en: 'Exchange rate', icon: '↻' },
    { id: 'exchange', ru: 'Обмен', en: 'Exchange', icon: '↔' },
    { id: 'notifications', ru: 'Уведомления', en: 'Notifications', icon: '◌' },
    { id: 'analytics', ru: 'Аналитика', en: 'Analytics', icon: '▦' },
  ];

  function openEntity(entity: BusinessEntityGroup, destination: 'catalog' | 'availability') {
    setSelectedEntity(entity.id);
    setSection(destination);
    window.requestAnimationFrame(() => document.getElementById(destination + '-' + entity.id)?.focus());
  }

  return <div className="business-workspace">
    <nav className="business-navigation" aria-label={locale === 'ru' ? 'Настройки бизнеса' : 'Business settings'}>
      {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={section === tab.id} onClick={() => setSection(tab.id)}><AppIcon name={tab.icon}/><span>{tab[locale]}</span></button>)}
    </nav>
    <div className="business-filters" hidden={section !== 'catalog' && section !== 'availability'}>
      <div className="business-categories" role="group" aria-label={locale === 'ru' ? 'Категория услуги' : 'Service category'}>
        {[{ id: 'all', ru: 'Все', en: 'All', icon: '▦' }, ...BUSINESS_CATEGORIES].map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setSelectedEntity(null); }}><AppIcon name={item.icon}/><span>{item[locale]}</span><small>{item.id === 'all' ? entities.length : entities.filter(entity => entity.category === item.id).length}</small></button>)}
      </div>
      <label className="business-search"><AppIcon name="search"/><input type="search" aria-label={locale === 'ru' ? 'Найти услугу или визу' : 'Find a service or visa'} placeholder={locale === 'ru' ? 'Найти услугу или визу' : 'Find a service or visa'} value={query} onChange={event => { setQuery(event.target.value); setSelectedEntity(null); }}/></label>
    </div>
    {/* One pricing store and stable, mounted editors preserve drafts across sections and filters. */}
    <AdminPricingCatalog csrfToken={csrfToken} locale={locale} data={data} category={category} query={query} view={section === 'catalog' || section === 'fx' ? section : 'hidden'} expandedEntity={selectedEntity} onExpandedEntityChange={setSelectedEntity} onPriceItemsLoaded={setPriceItems} onOpenSettings={entity => openEntity(entity, 'availability')}/>
    <section hidden={section !== 'availability'} className="admin-panel business-availability">
      <div className="business-catalog-heading"><div><h2>{locale === 'ru' ? 'Доступность услуг' : 'Service availability'}</h2><p>{locale === 'ru' ? 'Названия, доступность и оплата Points. Категория и поиск общие с каталогом.' : 'Names, availability and Points payments. Category and search are shared with the catalog.'}</p></div><span className="business-count">{visible.length}</span></div>
      {!data && <p>{locale === 'ru' ? 'Загружаем настройки…' : 'Loading settings…'}</p>}
      <div className="business-entity-list">{entities.map(entity => {
        const { source: item, entityType: type } = entity;
        const active = businessEntityAvailability(entity);
        const status = active === null ? (locale === 'ru' ? 'Доступность не указана' : 'Availability not provided') : active ? (locale === 'ru' ? 'Доступна' : 'Available') : (locale === 'ru' ? 'Скрыта' : 'Hidden');
        return <article key={entity.id} id={'availability-' + entity.id} tabIndex={-1} hidden={entity.id !== selectedEntity && !businessEntityMatches(entity, category, query)} className={'business-entity-row' + (entity.id === selectedEntity ? ' is-selected' : '')}>
          <span className="business-service-icon"><AppIcon name={BUSINESS_CATEGORIES.find(item => item.id === entity.category)?.icon ?? '✦'}/></span>
          <div className="business-entity-copy"><strong>{businessEntityLabel(entity, locale)}</strong><small>{entity.entityKey ? entity.entityKey + ' · ' : ''}{status}{item?.can_pay_with_points === true ? ' · Points' : ''}</small><small>{priceItems === null ? (locale === 'ru' ? 'Цены не загружены' : 'Prices not loaded') : entity.variants.length ? (locale === 'ru' ? 'Вариантов цены: ' : 'Price options: ') + entity.variants.length : (locale === 'ru' ? 'Цена не задана' : 'No price configured')}</small></div>
          <div className="business-entity-actions">
            <button type="button" className="business-link" onClick={() => openEntity(entity, 'catalog')}>{locale === 'ru' ? 'Цены этой услуги' : 'Prices for this service'}</button>
            {item && entity.entityKey ? <BusinessSettingsEditor entityType={type} entity={item as { code: string; slug: string; name: string; settings_version: number }} csrfToken={csrfToken} locale={locale} onChanged={onChanged}/> : <small>{locale === 'ru' ? 'Настройки услуги не загружены' : 'Service settings are not loaded'}</small>}
          </div>
        </article>;
      })}</div>
      {data && visible.length === 0 && <p className="business-empty">{entities.length ? (locale === 'ru' ? 'Ничего не найдено. Попробуйте другую категорию или название.' : 'No matches. Try another category or name.') : (locale === 'ru' ? 'Список услуг пока пуст.' : 'The service list is empty.')}</p>}
    </section>
    <section hidden={section !== 'exchange'} className="admin-panel business-exchange">
      <div className="business-catalog-heading"><div><h2>{locale === 'ru' ? 'Маршруты обмена' : 'Exchange routes'}</h2><p>{locale === 'ru' ? 'Комиссии и условия расчёта по каждому маршруту.' : 'Fees and quote settings for each route.'}</p></div></div>
      {!(data?.exchange_routes?.length) && <p className="business-empty">{locale === 'ru' ? 'Маршруты обмена не загружены.' : 'Exchange routes are not loaded.'}</p>}
      <div className="business-entity-list">{(data?.exchange_routes ?? []).map(item => {
        const settings = (item.settings ?? {}) as Record<string, unknown>;
        return <article key={String(item.route_code)} className="business-entity-row"><span className="business-service-icon"><AppIcon name="↔"/></span><div><strong>{String(item.route_code)}</strong><small>{locale === 'ru' ? 'Комиссия SAFRWAY' : 'SAFRWAY fee'}: {String(settings.safrway_fee_percent ?? '—')}%</small></div><ExchangeSettingsEditor route={item as { route_code: string; version: number; settings: Record<string, unknown> }} csrfToken={csrfToken} locale={locale} onChanged={onChanged}/></article>;
      })}</div>
    </section>
    <div hidden={section !== 'notifications'}>{notifications}</div>
    {section==='analytics'&&<AdminAnalytics locale={locale} csrfToken={csrfToken}/>}
  </div>;
}
