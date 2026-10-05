# SAFRWAY — итог локального спринта 05.10.2026

> Последующее разрешение Founder от 05.10.2026: закончить C1/eVOA/E33G,
> затем D1/D2, выполнить scoped push/deploy и забрать финальные правки VibeDiz.
> Нижеследующий локальный отчёт сохранён как исходный checkpoint, а не как
> актуальное подтверждение production. Git-кандидат опубликован в
> `codex/safr-sync-release-20261005`; CI первого кандидата выявил упаковочную
> ошибку (два неизменённых исходника приветствия) и устаревшие ожидания тестов.
> Восстановлены исходные TXT, добавлена тестовая зависимость pytest и отдельный
> запуск onboarding pytest. Утверждённые тексты, FX и округление не менялись.
> Shared contracts: 21 PASS. Повторный CI и production-активация ещё не завершены.

Статус: **LOCAL_IMPLEMENTED_NO_DEPLOY** для текущего C1/eVOA/E33G-среза и доступной локальной интеграции решений 7–16. Это не подтверждение production-релиза и не закрытие международного roadmap.

Актуальная граница Founder: «полный спринт без деплоя и отчёт». Новый commit, push, merge, SSH, публикация production-каталога, применение production-миграции и отправка клиентских сообщений не выполнялись. Предыдущее разрешение на выпуск не использовалось после этой инструкции.

Локальный кандидат: `SYNC-FINAL-2026-10-05-LOCAL`. Baseline frontend: `64fb3429cd435af8da9867f0e30a5f03044b95e2`; runtime: `a44228303714237cf30af4476868b834b480bd45`. Нового release commit нет. Текущий внешний deployed revision в этом локальном спринте не проверялся.

Код и отчёт подготовлены в сохранённых рабочих копиях frontend и runtime. Основная папка проекта ограничена macOS; ограничение не обходилось. Перед Git-публикацией нужно восстановить штатный доступ и сверить фактические изменения основной копии с этим кандидатом. Native-разработка и другие несвязанные изменения сохранены.

## 1. Контент, языки, маршруты и SEO

Существующие 14 contentId подключены к локальной публичной сборке на десяти языках: RU, EN, DE, 简体中文, KO, FR, JA, HI, ES, AR. Это 140 локализованных документов. Шесть прежних RU/EN URL получают согласованный новый renderer; остальные существующие страницы не заменены. Вся сборка содержит 237 HTML-страниц; это не 237 новых услуг.

Сохранены все 146 Registry ID и 44 legacy binding. Одобренные body, metadata и complete reference не переписаны: 420 файлов совпали с предоставленным MANIFEST по SHA256. Полные RU-ревизии, локализованные route и pins: [ACCEPTED_REVISIONS_AND_ROUTES.json](ACCEPTED_REVISIONS_AND_ROUTES.json); побайтовая проверка: [SOURCE_INTEGRITY.json](SOURCE_INTEGRITY.json).

Сохранены локализованные SEO/H1, direct answer, factBlock и обе таблицы сравнения eVOA/VOA. Canonical, десять взаимных hreflang + x-default, JSON-LD/inLanguage, sitemap и OG привязаны к реально собранным страницам. Private Registry/raw-source файлы и неподтверждённые каркасы не входят в публичные assets, ссылки и sitemap. Индексируемость локального кандидата не означает, что страницы уже появились в поиске.

Переключатель «код языка | глобус»: десять вариантов, две колонки по пять строк, клавиатура/Escape/focus return. Приоритет: ручной выбор → язык Telegram → язык браузера. Явный URL не перебрасывается. Если локализованной страницы нет, не создаётся фиктивный URL; предлагается выбор доступного языка.

E33G: официальный минимум выписки 3 месяца и подготовительный запрос SAFRWAY 12 месяцев различаются. «За одного человека» стоит до тарифов 12/14 млн. Уточнение применимости семейной категории помещено в семейный раздел; оно не подменяет утверждённый текст. Общая классификация E31B/E31E/E31H не объявлена гарантией доступности для каждого E33G/Golden Visa principal.

Файлы: `shared/content/registry-public-build.v1.json`, `astro-site/scripts/registry-publication.mjs`, `registry-document.mjs`, `registry-family-applicability.mjs`, `src/layouts/RegistryPublicLayout.astro`, `src/components/registry/*`, `src/pages/[...path].astro`, `sitemap.xml.ts`, `og/[...path].png.ts`, `src/styles/registry-public.css`. Все пути здесь относительно `06 Development/`.

## 2. Цены, админка и бот

Единственный источник runtime-цен — существующий versioned catalog и его FX snapshot. Indodax/parser/формулы/округление в `backend/app/services/catalog_pricing.py` и модели каталога побайтово равны runtime HEAD. Примерные USD по-прежнему округляются до ближайших $5; точные USDT не превращены в примерные USD. Исторические цены заказов не менялись.

Локально подготовлены варианты:

| Операция | IDR | Уточнение |
| --- | ---: | --- |
| C1 extension | 2 000 000 | Отдельный вариант существующей услуги продления |
| VOA/eVOA extension | 850 000 | То же; initial C1 не изменён |
| D1 extension / D2 extension | 2 500 000 каждый | Два отдельных варианта |
| E33G extension | 12 000 000 | Без придуманного express-продления |
| E33G document-readiness review | 2 000 000 | Не обещает изготовление договора; включено в полный E33G |
| Conversion из VOA / KITAS | 17 000 000 / 17 500 000 | Bridging включён в обе операции |
| Conversion из C1 / D12 | 15 000 000 / 17 000 000 | Без обещания универсального маршрута без выезда |

Первичное E33G остаётся 12/14 млн за одного человека. Новые conversion-варианты не попадают в текст первичного оформления.

Owner Admin получает read-only «подготовить согласованные тарифы» для двух текущих или всех десяти вариантов. Подготовка не пишет в БД. Далее используются прежние Preview/Publish, причина, авторизация, CSRF и expected publication version. Слияние добавочное: сохраняет весь каталог, не сбрасывает его из исторического seed и останавливается при конфликте текущей цены/идентификатора.

Циклы C1 составляются из конкретных issuance/extension SKU одной версии: сначала сумма целых IDR, затем один вызов существующей Decimal-функции. Нельзя складывать уже округлённые USD или подставлять один suffix в разные операции. При истёкшем derived TTL примерные USD исчезают; последняя принятая точная IDR не объявляется новым курсом. Дубли identity/version drift не дают молчаливый fallback.

В боте подготовлены короткие RU/EN описания с теми же существенными условиями, ссылками и безопасным разбиением сообщений. Бот не запускался, сообщения клиентам не отправлялись.

Файлы: `backend/app/services/{extension_pricing,next_stage_tariffs,catalog_compositions}.py`, `backend/app/api/catalog_pricing.py`, `backend/app/scripts/publish_extension_prices.py`, `react-app/src/components/AdminPricingCatalog.tsx`, `astro-site/scripts/registry-price-bindings.mjs`, `astro-site/src/client/pricing.js`, `bot/app/content/visas.py`, `bot/app/handlers/menu.py`, `shared/content/generated/bot-visa-summaries.v1.json`.

У eVOA исправлена отдельная ошибка: исходный `PRICE_IDR` теперь превращается в живую version-bound привязку, а не остаётся статической заглушкой после build без production fetch. Все десять языков проверены на динамической изменённой цене и истечении USD TTL; browser подтверждает загрузку mock-проекции. Принятый текст не переписан.

**Эти тарифы в production в данном спринте не публиковались.** Доказательство работы на синтетической БД не выдаётся за изменение действующего каталога.

## 3. Следующие услуги: готовая локальная структура, не пустые публикации

Подготовлены и импортированы 15 оригинальных RU-черновиков в существующие Registry ID: D1, D2, их продления, E33G next-term и Knowledge о продлении, проверка документов, conversion, Family hub + spouse/child/parent, Partners, Business, Documents.

Все имеют content-addressed ревизии и preview-only статус; точный список в JSON отчёта. Это не повторный перевод 140 принятых документов. Новые тарифы представлены catalog-токенами, а не независимыми копиями цен. Новой бизнес-сущности ради страницы не создано: Business/Documents используют существующий generic manager lead, `serviceId=null`.

D1/D2 общий хаб и старые URL сохранены. Пустой Knowledge «E33G requirements» объединён по intent с существующим overview — не создаётся конкурирующая индексируемая страница. Partners отделён от существующей личной реферальной системы.

Business/Documents: новые тексты ограничены индивидуальной оценкой ситуации, партнёрской сетью и проверяемой классификацией; цены, юридические обещания и срок выполнения не придуманы. Источники, ограничения проверки и зависимости — `shared/content/next-stage-decisions.v1.json`. Полезные первичные ссылки: [иммиграционная классификация](https://bontang.imigrasi.go.id/layanan-publik/kategori/wna/sub/daftar-visa-indonesia), [продление ITAS](https://jakartapusat.imigrasi.go.id/layanan/warga-negara-asing-wna/izin-tinggal-keimigrasian/perpanjangan-itas), [OSS](https://oss.go.id/en). Они не заменяют индивидуальную проверку текущей применимости.

Не хватает для публичного выпуска этих новых страниц: проверки новых оригинальных RU-черновиков Founder, принятых локализаций/SEO/QA и точных Partners/Referral payout-условий. Реферальная механика, ставки и история не изменены. Не нужно повторно согласовывать уже принятые продуктовые решения 7–16.

Файлы: `shared/content/next-stage-decisions.v1.json`, `shared/content/registry-copy/*_ru_sync1005.md`, `shared/scripts/import-next-stage-drafts.mjs`, `shared/scripts/validate-service-registry.mjs`.

## 4. Страны, Вьетнам и привязка заявки

Header-country selector содержит 249 ISO country entries. Поиск и выбор страны не означают наличие отдельной готовой услуги. Существующие готовые направления ведут по настоящим маршрутам; остальные — к запросу менеджеру без пустой индексируемой landing.

На главной шесть карточек, добавлен Вьетнам. Desktop — один ряд; phone/tablet — 3×2, подписи входят в высоту строки, перекрытий нет. Day/night смена карточки и фона следует теме. Выравнивание ряда остаётся слева.

Day/night Hoi An — AI-иллюстрации, не документальная фотография. Recipe: тёплые фасады старого Хойана, река и спокойная композиция без текста/логотипов; night edit сохраняет ту же геометрию и ракурс, добавляя синий вечер, фонари и отражения без neon/nightclub-стиля. Исходные PNG: `astro-site/src/assets/worlds/vietnam-hoi-an-{day,night}-ai-v1.png`; production-sized WebP генерирует существующий Astro pipeline.

Форма поддержки использует прежний маршрут и сохраняет только bounded attribution: contentId/serviceId/locale/sourceRevision/canonical path без query/PII. Server schema проверяет формат и не использует client context как основание авторизации. Выбор VN/другой страны переносится в запрос; создание заявки проверено только на mock API.

Файлы: `HomeExperience.astro`, `destination-worlds.ts`, `CountryPicker.astro`, `src/client/country-picker.js`, `support.js`, `backend/app/schemas/client_portal.py`.

## 5. Аналитика

Реализован локальный first-party слой, по умолчанию **выключен**. Включение требует owner policy revision, версии privacy notice и подтверждённого consent UI. До согласия, после отзыва, при DNT/GPC и при смене версии receipt события не принимаются. Consent receipt — Secure/HttpOnly/SameSite=Strict, hash в БД, ограниченный срок.

События используют allowlist и ограниченные партии. Нет имён, телефона, email, паспортов, документов, сообщений, form text, full URL/query или raw IP. Дедупликация и агрегирование атомарны. Финансовые события — только trusted backend вход; client payload не может объявить оплату. Raw retention — 13 календарных месяцев, aggregates — 36 месяцев. Срок хранения CRM/заказов не урезан этой политикой.

Owner/technical raw API и staff service-scoped aggregates разделены; минимальный staff bucket — пять событий. Owner controls не дают менеджеру права включить сбор. Есть агрегатный экран Business → Analytics и read-only история событий с отдельным backend-контролем доступа. Search Console не подключён без учётных данных; цифры не выдуманы.

Privacy RU/EN дополнена двумя абзацами о consent/retention/opt-out; остальные старые абзацы и SEO сохранены. Существующие финансовые/order endpoints ещё не подключены как producers всех будущих funnel-событий; исторический backfill не выполнялся. Это отдельный остаток интеграции аналитики, а не готовая финансовая отчётность.

Миграция `a7e4c9d2f105` после `c8e3f7a1d502` добавочная. Локальный synthetic SQLite backup→restore и upgrade→downgrade→upgrade проверены, заполненную историю нельзя молча уничтожить downgrade. Production PostgreSQL full-chain proof и scheduler не выполнялись.

Maintenance CLI `backend/app/scripts/analytics_retention.py` намеренно принимает только существующий локальный SQLite-файл, игнорирует .env/DATABASE_URL и по умолчанию read-only. Опциональный local apply требует проверенные hash/as-of/active-root и ограничен analytics deletes + audit insert. Нельзя выдавать этот CLI за production PostgreSQL cleanup job.

Файлы: `backend/app/{api,models,schemas,services}/analytics.py`, `backend/app/scripts/analytics_retention.py`, `backend/alembic/versions/a7e4c9d2f105_add_first_party_analytics.py`, `react-app/src/components/AdminAnalytics.tsx`, `react-app/src/components/admin-analytics.css`, `react-app/src/utils/admin-analytics.ts`, `astro-site/src/components/AnalyticsConsent.astro`, `astro-site/src/client/analytics.js`, `shared/content/analytics-allowlist.v1.json`.

## 6. Админский просмотр кабинета и визовые карточки

17 файлов ВайбДиза интегрированы с проверкой baseline/final SHA. Кнопка «глазами клиента» использует actual customer components и server serializers, а не impersonation/JWT/cookie swap.

Owner viewer поддерживает 390/820/1440. GET-only preview проверяет действующего root admin и клиента; POST/неразрешённые URL блокируются до fetch. Показаны только опубликованные клиентские данные. Внутренние заметки, credentials, скрытые услуги, приватные документы/события не становятся клиентскими. Контакты реальных клиентов в QA не использованы.

Визы в Admin представлены плитками с иконкой и большим счётчиком/кольцом, в стиле жилья, байков и страховки. Дни вычисляются по календарю Бали; для месячной услуги не выдумывается дата завершения договора.

Файлы: `react-app/src/surfaces/AdminAccountPreview.tsx`, `src/api/account-preview.ts`, `src/components/AdminServiceCountdown.tsx`, `AdminVisaCRM.tsx`, `AdminLifeServices.tsx`, `src/surfaces/AccountApp.tsx`, `backend/app/api/client_account_preview.py`.

No-store middleware/router подключены только в authoritative runtime backend. Nginx preview stanza сохранён отдельным **proposal**, действующая production-конфигурация не менялась.

## 7. Проверки и ВайбДиз

| Проверка | Результат | Граница |
| --- | --- | --- |
| Source integrity | 140 × 3 файлов PASS | Accepted bytes, не новая юридическая экспертиза |
| Registry / importer | validator + 3 PASS | 146 ID / 44 legacy binding / 15 RU draft |
| Public contract / pricing / preservation | 20 PASS | Текущая построенная локальная сборка |
| Astro build / diagnostics | 237 HTML; 129 files, 0 errors/warnings/hints | Production не обновлён |
| React tsc / Vite build | PASS | Локальный frontend |
| Admin Analytics helpers | 3 PASS | Scope labels, independent history result, bounded cursor |
| Analytics + preview security | 70 PASS | Python 3.12, изолированный SQLite |
| Public headless browser | 21 baseline cases PASS | Один isolated context, 29 baseline кадров |
| Финальная responsive/RTL/eVOA delta | 14 cases PASS | 28 кадров, ждёт decode day/night assets |
| Synthetic Admin UI | 6 cases PASS | 390/820/1440 + Admin tiles + Analytics owner/staff; zero writes |

Более ранние scoped backend проверки: pricing/extension/compositions/next-stage + регрессии — 136 PASS; F security/Points suite — 157 PASS; F/B bot — по 11 PASS; frontend preview helpers — 8 PASS. Это отдельные прогоны с пересечениями, их числа **не складываются** в искусственный общий coverage.

Проверки не являются exhaustive matrix всех 140 страниц или production parity. На Python 3.12 остаются legacy utcnow deprecation warnings; финальный critical run — 2931 warning. Три прежних React source-text expectations (старые labels/inline mount) не исправлялись; те же три проваливались на неизменённом baseline, поведение и новые critical gates проверены отдельно.

[ВайбДиз final saved-frame review](VIBEDIZ_VISUAL_REVIEW.md): PASS; закрыты header wrap, 中文 wrap, обе AR table scroll affordance, country row overlap и AR monetary bidi. Отдельный final PASS получен для desktop Analytics owner/staff: исправлены date toolbar, таблицы и подписи доступа. Независимого visual PASS для mobile/tablet Analytics не заявляем. Кадры: [screenshots/](screenshots/). Это visual approval по кадрам, не production/security/legal approval.

Личные Chrome/Comet и autoplay не запускались. Headless contexts и принадлежащие QA серверы закрыты. Отдельный VibeDiz preview localhost, открытый им по прямому запросу Founder, не останавливался этой работой.

## 8. Конкретный остаток и release boundary

До публикации также требуется штатный доступ к основной папке проекта и точная сверка её WIP с сохранёнными frontend/runtime-копиями. Самостоятельно обходить ограничение macOS или перезаписывать основную папку нельзя.

1. **P1 / release gate:** production PostgreSQL backup/restore + full-chain U-D-U и schema/invariants не доказаны. До доказательства нельзя включать новую migration/analytics.
2. **P1 / packaging:** frontend workspace backend — неполный mirror; в нём нет полного предыдущего life/onboarding/reminder runtime. Выпуск строить из frontend + authoritative runtime backend/bot, не заменять runtime урезанным mirror.
3. **P1 / infrastructure gate:** dedicated preview CSP/frame-ancestors/self/no-store и возможный общий X-Frame-Options DENY нужно согласовать в активном Nginx и проверить после разрешения release. Proposal не равен активированной конфигурации.
4. **P2 / editorial:** новые 15 RU-черновиков и их отсутствующие принятые переводы остаются preview-only. Partners/Referral точные условия не предоставлены. Не блокирует отдельный current14×10 release.
5. **P2 / analytics integration:** будущие trusted order/payment producers, production retention scheduler и Search Console credentials не готовы. Сбор по умолчанию выключен; агрегатный экран не обещает существующие реальные финансовые данные.
6. **P2 / QA debt:** legacy datetime warnings и три старых source-only expectations; текущие critical behavior gates PASS. Не заявлен полный green исторического test-suite.

Готовы локальный code candidate, сборки, preview, доказательства и инструкция выпуска. Требуется новое явное разрешение на Git/production release, если Founder захочет выпустить этот срез. Никакие новые продуктовые вопросы 7–16 автоматически не запускают новый спринт.

Точный безопасный порядок будущего выпуска и rollback — [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md). Санитизированный machine checkpoint — [LOCAL_CHECKPOINT.json](LOCAL_CHECKPOINT.json). Источник задания сохранён в [FOUNDER_FINAL_HANDOFF.md](FOUNDER_FINAL_HANDOFF.md); прямой запрет деплоя имеет приоритет над release-инструкцией внутри этого документа.
