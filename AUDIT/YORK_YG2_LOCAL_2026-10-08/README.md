# Yoga Ganster локальный этап YG2

На 8 октября 2026 года локальная интеграция Yoga Ganster и пакет закрытого preview проверены. Founder разрешил Git-публикацию и отдельное приватное HTTPS-preview. Это синтетическое демо, а не production-релиз SAFRWAY или рабочий кабинет партнёра. Технический выпуск и визуальная приёмка в существующем браузере пользователя учитываются отдельно.

## Исходная версия и границы

Рабочая ветка — `codex/york-gangster-preview-20261008`, исходный HEAD — `423f01694441e6136a31ef9b7399dbaa08d35339`. Последний выпущенный runtime SAFRWAY — `c890cae8064cb3104c776e5d32843a43d30d8bff`; последующий исходный HEAD содержит только документацию визового релиза. Видимое имя по правке Founder — `Yoga Ganster`; внутренний идентификатор `york-gangster` сохранён. Фактические commit, CI и HTTPS-результаты фиксируются в отдельном release checkpoint после выполнения соответствующих шагов.

Старые fixtures handoff от «77» с базой `569f68c` не стали вторым каталогом. Интеграция читает текущие общие источники напрямую: `shared/content/generated/catalog-runtime.v1.json`, `shared/content/generated/i18n/public.v1.json`, `shared/content/registry-public-build.v1.json`, `shared/content/registry-d1-d2-build.v1.json`, `shared/content/service-registry.v1.json` и существующий Registry renderer. Ранний checkpoint сохранён в `EVIDENCE.json`, смена имени и меню — в `UI_REVISION_1.json`; актуальная упаковка — в `PACKAGE_CHECKPOINT.json` и build receipt.

## Реализовано

Отдельная папка Astro `src-york` и отдельный React entry `react-app/src/york-preview` создают 172 HTML-страницы. Сохраняются все действующие RU/EN маршруты, 40 утверждённых RU/EN страниц Registry, 36 дополнительных демонстрационных маршрутов и локализованный fallback 404. Полные тексты, factBlock, обе таблицы сравнения eVOA/VOA, семейное уточнение E33G и исходные подписи CTA сохранены. Действия менеджера ведут в демонстрационную форму, навигационные CTA — на соответствующие существующие страницы. Общий PDF All Indonesia доступен локально без новой редакции.

Клиент, партнёр, владелец и бот используют только вымышленные записи. Форма и диалог бота меняют состояние в памяти страницы. Авторизация, реальные сети клиентов, Telegram, начисления, кошелёк, выплаты, миграции и production-admin не подключены. Владелец доступен только как явно обозначенная локальная лаборатория; публичная и партнёрская навигация на неё не ведут.

Страны на главной и в общем обзоре услуг представлены выпадающим меню в шапке: Бали, Таиланд, ОАЭ, Непал и Россия. Меню использует общий RU/EN каталог и нативный `details/summary`; Escape возвращает фокус на кнопку, клик снаружи закрывает меню без перехвата фокуса. Карточки услуг внутри направлений сохранены.

## Цены и изоляция

Используются существующие канонические price bindings. Live pricing projection в автономном демо не загружается; цены показываются как недоступные, без выдуманного курса, копирования старых тарифов или обновления времени свежести. Indodax, округление до ближайших $5, backend, бот, общий контент и исторические цены заказов не изменены.

Бренд включается только явным build-time выбором. По умолчанию собирается прежний SAFRWAY. Вывод находится в отдельном `dist-york-preview`; штатные preview-плагины YouTube/Registry отключены. Отдельный Astro root сохраняет генерируемые типы preview вне `.astro` основного сайта; служебные типы и Vite-кэш исключены из source inventory.

Локальный сервер разрешает только GET/HEAD на точном allowlisted loopback host/port, отвергает forwarded-host, traversal, source и live API/auth/admin/mini endpoints. CSP запрещает соединения, фреймы и отправку форм. Каждая HTML-страница имеет `noindex,nofollow,noarchive`; robots запрещает обход, sitemap пуст, production canonical/hreflang отсутствуют. Noindex не является контролем доступа для будущего размещения в интернете.

## Проверки

- Отдельная Astro/React сборка — 172 HTML, PASS.
- Astro check — 159 файлов, 0 ошибок, предупреждений и hints на исходном UI checkpoint; React TypeScript — PASS после добавления HTTPS-prefix.
- 18 критических проверок — PASS: каталог, полные тексты/CTA, меню стран, маршруты, индексация, loopback-сервер, React-демо, упаковка и отдельный HTTPS-prefix для всех 172 страниц и React-ссылок.
- Изолированная распаковка архива и запуск verifier без зависимостей проекта — PASS. Подмена байтов, незаявленные файлы, скрытые файлы, symlinks, изменённые source pins и пересчитанный manifest чужой HTML-сборки отклоняются.
- Независимые source review архитектуры/security, дизайна и происхождения пакета — ACCEPTED после исправления конкретных замечаний.
- Повторная обычная сборка SAFRWAY: 317 HTML/JS/CSS/XML/TXT файлов, включая 295 HTML, побайтно совпали до и после текущего изменения.

Полная визуальная матрица, мобильное переполнение и клавиатурный проход в браузере ещё не приняты. Source review не заменяет эту проверку. Новые браузеры или профили не запускались.

## Просмотр и воспроизведение

Локальный адрес — `http://127.0.0.1:4380/`. Клиент — `/account/`, партнёр — `/influencer/`, бот — `/bot-demo/`; лаборатория владельца — `/owner/influencers/`. Демо доступно только пока локальный сервер работает.

В `06 Development/astro-site` выполнить `pnpm run build:york-preview`, затем `pnpm run test:york-preview` и `pnpm run preview:york`. Только эти preview-команды: не запускать обычный `astro dev`/`astro preview` с York-конфигурацией. York-тесты находятся в отдельных подкаталогах, поэтому не меняют штатные production test-globs и не требуют York output от обычного CI. Для проверки React: `tsc -p tsconfig.york-preview.json` из `react-app`.

## Пакет для закрытого HTTPS preview

Команда `pnpm run package:york-preview` сохраняет новый архив и SHA receipt в игнорируемую `.preview-artifacts`. Для HTTPS-варианта последовательно выполнить `build:yoga-https-preview`, `test:yoga-https-preview`, `package:yoga-https-preview`. Его отдельный output — `dist-yoga-https-preview`; все локальные ссылки и ресурсы имеют prefix `/yoga-preview`, включая React-кабинеты. По умолчанию сборка SAFRWAY и локальное демо сохраняют прежние пути. CI выполняет обе preview-сборки и упаковки отдельным шагом.

Перед упаковкой проверяются текущие source pins и точные байты сборки; изменённые исходники требуют нового build. Пакет содержит `site`, `evidence/build.json`, `MANIFEST.json`, два инертных Nginx-шаблона и standalone verifier. Исходники приложения, `.env`, credentials, `node_modules` и реальные записи в него не включаются. Build receipt находится вне web root.

После распаковки в новый пустой staging-каталог выполнить `node tools/verify.mjs .`. Контрольные суммы обнаруживают отличие от записанного build, но не являются цифровой подписью: SHA архива необходимо сверять с доверенным локальным receipt до установки.

Разрешённый адрес — `https://safrway.online/yoga-preview/`. Отдельный static server из `deploy/nginx/yoga-closed-preview.conf.template` слушает только свободный loopback-порт. `yoga-preview-mount.conf.template` добавляется только в существующий origin server `safrway.online` и направляет этот prefix на static server; DNS и Cloudflare Tunnel не меняются. Prefix `^~` исключает попадание assets в публичные cache locations. Заголовки запрещают индексирование, кэширование, API-соединения, фреймы и отправку форм. Cookie и forwarded-заголовки не передаются, Authorization используется только отдельной Basic-защитой preview.

Парольная защита должна покрывать страницы, JS/CSS, PDF и остальные assets. Файл паролей хранить вне Git, архива и web root; не использовать секреты в URL. До переключения проверить пакет в отдельном staging, Nginx в изолированном процессе и текущий fingerprint origin config. После `nginx -t` разрешён только graceful reload Nginx. Проверить TLS, анонимный отказ и авторизованное чтение, затем неизменность основного runtime и health.

HTTP-вход в preview перенаправляется на HTTPS до запроса пароля. Проверка использует только перезаписываемый Cloudflare `X-Forwarded-Proto` на существующем loopback-origin; [официальная документация Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/#x-forwarded-proto) описывает его семантику. Redirect добавления слеша остаётся относительным, чтобы origin HTTP не менял внешнюю HTTPS-схему.

Ранний `PACKAGE_CHECKPOINT.json` сохраняет состояние до разрешения выпуска; его результаты не являются доказательством HTTPS-активации. При ошибке вернуть точный backup изменённого origin config, отключить только новый preview server и выполнить `nginx -t` перед graceful reload. Данные, backend, бот, старое preview и основной web artifact в откате не участвуют.

## Следующая точка решения

Git-публикация и приватный HTTPS-preview разрешены; публичный основной сайт этот этап не заменяет. Визуальный preview принимается Founder в существующем браузере. Откат локально — отключить выбор preview-бренда и использовать неизменённый обычный build; схему и данные восстанавливать не требуется.

YG3–YG7 не запущены. Реальная идентификация/ACL и атрибуция, ставки/Points/фиксация расчётов, Telegram credentials/transport, очередь публикаций и постоянный домен остаются будущими этапами, а не завершёнными возможностями этого демо.
