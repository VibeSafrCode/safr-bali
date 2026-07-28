# SAFRWAY URL map

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

## Базовые страницы

- `/`;
- `/directions/`;
- `/account/`;
- `/privacy/`;
- build route `/mini-app/`, публичный URL `https://app.safrway.online/`.

## Бали

- `/directions/bali/`;
- `/directions/bali/visas/`;
- `/directions/bali/visas/e33g/`;
- `/directions/bali/visas/d12/`;
- `/directions/bali/visas/d1-d2/`;
- `/directions/bali/visas/c1/`;
- `/directions/bali/visas/voa/`;
- `/directions/bali/visas/other-visa/`;
- `/directions/bali/housing/`;
- `/directions/bali/housing/villa/`;
- `/directions/bali/housing/guesthouse/`;
- `/directions/bali/housing/buy-property/`;
- `/directions/bali/housing/inspect-property/`;
- `/directions/bali/housing/housing-videos/`;
- `/directions/bali/housing/housing-risks/`;
- `/directions/bali/exchange/`;
- `/directions/bali/exchange/usdt-idr/`;
- `/directions/bali/exchange/other-exchange/`;
- `/directions/bali/assistant/`.

## Таиланд

- `/directions/thailand/`;
- `/directions/thailand/exchange/`;
- `/directions/thailand/visas/`;
- `/directions/thailand/property/`;
- `/directions/thailand/yachts/`.

## Россия

- `/directions/russia/`;
- `/directions/russia/spb/`;
- `/directions/russia/spb/sup-spb/`;
- `/directions/russia/spb/boat-spb/`;
- `/directions/russia/spb/fire-spb/`;
- `/directions/russia/ural/`;
- `/directions/russia/ural/sup-ural/`;
- `/directions/russia/ural/rafting-ural/`;
- `/directions/russia/ural/fire-ural/`;
- `/directions/russia/ural/retreat-ural/`;
- `/directions/russia/caucasus/`.

## Непал

- `/directions/nepal/`;
- `/directions/nepal/kailash/`;
- `/directions/nepal/everest/`;
- `/directions/nepal/annapurna/`;
- `/directions/nepal/transfer/`;
- `/directions/nepal/housing/`;
- `/directions/nepal/guide/`.

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
