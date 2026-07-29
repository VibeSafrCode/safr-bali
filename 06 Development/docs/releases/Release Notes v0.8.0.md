# Release Notes v0.8.0

Дата выпуска: 2026-07-29

## Что изменилось

- публичный сайт переведён на Astro;
- Telegram Mini App и browser account переведены на единый React/Vite build;
- все направления, услуги и визы открываются отдельными внутренними
  страницами;
- короткие URL заменили `/directions/*`, старые ссылки продолжают работать
  через `308`;
- сайт получил настоящий `404`, sitemap, robots, canonical и JSON-LD;
- обращения с сайта проходят через FastAPI и outbox менеджеров;
- Telegram открывается только после явного выбора пользователя;
- усилены Mini App sessions, replay guard, реферальные и reward-инварианты;
- referral JSON сохранён для совместимости, PostgreSQL остаётся source of truth.

## Известное ограничение

Browser login через Telegram временно не включён: нужны отдельные OIDC
credentials из BotFather. Telegram Mini App работает независимо от этого.

Технический отчёт:
`06 Development/docs/B4 Production Cutover Report.md`.
