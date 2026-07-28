# SAFR v0.6.2 — Independent Web Catalogs

Дата выпуска: 2026-07-28

Статус: production, GitHub commit `5c323dd`.

## Исправлено

- сайт больше не открывает Telegram через обычные навигационные кнопки;
- Telegram-ссылка осталась только у действия «Написать менеджеру»;
- Mini App открывает страны, разделы, услуги и материалы внутри приложения;
- удалена отдельная кнопка открытия бота из Mini App;
- каталоговые кнопки получили безопасный тип `button`;
- HTML сайта и Mini App больше не кешируется в Telegram WebView;
- опубликованный frontend не содержит `?start=`.

## Проверка

- ESLint — успешно;
- production build и static export — успешно;
- frontend tests — 5/5;
- сайт, Mini App и API доступны через Cloudflare;
- backend, bot и Tunnel работают без перезапусков.
