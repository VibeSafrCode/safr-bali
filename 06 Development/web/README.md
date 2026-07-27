# SAFR Web

Публичный сайт и Telegram Mini App экосистемы SAFR.

## Маршруты

- `/` — направления, услуги и переходы в Telegram;
- `/mini-app` — личный кабинет внутри Telegram;
- `/privacy` — политика конфиденциальности.

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
