# SAFR Web

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
```

Для production-сборки используются:

- `NEXT_PUBLIC_SITE_URL`;
- `NEXT_PUBLIC_API_BASE_URL`.

Mini App передаёт backend только подписанный Telegram `initData`. Сервисные
токены и токен бота во frontend не попадают.

Production:

- `https://safrway.online`;
- `https://app.safrway.online`;
- `https://api.safrway.online`.

Production-версия `3722654` содержит независимую внутреннюю навигацию сайта
и Mini App без автоматической отправки `/start` в Telegram-бот.
