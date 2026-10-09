# Yoga Ganster без услуги обмена валюты

По прямому поручению Founder в `77` обмен исключён только из текущего anonymous static Yoga-превью на русском и английском. Действующий SAFRWAY-каталог, опубликованные цены, Indodax, округление USD, бизнес-идентификаторы, клиентские записи и live-бот не менялись.

Адрес: `https://62.133.61.231/yoga-preview/`. Активированный пакет — `no-exchange-030900a-caf256b42a47`; runtime source `030900a89b83de2d33e516cce63def63a020f68b`. Полные hashes и HTTP-результаты — в `DEPLOYMENT_VERIFICATION.json`.

## Сверка перед выпуском

| Участник | Ответ и решение |
| --- | --- |
| 03 — ВайбДиз | Свежий read-only ответ: новых согласованных Yoga-дизайн правок или WIP после round6 нет. Сохраняются компоненты, CSS, иллюстрация и карусели. 19/20 design runtime pins совпали с `1037b3526009af1a58559ef5f4384f332ebef28d`; `information.ts` меняется только для content projection. |
| 77 | Свежая read-only инспекция: удалить inherited routes, cards, dropdowns и copy; новых согласованных изменений нет. Реальный bot runtime frozen и исключён из этого выпуска. |
| Независимый security reviewer | Проверил финальный artifact:196 HTML, 0 exchange links/advertising, все8 маршрутов отсутствуют, 0 пустых заголовков, 0 мутаций канонических данных. Блокеров после исправления EN conjunction нет. Не выдавал browser или production PASS. |
| Другие участники | Проверен текущий список субагентов: иных активных writers Yoga нет. Готовый Documents helper и отложенный Admin/date WIP сохранены вне кандидата; их handoff не означает публикацию. |

## Что изменилось

Один preview-only module `shared/src/yoga-content-policy.mjs` исключает `/exchange/` и descendants во всех направлениях Yoga. `routes.ts` не генерирует8 RU/EN страниц; cards, related links, breadcrumbs и обзорная copy получают ту же проекцию. Home, services и country dropdowns используют её без второй бизнес-услуги или цены. Demo service selector и synthetic `/services` также фильтруются; реальный Telegram bot не подключается.

При инспекции обнаружены ancillary exchange offers в VOA и двух eVOA Knowledge-страницах. Yoga-only render cuts удаляют их из16 секций RU/EN, включая FAQ question+answer. Shared JSON/MD и русский/английский sourceRevision остаются исходными; build receipt отдельно фиксирует `YOGA_HIDE_EXCHANGE_2026_10_09`. Visa terms, facts, tables, price references и остальные sections сохранены. EN C1 объяснение зависимости USD от `exchange rate` намеренно оставлено: это прайсинг, а не услуга обмена.

Build fail-closed guard останавливает выпуск, если последующий импорт снова добавляет excluded exchange topic. Он не редактирует canonical тексты и не снимает currency/income requirements.

## Критические результаты

- Две изолированные сборки:196 HTML каждая;31 static/package/controller +2 synthetic React +3 HTTPS checks — PASS. Raw USTAR archive parity, standalone extraction/checksums и exact source pins — PASS.
- Первый run остановился до upload: новый module пропущен в packager allowlist, а тест ошибочно ожидал6 вместо5 cards. Исправления и история FAIL зафиксированы в `RELEASE_INCIDENTS.md`; guard не ослаблялся до всей shared-директории.
- Source canonical inputs совпали с предыдущим deployed artifact. Никакой генератор каталога или FX updater не запускался.19 неизменённых design pins и два isolated component pins1037 сохраняют round6; main live-contact разработки не откатывались.
- Nginx syntax, backup bytes и bounded worker readiness — PASS. Изменён только Yoga loopback static root; CSP, IP mount, полный SAFRWAY config и Quant config остались byte-identical.
- По реальному URL15 representative HTML и5 assets совпали с artifact;8 exchange direct routes и20 private probes —404; write methods —403; чужой Host —421. Anonymous/noindex/no-store сохранены.
- SAFRWAY, Mini App и Quant body hashes совпали с pre-release baseline.212 файлов предыдущего artifact сохранены. База, секреты, реальные аккаунты, бот и клиентские сообщения не затрагивались.
- Внешний Mac trusted-TLS GET: RU/EN home и services побайтно совпали с artifact. Независимый77 проверил12 опубликованных страниц (home/services/Bali/Thailand/about/contacts RU/EN) —200 без exchange links/offers, все8 excluded URLs —404;20 ответов сохраняют noindex. Home hashes совпали с activation receipt. Это HTTP-проверка, не browser/screenshots.

Rendered browser/pixel и native-touch — **NOT_RUN**. Новые браузеры и профили не запускались. Source/controller checks не объявляются визуальной проверкой.

## Scope файлов

Runtime: `shared/src/yoga-content-policy.mjs`; `astro-site/src-york/lib/routes.ts`, `information.ts`, `pages/index.astro`; `react-app/src/york-preview/DemoApp.tsx`; `astro-site/scripts/build-york-preview.mjs`, `package-york-preview.mjs`. Только preview modules, не canonical content.

Checks: три `astro-site/tests/york-preview` файла и `react-app/tests/york-preview/demo.test.ts`. Durable release process: checklist, incident log и этот sanitized AUDIT packet. Посторонние Admin/native/date/Documents файлы не коммитятся и не включаются в build.

## Rollback и следующая граница

Вернуть guarded root на предыдущий round6 artifact, проверить nginx syntax/reload и прежние RU/EN hashes с bounded readiness. Backup configs и старый artifact сохранены вне web root. Password policy/CSP не менять; DB rollback не нужен.

До будущей live Yoga-bot activation обязательно согласовать его service menu с той же excluded-service policy: frozen runtime пока наследует общий exchange link. Это **DEFERRED** gate будущего отдельного bot release, не разрешение менять SAFRWAY exchange или активировать бот сейчас.
