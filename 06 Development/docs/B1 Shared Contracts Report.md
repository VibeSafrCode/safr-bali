# B1 — Shared Contracts Report

Дата: 2026-07-28
Статус: выполнен локально, не выпущен

## Результат

B1 зафиксировал целевую архитектуру и framework-neutral contracts, не меняя
production runtime:

- Astro создаёт `45/45` публичных SEO-маршрутов;
- React/Vite обслуживает `2/2` application routes на
  `app.safrway.online`;
- общий ecosystem contract остаётся `47/47`;
- `/account/` является одной точкой redirect, а не копией кабинета;
- preview redirect использует `307`;
- production `308` существует в контракте, но выключен;
- Telegram и browser runtime используют серверную сессию;
- content и catalog snapshot имеют явную schema version;
- legacy-визы не получают фиктивный статус проверки;
- Astro и React получают общий versioned набор design tokens;
- Next/Vinext остаётся reference implementation до B4.

## Контракты

Source of truth находится в `06 Development/shared`:

- `contracts/ecosystem-routes.v1.json`;
- `contracts/account-redirect.v1.json`;
- `contracts/runtime-policy.v1.json`;
- `contracts/content-entry.v1.schema.json`;
- `contracts/catalog-snapshot.v1.schema.json`;
- `contracts/manifest.v1.json`;
- `content/legacy-content-registry.v1.json`;
- `design/tokens.v1.json`;
- `design/tokens.v1.css`.

## Проверки

| Контур | Результат |
| --- | ---: |
| Shared contract tests | 9/9 |
| Next/Vinext static, unit, typecheck, lint | 50/50 |
| Playwright Vinext reference | 6/6 |
| Playwright Next reference | 6/6 |
| Всего автоматических проверок | 71/71 |

Дополнительно подтверждено:

- обе reference-сборки сохраняют семантический паритет 47 маршрутов;
- публичные артефакты не содержат localhost, `:8081`, server secrets или
  private origins;
- только действие «Написать менеджеру» выводит пользователя из публичного
  сайта в Telegram;
- Mini App остаётся внутри своего интерфейса;
- нижняя навигация не блокирует прокрутку;
- неизвестные URL возвращают реальный `404`;
- account redirect удаляет токены и небезопасный `return_to`.

## Legacy visa gate

Семь текущих страниц виз Бали зарегистрированы как
`legacy_needs_sources`. Миграция:

- не меняет смысл;
- не создаёт источники;
- не обновляет `lastVerifiedAt`;
- не разрешает production cutover.

Высокоприоритетные страницы:

- `/directions/bali/visas/`;
- `/directions/bali/visas/e33g/`;
- `/directions/bali/visas/d12/`;
- `/directions/bali/visas/voa/`.

Их критические факты должны быть проверены по официальным источникам до
production cutover. Это не блокирует B2 для невизовых и технических страниц.

## Известные ограничения

- Astro и новый React/Vite runtime ещё не созданы — это B2 и B3;
- contracts пока валидируются локальной Node-командой, а не опубликованным
  package;
- production `308` намеренно выключен;
- JSON referral storage остаётся временным legacy-источником по плану B0;
- подготовленные B0 migrations не применялись;
- content snapshot пока является контрактом и примером, а не production
  pipeline.

## Откат

B1 не меняет production и откатывается обычным revert локальных B1-коммитов.
Next/Vinext, FastAPI и PostgreSQL остаются в прежнем состоянии.

## Готовность к B2

B2 может начинаться локально:

1. Astro scaffold.
2. Семь pilot routes.
3. SEO, sitemap, robots и JSON-LD.
4. Accessibility и performance.
5. Contract tests `45/45` для public surface.

Production cutover, push и deploy не входят в B2 без отдельного разрешения.
