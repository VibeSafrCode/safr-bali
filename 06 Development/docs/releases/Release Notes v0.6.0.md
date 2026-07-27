# SAFR v0.6.0 — Website and Telegram Mini App

Дата: 2026-07-27
Статус: production infrastructure deployed.

## Сайт

- единая главная SAFR для Бали, Таиланда, России и Непала;
- deep links открывают соответствующее направление в Telegram;
- добавлены блоки подхода, SAFR Club, контакта и конфиденциальности;
- адаптивный mobile-first интерфейс и social preview.

## Mini App

- кабинет доступен по `/mini-app`;
- отображаются профиль, SAFR Points, реферальная сеть и заявки;
- базовая production-версия открывает направления через Telegram;
- реферальная ссылка берётся из общего backend.

## Безопасность и интеграция

- backend проверяет HMAC-подпись Telegram `initData` и срок авторизации;
- browser не получает service-token или bot token;
- добавлен CORS allowlist для production-домена;
- бот показывает Web App-кнопку только при настроенном `MINI_APP_URL`;
- нейтральные реферальные коды зеркалируются в PostgreSQL.

## QA

- production frontend build пройден;
- 2 server-rendering теста пройдены;
- 44 bot regression-теста пройдены;
- 6 backend regression-тестов пройдены;
- полный `check_local.sh` пройден.

## Production infrastructure

- `safrway.online`, `www`, `app` и `api` подключены;
- отдельный Cloudflare Tunnel `safrway-production` работает;
- origin закрыт на `127.0.0.1:8081`;
- Universal SSL активен;
- сайт, Mini App и API health отвечают через Cloudflare.

После production-теста найден UX-дефект перехода из Mini App в Telegram.
Исправление и общий каталог относятся к следующему локальному кандидату v0.6.1.
