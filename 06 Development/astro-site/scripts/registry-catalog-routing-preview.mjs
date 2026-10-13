// An authenticated editorial view, not a website menu or purchasable offering.
import {validateCatalogRoutingPlan} from '../../shared/src/catalog-country-routing.mjs';
const escape = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);

export function renderCatalogRoutingPreview(registry, locale = 'ru') {
  if (!registry.routingPlan || !registry.locales.some(row => row.code === locale)) return null;
  validateCatalogRoutingPlan(registry);
  const plan = registry.routingPlan;
  const reference = id => id ? `<a href="/_registry/${escape(id)}/?locale=${escape(locale)}">${escape(id)}</a>` : 'Не сопоставлено — требуется исходный пакет';
  const row = cells => '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
  const table = (titles, rows) => `<table><thead>${row(titles.map(escape))}</thead><tbody>${rows.join('')}</tbody></table>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
  <meta name="robots" content="noindex,nofollow"><title>SAFRWAY — план каталога</title>
  <style>body{font:16px/1.6 system-ui;color:#132a23;background:#f5f7f6;margin:auto;padding:24px;max-width:1200px}section{margin:24px 0}table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td{border:1px solid #ccd8d2;padding:8px;overflow-wrap:anywhere;min-width:120px}thead{font-weight:bold}a{color:#155c45}:focus-visible{outline:3px solid #155c45;outline-offset:3px}</style></head><body>
  <header><h1>План каталога и страновых маршрутов</h1><p>Закрытый просмотр. Семь групп пока не активированы в клиентском меню. Никаких новых услуг, цен, редиректов и публичных URL не создано.</p>
  <p>Редакционные названия предоставлены только на русском. Выбранная локаль ссылок: ${escape(locale)}. Статусы исходного пакета не подтверждают текущую публикацию или коммерческую доступность.</p>
  <a href="/_registry/?locale=${escape(locale)}">Существующие контентные записи</a></header>
  <main><section><h2>Предлагаемая навигация</h2>${table(['Группа', 'Подзаголовок'], plan.navigation.groups.map(group => row([escape(group.titleRU), escape(group.descriptionRU)])))}
  <p>Сохранённые быстрые входы: ${plan.navigation.quickLinkContentIds.map(reference).join(' · ')}</p></section>
  <section><h2>Бали — ${plan.bali.length} позиций, не 94 новых услуги</h2>${table(['Позиция', 'Существующая запись', 'Предложенный URL / представление', 'Условие'], plan.bali.map(item => row([escape(item.titleRU), reference(item.contentId), escape(item.proposedRoute) + ' · ' + escape(item.representation), escape(item.gate)])))}</section>
  <section><h2>Конфликты URL — текущие маршруты сохраняются</h2>${table(['Запись', 'Текущий кандидат', 'Редакционное предложение'], plan.bali.filter(item => item.routeConflict).map(item => row([reference(item.contentId), escape(registry.records.find(record => record.contentId === item.contentId)?.candidate.route), escape(item.editorialPreferredRoute)])))}</section>
  <section><h2>Международные визы — только preview</h2>${table(['Направление', 'Запись', 'Предложение', 'Контекст подачи'], plan.worldVisas.map(item => row([escape(item.titleRU), reference(item.contentId), escape(item.proposedRoute), 'Определяется по ситуации; ID — пример происхождения, не гражданство и не язык'])))}</section>
  <section><h2>Страны — отдельные сущности, не бизнес-услуги</h2>${table(['Страна', 'Сущность', 'Сохранённый / предложенный URL', 'Состояние плана'], plan.destinations.map(item => row([escape(item.nameRU), escape(item.entityId), escape(item.existingHub) + ' / ' + escape(item.proposedHub), escape(item.lifecycle)])))}</section>
  <section><h2>Knowledge</h2>${table(['Тема', 'Запись', 'Предложенный URL'], plan.knowledge.map(item => row([escape(item.label), reference(item.contentId), escape(item.proposedRoute)])))}</section>
  <section><h2>Глобальные входы</h2>${table(['Название', 'Запись', 'Предложенный URL', 'Ограничение'], plan.globalServices.map(item => row([escape(item.titleRU), reference(item.contentId), escape(item.proposedRoute), escape(item.notes)])))}</section></main></body></html>`;
}
