# SAFRWAY URL map

Статус проверки 2026-07-29: все 47 маршрутов с короткими country URL создаются
и семантически совпадают в Vinext и официальном Next.js static export.
Динамические API не включаются в HTML export.

Зафиксированный публичный контракт до стабилизации архитектуры.
Машиночитаемый manifest:
`06 Development/web/tests/public-routes.json`.

## Canonical

- основной протокол: `https`;
- основной host сайта: `safrway.online`;
- `www.safrway.online` должен делать один `301` на основной host;
- стандарт внутренних путей: нижний регистр и завершающий `/`;
- Mini App: `https://app.safrway.online/`;
- API: `https://api.safrway.online/`;
- `account`, `mini-app`, auth и API не входят в sitemap.

## Redirect со старых URL

- `/directions` и `/directions/` → `/catalog/`;
- `/directions/<путь>` и `/directions/<путь>/` → `/<путь>/`;
- статус redirect: `308`;
- query string сохраняется;
- redirect выполняется за один переход;
- старые URL отсутствуют в canonical и sitemap.

## Базовые страницы

- `/`;
- `/catalog/`;
- `/account/`;
- `/privacy/`;
- build route `/mini-app/`, публичный URL `https://app.safrway.online/`.

## Бали

- `/bali/`;
- `/bali/visas/`;
- `/bali/visas/e33g/`;
- `/bali/visas/d12/`;
- `/bali/visas/d1-d2/`;
- `/bali/visas/c1/`;
- `/bali/visas/voa/`;
- `/bali/visas/other-visa/`;
- `/bali/housing/`;
- `/bali/housing/villa/`;
- `/bali/housing/guesthouse/`;
- `/bali/housing/buy-property/`;
- `/bali/housing/inspect-property/`;
- `/bali/housing/housing-videos/`;
- `/bali/housing/housing-risks/`;
- `/bali/exchange/`;
- `/bali/exchange/usdt-idr/`;
- `/bali/exchange/other-exchange/`;
- `/bali/assistant/`.

## Таиланд

- `/thailand/`;
- `/thailand/exchange/`;
- `/thailand/visas/`;
- `/thailand/property/`;
- `/thailand/yachts/`.

## Россия

- `/russia/`;
- `/russia/spb/`;
- `/russia/spb/sup-spb/`;
- `/russia/spb/boat-spb/`;
- `/russia/spb/fire-spb/`;
- `/russia/ural/`;
- `/russia/ural/sup-ural/`;
- `/russia/ural/rafting-ural/`;
- `/russia/ural/fire-ural/`;
- `/russia/ural/retreat-ural/`;
- `/russia/caucasus/`.

## Непал

- `/nepal/`;
- `/nepal/kailash/`;
- `/nepal/everest/`;
- `/nepal/annapurna/`;
- `/nepal/transfer/`;
- `/nepal/housing/`;
- `/nepal/guide/`.

## Динамические интерфейсы

Эти пути обслуживает FastAPI, они не являются частью static export:

- `/health`;
- `/db/health`;
- `/mini-app/me`;
- `/api/web/auth/*`;
- `/api/web/account`;
- `/api/web/chat*`;
- `/api/web/staff/*`;
- `/admin/*`;
- `/bot-events/*`;
- `/orders/*`;
- `/payments/*`;
- `/points/*`;
- `/referrals/*`;
- `/services`;
- `/users/*`.

Изменение или удаление любого из 47 публичных HTML-маршрутов требует
отдельной карты redirect и проверки отсутствия цепочек.
