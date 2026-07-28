# SAFR Web

## Локальный кандидат 2026-07-28

Ветка `codex/safrway-stabilization` содержит две параллельные проверяемые
static-сборки:

- `artifacts/build-vinext-export`;
- `artifacts/build-next-export`.

Обе создают 47 публичных страниц. Для будущего release рекомендуется
официальный Next.js `output: "export"`; Vinext сохраняется как fallback до
отдельного решения о production-переходе. Эти изменения ещё не отправлены в
GitHub и не развёрнуты.

Один frontend содержит:

- публичную главную;
- отдельные страницы направлений, услуг и подуслуг;
- `/account` с Telegram OIDC;
- `/mini-app` с независимыми экранами внутри Telegram;
- закреплённый диалог с менеджером.

Каталог хранится в `lib/catalog.ts`. Telegram-ссылка используется только как
явный способ связи с менеджером. Авторизация и сообщения идут через same-origin
`/api/web/*`; секреты во frontend не передаются.

Публичный сайт и Telegram Mini App экосистемы SAFR.

## Маршруты

- `/` — направления и полный каталог услуг;
- `/mini-app` — личный кабинет и внутренняя навигация по услугам;
- `/privacy` — политика конфиденциальности.

## Единый каталог

Сайт и Mini App используют:

`lib/catalog.ts`

Иерархия интерфейса:

направление → раздел / регион → услуга → полный материал.

Сейчас каталог содержит Бали, Таиланд, Россию и Непал. Страны, разделы и услуги
открываются внутри сайта или Mini App. Длинные материалы Mini App имеют
пагинацию. Навигация не вызывает Telegram-команды.

Визовые тексты и материалы по жилью импортируются из:

- `../bot/app/content/visas.json`;
- `../bot/app/content/housing.json`.

Явная кнопка менеджера открывает обычный чат бота без `?start=`.

Пока Telegram-бот читает собственные content JSON и клавиатуры. Следующий шаг —
перенести общий каталог в backend API, не дублируя бизнес-правила во frontend.

## Локальный запуск

```bash
pnpm install
pnpm dev
```

## Проверка

```bash
pnpm test
pnpm lint
pnpm test:browser:next
pnpm test:browser:vinext
```

Для production-сборки используются:

- `NEXT_PUBLIC_SITE_URL`;
- `NEXT_PUBLIC_API_BASE_URL`.

Mini App передаёт backend подписанный Telegram `initData` только для первичной
авторизации. После HMAC-проверки и проверки `auth_date` локальный кандидат
использует серверную access/refresh session в HttpOnly cookies. Сервисные
токены и токен бота во frontend не попадают.

Production:

- `https://safrway.online`;
- `https://app.safrway.online`;
- `https://api.safrway.online`.

Фактический production остаётся на прежней версии до отдельного согласованного
release. Локальная миграция `7f6a1c2d3e40` подготовлена, но не применена.
