# B3 — React Application Report

Дата: 2026-07-28
Статус: выполнен локально, не выпущен

## Результат

Создано отдельное приложение:

`06 Development/react-app`

Оно использует:

- React `19.2.6`;
- Vite `8.0.13`;
- TypeScript `5.9.3`;
- два независимых HTML entry point;
- общий FastAPI без переноса бизнес-логики во frontend;
- browser и Telegram runtime adapters;
- Node test runner и Playwright.

Next/Vinext не удалён и остаётся эталоном до B4.

## Application contract — 2/2

1. `/` — Telegram Mini App;
2. `/account/` — browser account.

Оба маршрута создаются production-сборкой, имеют `noindex` и обслуживаются
одним React build на одном origin `app.safrway.online`.

`safrway.online/account/` не содержит вторую копию кабинета. Для preview
подготовлен один redirect `307` на `app.safrway.online/account/`. Permanent
`308` остаётся выключенным до отдельного production cutover.

## Runtime adapters

### Telegram

- frontend передаёт backend только исходную строку
  `Telegram.WebApp.initData`;
- `initDataUnsafe` не используется как источник identity;
- hash/signature и `auth_date` проверяет FastAPI;
- после обмена используется серверная HttpOnly-сессия;
- fingerprint принятого `initData` сохраняется один раз;
- повторный обмен тем же подписанным payload возвращает `409`.

### Browser

- вход начинается на same-origin `/api/web/auth/start`;
- return path допускается только внутри `/account/`;
- access/session tokens не передаются через URL;
- кабинет использует HttpOnly cookie;
- login не назначает и не меняет реферала.

## Mini App

Реализованы независимые экраны:

- главная;
- услуги;
- заявки;
- профиль;
- поддержка.

Каталог открывается внутри Mini App:

`направление → раздел → услуга → полный материал`.

Навигация не отправляет `/start` в Telegram и не закрывает Web App. Нижнее
меню не перекрывается плавающей кнопкой, а каждый экран имеет собственную
прокрутку.

## Browser account

Реализованы разделы:

- обзор;
- SAFR Points;
- рефералы;
- заявки;
- профиль;
- поддержка.

Points и реферальные связи отображаются read-only. Любые начисления и
атрибуция остаются серверными use cases.

## Поддержка

Browser account и Mini App используют общий сервис client support:

- клиент читает только сообщения с `visibility=client`;
- internal notes никогда не возвращаются клиентскому API;
- сообщение создаётся в PostgreSQL и передаётся менеджерам через существующий
  outbox;
- Telegram является только явным fallback по кнопке пользователя.

## Backend и migration candidate

Добавлены:

- общий `client_portal` service;
- Mini App chat API;
- replay guard для Telegram `initData`;
- Alembic candidate
  `b3f28c7a91d0_add_mini_app_auth_replay_guard.py`.

Migration только подготовлена. Она не применялась к production или
production database.

## Preview origin

Подготовлен локальный Nginx candidate:

`06 Development/deploy/nginx/safr-react-app.preview.conf`

Он:

- обслуживает один React build на `app.safrway.online`;
- проксирует browser и Mini App API на same origin;
- возвращает настоящий `404` для неизвестных путей;
- не использует SPA fallback для произвольных URL;
- ставит `noindex`;
- не содержит localhost в клиентских файлах.

Конфигурация не устанавливалась на VPS.

## Проверки

| Контур | Результат |
| --- | ---: |
| React unit | 5/5 |
| React build/artifact/Nginx | 8/8 |
| React Playwright | 3/3 |
| Backend | 20 pass, 5 PostgreSQL-only skipped |
| Telegram bot | 46/46 |
| Shared contracts | 9/9 |
| Astro B2 | 9/9 |
| Next/Vinext reference | 50/50 |
| Alembic heads | 1 |

PostgreSQL-only race и migration проверки были подтверждены на временном
PostgreSQL в B0. B3 backend regression запускалась на отдельной временной
SQLite и не обращалась к production.

## Известные ограничения

- React временно импортирует read-only catalog из Next/Vinext reference;
  единый generated snapshot будет подключён в B4;
- production OIDC redirect URI не менялся;
- preview Nginx не устанавливался;
- migration не применялась;
- реальные Telegram и browser OIDC smoke требуют будущего preview;
- публичный guest support на Astro относится к B4;
- push, deploy и production changes не выполнялись.

## Откат

B3 откатывается локальными Git revert B3-коммитов. Next/Vinext, production
frontend, FastAPI runtime, PostgreSQL, Cloudflare и Tunnel остаются
неизменными.

## Готовность к B4

B4 может начинаться локально:

1. перенести оставшиеся публичные маршруты в Astro;
2. заменить временный импорт каталога единым generated snapshot;
3. подтвердить Astro `45/45`, React `2/2`, ecosystem `47/47`;
4. добавить parity и preview gates;
5. подготовить cutover и rollback plan без выполнения production cutover.
