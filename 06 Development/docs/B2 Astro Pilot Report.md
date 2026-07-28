# B2 — Astro Pilot Report

Дата: 2026-07-28
Статус: выполнен локально, не выпущен

## Результат

Создано отдельное приложение:

`06 Development/astro-site`

Оно использует:

- Astro `7.1.4`;
- Content Collections;
- static output;
- directory format и trailing slash;
- shared design tokens `1.1.0`;
- deterministic preview content snapshot;
- Node test runner;
- Playwright;
- axe;
- Lighthouse CI.

Next/Vinext не удалён, не переписан и остаётся эталоном до B4.

## Pilot contract — 7/7

1. `/`;
2. `/directions/`;
3. `/directions/bali/`;
4. `/directions/bali/visas/`;
5. `/directions/bali/visas/e33g/`;
6. `/directions/bali/visas/d12/`;
7. `/directions/bali/visas/voa/`.

Каждый маршрут:

- создаётся отдельным HTML;
- работает без JavaScript;
- имеет уникальные title и description;
- имеет один H1;
- имеет self-referencing canonical;
- имеет Open Graph и Twitter metadata;
- имеет безопасный JSON-LD;
- имеет видимые breadcrumbs;
- не содержит localhost или `:8081`;
- использует обычные HTML-ссылки.

## Content и visa gate

Редакционная структура страниц хранится в Astro Content Collections.

Визовые данные для pilot preview экспортируются из существующего bot legacy
source в:

`src/data/generated/pilot-snapshot.v1.json`

Snapshot:

- детерминирован;
- имеет `schemaVersion`;
- immutable;
- содержит SHA-256 каждого content entry;
- сохраняет точный legacy-текст E33G, D12 и VOA;
- не меняет смысл;
- не создаёт источники;
- не устанавливает `lastVerifiedAt`;
- не разрешает production cutover.

Четыре визовых страницы получают:

- `legacy_needs_sources`;
- `noindex,follow`;
- видимое предупреждение;
- видимую пустую дату официальной проверки;
- видимый статус отсутствия официальных источников;
- исключение из sitemap.

Sitemap содержит только главную, направления и Бали.

## Навигация

- выбор направления открывает отдельную Astro-страницу;
- выбор визы открывает отдельную Astro-страницу;
- ссылки не отправляют `/start` в Telegram;
- единственный выход в Telegram — явная кнопка «Написать менеджеру»;
- `/account/` остаётся точкой будущего one-hop redirect по B1 contract;
- неизвестный URL возвращает настоящий `404`.

## Performance

Публичный pilot:

- не загружает React;
- не загружает Telegram SDK;
- не загружает account;
- не загружает Manager Chat;
- не содержит клиентских JS-файлов;
- CSS находится внутри budget `40 KB`.

Lighthouse CI:

| Маршрут | Performance | Accessibility | Best Practices | SEO |
| --- | ---: | ---: | ---: | ---: |
| `/` | 100 | 100 | 100 | 100 |
| `/directions/` | 100 | 100 | 100 | 100 |
| `/directions/bali/` | 100 | 100 | 100 | 100 |

## Проверки

| Контур | Результат |
| --- | ---: |
| Astro check | 0 errors, 0 warnings, 0 hints |
| Static, SEO, artifact и reference parity | 9/9 |
| Playwright navigation/mobile/404 | 3/3 |
| axe WCAG A/AA | 4/4 |
| Shared B1 contracts | 9/9 |
| Lighthouse routes | 3/3 |

Axe обнаружил недостаточный контраст исходного muted token. Правило не
отключалось: token исправлен на уровне общей design system, после чего все
проверки прошли.

## Future visual layer

`DestinationExperience.astro` является статической точкой расширения.
Тяжёлая графика не реализована. Ограничения будущего React/Canvas/WebGL слоя
описаны в `06 Development/docs/Future Visual Experience.md`.

## Известные ограничения

- перенесены только 7 из 45 Astro public routes;
- визовые источники ещё не проверены;
- production cutover запрещён;
- account и Mini App остаются в текущем reference до B3;
- content snapshot пока preview-only;
- публикация и hosting не выполнялись.

## Откат

B2 откатывается revert локальных B2-коммитов. Next/Vinext, FastAPI,
PostgreSQL, Cloudflare, Tunnel и production остаются неизменными.

## Готовность к B3

B3 может начинаться локально:

1. React/Vite scaffold на `app.safrway.online`.
2. Telegram runtime adapter.
3. Browser runtime adapter.
4. Account, Points, referrals, orders, profile и support.
5. Application contract `2/2`.

Push, deploy и production changes требуют отдельного разрешения.
