# B4 — Ecosystem Contract Report

Дата: 2026-07-28

Статус: ветка опубликована, закрытый full-stack preview развёрнут,
production не переключён

## Результат

Целевая архитектура собрана без переключения production:

- Astro создаёт `45/45` публичных HTML-маршрутов;
- React/Vite создаёт `2/2` application routes;
- ecosystem contract подтверждён: `47/47`;
- Next/Vinext остаётся работающим reference;
- FastAPI остаётся единственным слоем бизнес-логики;
- PostgreSQL остаётся source of truth транзакционных данных.

## Общий каталог

Framework-neutral source:

`06 Development/shared/src/catalog.ts`

Детерминированный content-addressed snapshot:

`06 Development/shared/content/generated/catalog-runtime.v1.json`

Snapshot:

- имеет schema version;
- содержит SHA-256 всей иерархии;
- имеет content-addressed ID;
- создаётся без production API и database;
- используется Astro и React;
- сохраняет legacy bot content без смыслового изменения.

Next/Vinext reference импортирует тот же source, поэтому переход не создаёт
вторую расходящуюся копию каталога.

## Astro public contract — 45/45

Каждый route:

- существует как отдельный `index.html`;
- имеет уникальные title и description;
- имеет один H1;
- имеет self-referencing canonical;
- содержит Open Graph, Twitter metadata и валидный JSON-LD;
- доступен обычными HTML-ссылками;
- не содержит localhost, `:8081`, секреты или server-only variables;
- возвращает отдельную страницу, а не SPA fallback.

Неизвестный URL использует настоящий `404`.

## Visa verification gate

Все семь Bali visa routes сохраняют `noindex,follow` и исключены из sitemap.
Статус теперь разделён по фактической готовности:

- D12 и eVOA — `verified`, official sources и critical facts добавлены;
- E33G и общий каталог виз — `needs_review`;
- D1/D2, C1 и «Другая виза» — `legacy_needs_sources`.

Каждая страница показывает собственный статус, дату проверки и ссылки на
добавленные первоисточники. Полный production cutover визового раздела
заблокирован статусом E33G и общего каталога.

Приоритетные страницы:

- `/directions/bali/visas/`;
- `/directions/bali/visas/e33g/`;
- `/directions/bali/visas/d12/`;
- `/directions/bali/visas/voa/`.

Невизовые страницы технически готовы и не блокируются отсутствием визовых
источников.

29 июля официальные карточки E33G, D12, B1/eVOA, E31B, E31E и E31H были
проверены на `imigrasi.go.id`. Preview-контент E33G, D12 и eVOA исправлен,
общие snapshots перегенерированы и прошли Astro/React/bot regression. Статус
страниц повышен раздельно: D12/eVOA получили `verified`, E33G и общий каталог
остались `needs_review`. Все визовые цены подтверждены как окончательные цены
под ключ, но для семейного сценария E33G ещё нужен практический маршрут
супруга. Детали: `docs/B4 Visa Source Audit.md`.

## Website support

На всех публичных страницах доступна одна закреплённая кнопка
«Написать менеджеру».

Она открывает панель без изменения `body overflow`, поэтому не блокирует
прокрутку. Пользователь может:

- отправить сообщение через same-origin `/api/web/chat/guest`;
- самостоятельно перейти в Telegram.

Telegram link существует только внутри этой панели. `/start` и скрытые
bot-команды отсутствуют.

## Account contract

- Astro не создаёт `/account/` как HTML;
- preview source использует один `307` на
  `https://app.safrway.online/account/`;
- React обслуживает конечный account;
- target имеет `noindex`;
- redirect не передаёт token, session, `initData` или чувствительные query;
- безопасный `return_to` валидируется FastAPI и сохраняется;
- production `308` не включён.

## Preview candidates

- `deploy/nginx/safr-astro-site.preview.conf`;
- `deploy/nginx/safr-react-app.preview.conf`.

Production-кандидаты не устанавливались. Для отдельной проверки установлен
`deploy/nginx/safr-closed-preview.conf.template`:

- release root `/var/www/safr-preview/releases/bfe3466`;
- origin-порты `127.0.0.1:8082` и `127.0.0.1:8083`;
- Basic Auth сайта, Telegram-совместимый gate Mini App и `noindex`;
- два временных Quick Tunnel;
- отдельный backend `127.0.0.1:8002`;
- отдельный PostgreSQL cluster `safrpreview:5433`;
- browser и Mini App API направлены только в preview backend.

Постоянный Cloudflare Tunnel, DNS и production Nginx routes не менялись.

## Проверки

| Контур | Результат |
| --- | ---: |
| Astro static/SEO/security/parity | 11/11 |
| Astro Playwright/axe/navigation/scroll/404 | 10/10 |
| React unit | 6/6 |
| React artifact/Nginx | 8/8 |
| React Playwright | 3/3 |
| Ecosystem artifact contract | 3/3 |
| Shared contracts | 9/9 |
| Next/Vinext reference | 50/50 |
| Lighthouse, 3 indexable routes | 100/100/100/100 |

Backend regression B4: 21 pass и 5 PostgreSQL-only skipped в изолированном
SQLite-прогоне. PostgreSQL race tests были отдельно подтверждены на временном
PostgreSQL в B0.

Реальный Telegram WebView на iPhone подтвердил Mini App session exchange,
dashboard и chat. Commit `072035e` добавил переносимые Linux/macOS browser
configs и GitHub Actions для PostgreSQL, Astro, React, shared contracts и
Next/Vinext reference. Remote Actions result ещё требует проверки в
авторизованном GitHub UI/CLI.

## Ограничения

- production cutover не выполнялся;
- migration candidates не применялись;
- production OIDC callback не менялся;
- визовые страницы не готовы к production cutover до финального content
  review и подтверждения семейного маршрута E33G;
- guest support preview не проверялся с реальным Telegram outbox;
- реальный Telegram Mini App smoke пройден; browser OIDC ожидает
  отдельные Telegram credentials;
- `308` остаётся выключенным.

## Откат

Closed preview удаляется остановкой двух временных Tunnel units, отключением
`safr-closed-preview` в Nginx и удалением `/var/www/safr-preview/current`.
Production не менялся.

После будущего cutover frontend rollback должен переключать immutable release
symlinks и прежний Nginx config. Database schema безопаснее оставить
forward-compatible; downgrade migrations допустим только после отдельной
проверки отсутствия новых зависимых данных.
