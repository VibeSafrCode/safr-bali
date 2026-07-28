# SAFRWAY — стабилизация, этапы 1–2

Дата: 28 июля 2026 года.

Статус: **локальный кандидат, не выпущен**.

- Ветка: `codex/safrway-stabilization`.
- База: `origin/main` на `e07f4c1`.
- Последний функциональный commit перед документацией: `aabeba7`.
- Push, deploy, Cloudflare, production environment и production PostgreSQL не
  изменялись.
- Подготовленная Alembic-миграция `7f6a1c2d3e40` не применялась.

## 1. Что стабилизировано

### Production environment frontend

- production-сборка требует точные публичные origins:
  `https://safrway.online` и `https://api.safrway.online`;
- localhost, внутренний порт `8081`, credentials и URL с path/query
  отклоняются до сборки;
- Mini App API-клиент единообразно обрабатывает JSON, HTML, `401`, `500` и
  сетевую ошибку, не показывая пользователю внутренние детали;
- Telegram WebApp SDK загружается только на поверхности Mini App и не попадает
  в сайт.

### Telegram Mini App authentication

- backend проверяет HMAC `hash` Telegram `initData`;
- `auth_date` ограничен десятью минутами;
- `initDataUnsafe` не является доверенным источником данных;
- после первичной проверки создаётся серверная сессия;
- access cookie живёт 30 минут;
- refresh cookie живёт 30 дней и ротируется;
- сервер хранит только SHA-256 hashes токенов;
- logout и ротация отзывают прежнюю сессию;
- подготовлены индексы по пользователю, токенам, срокам и отзыву.

Миграция существует только в коде. До отдельного релиза production продолжает
работать на прежней схеме.

### URL, Nginx и static export

- canonical contract: HTTPS, `safrway.online`, нижний регистр, trailing slash;
- `www` делает один `301`, без цепочки и без раскрытия `:8081`;
- Nginx различает HTML, assets и неизвестные URL;
- неизвестный URL возвращает настоящий `404`, а не HTML с кодом `200`;
- добавлена собственная noindex-страница 404;
- AppleDouble, `.DS_Store`, env, private keys, source maps и server-only
  переменные исключены из артефактов;
- все 47 замороженных публичных URL создаются обеими сборками.

## 2. Две проверенные сборки

| Показатель | Vinext 0.0.50 | Next.js 16.2.6 |
| --- | ---: | ---: |
| HTML, включая служебные 404 | 48 | 50 |
| Публичных маршрутов | 47 | 47 |
| Размер output | 2 567 790 байт | 3 965 514 байт |
| Клиентский JavaScript | 321 043 байта | 686 077 байт |
| Контрольное время последнего полного прогона | 8 535 мс | 9 073 мс |
| Build warnings | 0 | 0 |
| Семантические расхождения | 0 | 0 |

Сравнивались `title`, `description`, `h1` и внутренние ссылки каждой страницы.

Штатный Next.js `output: "export"` вместе с `generateStaticParams` полностью
заменяет собственный `export-static.mjs` по текущему публичному поведению.
Удалять старый путь в этом локальном этапе намеренно не стали.

### Рекомендация

Для Nginx + Cloudflare Tunnel выбрать официальную Next.js static-сборку как
целевой release path. Причины:

- стандартный и документированный export;
- полная TypeScript-проверка во время build;
- предсказуемое SSG через `generateStaticParams`;
- меньше зависимость от неполной совместимости Vinext с Next metadata API.

Vinext компактнее, поэтому его следует оставить как сравниваемый fallback до
отдельного выпуска и подтверждения production-rollback.

## 3. SEO-основание

- маршруты типизированно разделены на `indexable`, `public_noindex`,
  `private_noindex` и `api`;
- canonical сформирован для всех 47 публичных страниц;
- `/account`, Mini App, privacy и динамические API не попадают в sitemap;
- закрытые страницы получают `noindex`;
- `robots.txt` разрешает обычное индексирование и `OAI-SearchBot`;
- `GPTBot` запрещён по умолчанию и включается только осознанной переменной;
- `sitemap.xml` содержит только индексируемые страницы;
- site manager widget не загружается в Mini App bundle;
- Telegram SDK и Mini App dashboard не загружаются в website bundle.

Vinext 0.0.50 не сформировал Next metadata routes `robots.ts` и `sitemap.ts`.
Поэтому эти два файла пока создаются framework-neutral генератором в `public/`.

## 4. Проверки

### Frontend

- 39/39 статических, artifact, Nginx, 404, SEO и route-тестов;
- 11/11 API client, Telegram SDK и route policy тестов;
- TypeScript `tsc --noEmit` — успешно;
- ESLint — 0 ошибок и 0 warnings;
- официальный Next production build — успешно, включая TypeScript;
- Vinext production build — успешно;
- 47/47 страниц есть в обоих output;
- semantic comparison — 0 расхождений.

### Browser smoke

Playwright в установленном Chrome:

- Next export: 6/6;
- Vinext export: 6/6.

Проверено:

- сайт открывает страна → услуга → карточка внутри сайта;
- прямой вложенный URL и reload работают;
- навигация остаётся рабочей без JavaScript;
- Telegram появляется только в действии менеджера;
- Mini App не отправляет команды боту;
- нижнее меню Mini App не блокирует прокрутку;
- HTML-ответ API обрабатывается безопасно;
- неизвестная страница возвращает настоящий `404`;
- на успешных сценариях нет console errors и page errors.

### Backend

- 9/9 изолированных backend-тестов прошли;
- 1 существующий smoke соединения с локальной PostgreSQL не запускался, потому
  что этап не должен обращаться к production или менять базу;
- Alembic upgrade/downgrade SQL новой миграции сгенерирован и проверен offline.

## 5. Найденный архитектурный риск

Vinext-сборка завершалась успешно при устаревшем TypeScript-идентификаторе в
клиентском компоненте. Официальная Next-сборка остановилась на полной
TypeScript-проверке и обнаружила проблему. Ошибка исправлена, обе сборки
повторно созданы.

Следствие: один только успешный `vinext build` нельзя считать достаточным
release gate. До смены runtime обязательны отдельный `tsc --noEmit` и
официальная контрольная Next-сборка.

## 6. Что сознательно не сделано

- нет push;
- нет deploy;
- не менялись DNS, Tunnel или Cloudflare;
- не перезапускались production-сервисы;
- не изменялись production env;
- не применялась Alembic-миграция;
- не менялись production-данные;
- старые Vinext/Vite/Cloudflare зависимости и exporter не удалялись.

## 7. Локальные коммиты

- `6007f1c` — checkpoint незавершённых изменений;
- `2c48fcf` — baseline и manifest маршрутов;
- `2599920` — валидация production environment;
- `ac5341f` — единый Mini App API client;
- `fbdc89a` — корректная загрузка Telegram SDK;
- `63e8d62` — серверная Telegram session;
- `2359321` — canonical URL и Nginx redirects;
- `27617d2` — параллельный официальный static export;
- `82b2942` — настоящий 404;
- `af77549` — очистка macOS metadata;
- `19d5074`, `a775a81` — границы клиентских bundles;
- `ad53c57` — техническая SEO-классификация;
- `97c8123` — семантическое сравнение сборок;
- `690f4fe`, `aabeba7` — browser и route smoke;
- `60d55b9` — нормальный guest auth status;
- `83e6c78` — воспроизводимая общая команда проверок.

## 8. Основные изменённые файлы

Backend:

- `06 Development/backend/app/api/mini_app.py`;
- `06 Development/backend/app/models/mini_app_session.py`;
- `06 Development/backend/app/core/config.py`;
- `06 Development/backend/alembic/versions/7f6a1c2d3e40_add_mini_app_sessions.py`;
- `06 Development/backend/tests/test_backend_core.py`.

Frontend и build:

- `06 Development/web/lib/api-client.ts`;
- `06 Development/web/lib/telegram-web-app.ts`;
- `06 Development/web/lib/route-policy.ts`;
- `06 Development/web/next.config.ts`;
- `06 Development/web/scripts/build-variant.mjs`;
- `06 Development/web/scripts/compare-builds.mjs`;
- `06 Development/web/scripts/prepare-release.mjs`;
- `06 Development/web/scripts/generate-seo-files.mjs`;
- `06 Development/web/package.json`.

Runtime и проверки:

- `06 Development/deploy/nginx/safr-web.conf`;
- `06 Development/web/app/not-found.tsx`;
- `06 Development/web/tests/public-routes.json`;
- `06 Development/web/tests/browser-smoke.spec.ts`;
- остальные `06 Development/web/tests/*` для API, SDK, routes, SEO, Nginx,
  artifacts и bundle boundaries.

Документы:

- `docs/BASELINE_2026-07-28.md`;
- `docs/URL_MAP.md`;
- `docs/BUILD_COMPARISON_2026-07-28.md`;
- этот отчёт и основные рабочие README, Architecture, API, Database, Roadmap,
  Runbook, Smoke Checklist и Bugs Backlog.

Полный точный перечень показывает:

```bash
git diff --name-only origin/main...codex/safrway-stabilization
```

## 9. Rollback

Поскольку production не менялся, серверный rollback не требуется.

Возврат к production-ветке:

```bash
git switch main
```

Отмена отдельных локальных изменений должна выполняться через
`git revert <commit>`, без `reset --hard`.

## 10. Следующий SEO-этап

1. Создать единый типизированный content model для направлений и услуг.
2. Ввести статусы материала: `draft`, `verified`, `needs_review`.
3. Хранить реальную дату проверки, источник и ответственную организацию.
4. Генерировать metadata, canonical и Schema.org из content model.
5. Провести редакционную проверку каждой индексируемой страницы.
6. Добавить Lighthouse-порог для SEO, accessibility и performance.
7. Отдельно согласовать release: backup → push → CI → migration dry-run →
   deploy → smoke → возможность быстрого отката.

До проверки фактов нельзя автоматически добавлять `Review`, `Rating`,
выдуманных авторов, даты или юридические обещания.
