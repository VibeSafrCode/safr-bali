# Аудит существующего SAFRWAY для продолжения разработки

Дата: 11.10.2026. Scope: каталог Бали, country-first routing и связанные архитектурные границы. Это не полный pentest сервера и не перепроверка иммиграционных правил.

## 1. Baseline и границы доказательств

| Слой | Подтверждённое состояние | Доказательство |
| --- | --- | --- |
| GitHub main при аудите / source baseline | `3659ba7c84ffb73a1be208c66834f3afb256c069` | Fresh `git ls-remote origin refs/heads/main` до documentation-only sync; исходный clean worktree |
| Публичный сайт | `67e293919781923b9606eedc925b07be977bc513` | GET `https://safrway.online/build-version.json` |
| Mini App / кабинеты | `36fe5f9036b6c69cf587b31fc24d5e344c65ae39` | GET `https://app.safrway.online/build-version.json` |
| Backend source | `67e2939…`, по предыдущему release receipt | `AUDIT/ADMIN_VISA_RINGS_2026-10-10/FINAL_RELEASE_RECEIPT_36fe5f9.json`; новый SSH/process check НЕ выполнялся |
| Новая схема каталога | Отдельный LOCAL_UNCOMMITTED черновик | `codex/country-catalog-20261011`, не main и не production |

Исходный пакет анализировал `78d3ec2…` 9 октября, поэтому его `LIVE_HTML/STAGED_EDITORIAL` — историческая классификация, не источник текущего release status. Новый полный контент C1/eVOA/E33G/D1/D2/D12/E28A и связанные Knowledge уже присутствуют в публичной проекции. Повторный импорт или второй набор страниц не нужен.

При аудите `AUDIT/CURRENT_STATE.md` и `06 Development/docs/Backlog.md` начинались с более старых октябрьских состояний. Последующая документационная синхронизация обновила их по свежим receipts и этому аудиту; product source baseline не изменён. Исторические PENDING не означают, что нужно повторить поздние выпуски. См. [sync scope](../DOCUMENTATION_SYNC_2026-10-11.md).

## 2. Что действительно существует

- В исходном `06 Development/shared/content/service-registry.v1.json` — 154 контентные записи. Это идентичности контента, не 154 бизнес-услуги.
- 22 записи имеют 44 прежние RU/EN route bindings. Поле `published` описывает legacy adapter, а не все поздние публикации.
- `06 Development/astro-site/scripts/registry-publication.mjs` объединяет шесть selective manifests: 37 идентичностей × 10 локалей = 370 страниц, из них 310 indexable и 60 noindex.
- Family: пять самостоятельных идентичностей × 10, public noindex. Partners: одна × 10, public noindex. Это уже опубликованные страницы, не новые shells; сохранять существующие правила.
- D1, D2, их расширения и существующий сравнительный хаб уже отдельные записи/страницы. Второй D1-vs-D2 comparator не создавать.
- Полная локальная статическая сборка: 463 HTML-страницы, 326 indexable и 137 noindex по фактической markup. Из 463: 370 Registry overlay, 93 legacy/explicit. Все URL в `CURRENT_ROUTE_INVENTORY.json`; эта цифра не равна числу доступных коммерческих операций.
- Business: шесть точных editorial records × 10, 60 локализованных payload, в `registry-business-build.v1.json`; пять publication gates false. Это закрытые черновики, не опубликованная коммерческая линейка. Исполнитель/цена/правовая применимость не выводятся из наличия перевода.
- Documents: существуют записи `documents`, `translations`, `apostille`, `notary` и другие каркасы; есть `registry-copy/documents_ru_sync1005.md`. Полный Documents all-10 source ZIP не найден в предоставленных доступных местах. Переводы не восстанавливались и не сочинялись.

## 3. Маршруты и страны: не создавать дубли

`src/pages/[...path].astro` собирает существующий RU/EN catalogue и отдельно утверждённые localized Registry entries, с дедупликацией по пути. Candidate route сам по себе не создаёт публичной страницы. UAE — особая реализация `src/pages/uae.astro` + `src/pages/en/uae.astro`, не запись Registry. OG и sitemap — отдельные dynamic handlers.

| Направления | Текущее состояние |
| --- | --- |
| ID / Бали | RU/EN hub 200 и indexable. Namespace `/bali/` сохраняется |
| TH / Таиланд, AE / ОАЭ, NP / Непал, RU / Россия | RU/EN hubs 200, public noindex; текущий UI и доступность разделов сохраняются |
| JP, SG, IN, VN, AU, US, KR, ZA | Страновых страниц нет; существующие visa content IDs есть, коммерческие Service/pricing bindings отсутствуют |
| DE, FR, IT, ES | Условные будущие страны для реального Schengen main-destination service; только предложения |
| Schengen | Региональный intent `schengen`, не восемнадцатая страна |

На сайте уже есть dropdown по ISO-странам, а не только пять карточек: `src/components/CountryPicker.astro`, `src/client/public-selector-policy.mjs`, `src/client/country-picker.js`. Пять существующих направлений открывают реальные RU/EN hubs; остальные предлагают уточнить услугу у менеджера. Наличие страны в dropdown не является публичной страницей или визовой услугой.

У всех девяти международных визовых records нынешние кандидаты `/visas/<country>/`; предложенные country-first `/<country>/visas/` пока не применены. GET существующих candidates и предложений — 404. В текущей проекции нет Service ID и approved quote binding. Не менять записи и не создавать массовые 301. `applicationCountry` определяется по ситуации; ID — пример origin, не гражданство, residence, KITAS или UI language.

## 4. Пять конфликтов URL

Во всех десяти адресах получен HTTP 404, а не редирект или успешная страница. Для продолжения сохраняем нынешний Registry candidate как стабильный canonical черновика; editorial alternatives не применяем. Это не выбор по SEO-рейтингу или backlink evidence — таких данных нет.

| ID | Существующий candidate, сохраняется | Предложение из пакета, не применено |
| --- | --- | --- |
| pma | `/bali/business/company-registration/` | `/bali/business/pt-pma/` |
| nib_oss | `/bali/business/nib-oss/` | `/bali/business/oss-licenses/` |
| corporate_changes | `/bali/business/corporate-changes/` | `/bali/business/company-changes/` |
| liquidation | `/bali/business/company-liquidation/` | `/bali/business/company-closure/` |
| translations | `/bali/documents/certified-translations/` | `/bali/documents/certified-translation/` |

Существующие `mergeTargetId` liquidation → corporate_changes и translations → apostille — исторические предложения, НЕ команда автоматического слияния услуг, deletion или redirect. Сохранять самостоятельные identities, пока отдельно не решён editorial route question.

## 5. Покрытие каталога из нового пакета

94 намерения Бали дают 92 ссылки на 76 уникальных существующих content IDs. Две оставшиеся — зарезервированные `legalization` и `corporate_docs`, НЕ созданные Service или records. Повторы bikes/transfer/concierge/guides и др. отражают section/feature/resource одной услуги, не право создавать новый прайсинг.

| Группа | Intent rows | Уникальные существующие IDs | IDs с public binding/overlay |
| --- | ---: | ---: | ---: |
| Визы и KITAS | 26 | 25 | 20 |
| Бизнес и лицензии | 27 | 25 | 0 |
| Документы | 9 | 6 | 0 |
| Жильё | 8 | 6 | 6 |
| Транспорт и аэропорт | 10 | 4 | 0 |
| Жизнь на Бали | 12 | 8 | 3 |
| Страховки и финансы | 2 | 2 | 2 |

Счётчики public IDs — source mapping, не проверенная operational availability. Байки уже присутствуют как entry/действие внутри услуг и кабинетных данных; отсутствие самостоятельного опубликованного Registry route не означает отсутствие функционала аренды. Нельзя создавать второй bike Service из-за новой карточки меню.

Полное row-by-row сопоставление, current route, proposed route, Service.slug, pricingRef, translation state, current publication и reuse — `ROUTE_ID_MAPPING.json`. Knowledge добавлен отдельным перечнем; одна новая тема apostille-vs-legalization пока без content ID/source body.

## 6. Архитектура контента и повторно используемые элементы

Единый контентный Registry: `shared/content/service-registry.v1.json`; shape/refs/approval checks: `shared/src/service-registry.mjs`; authored hashes: `shared/scripts/validate-service-registry.mjs`. Полные предоставленные MD+metadata/source JSON живут в `shared/content/registry-copy/`, с immutable supplied envelopes и revision pins. Selective build manifests — единственный дополнительный publication gate; seed/candidate не доказывают публикацию.

Повторно используемая public цепочка:

`Registry → publication manifest → registry-document.mjs → RegistryPublicPage/RegistrySections/RegistryActions → RegistryPublicLayout → existing support/pricing adapters`.

- Hero, short answer/fact blocks, требования, процесс, FAQ, related, CTA: `src/components/registry/RegistryPublicPage.astro`, `RegistrySections.astro`, `RegistryActions.astro` и renderer.
- Service/Knowledge wrappers: `RegistryServicePage.astro`, `RegistryKnowledgePage.astro`.
- Общий header/footer, темы, support: существующие `SiteHeader`, `SiteFooter`, `SupportLauncher`, layouts/client modules.
- Старые country/service cards: `CountryApps.astro`, `ServiceApps.astro`; не отдельная CMS.

Минимальный следующий вариант — необязательный planning/reference раздел **в существующем Registry**, не новая Service таблица, CMS или каталог цен. Черновик уже подготовлен отдельно, его содержание и ограничения в `CATALOG_IMPLEMENTATION_DIFF.md`. Public compiler не должен воспринимать этот раздел как release authority.

## 7. RU/EN и десять языков — разные слои

Все 37 selected Registry identities имеют реальные тела и SEO в десяти локалях; publicAlternates не подставляет RU-текст вместо отсутствующего перевода. Арабский контент использует `dir=rtl`; canonical/hreflang подтверждены HTTP для выбранных AR/JA/zh-Hans C1, не rendered QA.

Но legacy catalogue и общая website chrome до сих пор RU/EN: `src/lib/public-i18n.ts`, generated `i18n/public.v1.json`. В `registry-publication.mjs` `chromeLocale` принудительно ru для RU, en для остальных. Header, support, country picker и многие служебные надписи не становятся ten-language UI только от появления 10 переводов статей. Это конкретный остаток прежней задачи клиентского интерфейса; админку не переводить.

Уже существующая language detection: manual preference → Telegram hint → browser hint, explicit deep link сохраняется; неподтверждённый перевод не открывается автоматически (`src/client/public-selector-policy.mjs`, `language.js`, `LanguagePicker.astro`). Не создавать второй language switcher/detection subsystem.

## 8. Формы, Telegram, CRM и аналитика

Public article сохраняет `sourceContext` и `content_id/source_revision/path/locale`. `src/client/support.js` передаёт его в существующий POST `/api/web/chat/guest`; backend `app/schemas/client_portal.py::RouteContext` ограничивает форму полей и явно считает их клиентской атрибуцией, не авторизацией. `app/api/web_portal.py` сохраняет conversation и использует existing outbox; распределение staff — `app/services/support_recipients.py`. Тестовые сообщения реальным людям НЕ отправлялись.

Расширение требует устранить будущую ошибку контекста: `registry-publication.mjs::buildPublicRegistryModel` сейчас все non-Partners records по умолчанию относит к Бали/visa и breadcrumb «Визы»; `RegistryPublicLayout.astro` выставляет `data-world="bali"`, `data-service-id={serviceId ?? 'visa'}`. Это корректно не считать универсальной моделью для Business/Documents/world visas. До их публикации нужен детерминированный section/destination context без выдуманного Service.slug.

First-party analytics уже реализована: `src/client/analytics.js`, `app/api/analytics.py`, `app/services/analytics.py`, schemas/models. Consent/Do-Not-Track/GPC, allowlisted dimensions и лимиты есть. События не сериализуют паспорт/форму/полный URL. Language/country selection не является основанием доступа, residence или новой визовой eligibility. Новый analytics pipeline создавать заново не нужно; фактическая enabled policy production в этом аудите не проверялась.

## 9. Прайсинг: строго сохранять

`Service.slug` не равен integer `Service.id` базы. Content ID отдельно от обоих. Existing `pricingRef` указывает VISA/SERVICE entity + option; amounts живут только в published catalogue / editable Business settings.

`app/services/catalog_pricing.py` содержит работающие две разные проекции: USDT до двух знаков и **примерные USD до ближайших $5**, непосредственно из IDR / Indodax ask. Формула approximate: `IDR_DIV_ASK_USDTIDR_HALF_UP_5USD_APPROX_V1`. `astro-site/scripts/registry-price-bindings.mjs` проверяет эту projection/version/expiry. Новые страницы подключать к этому механизму; не hardcode USD, не заменять округление и не дублировать FX updater.

Проверка исходников: backend/legacy/pricing не менялись; pricing manifest и все 154 records сохранены byte-for-byte. Текущее обновление FX или публикация каталога НЕ выполнялись; live operational price parity отдельно не перепроверялась.

## 10. SEO и результаты проверки

Canonical/OG/JSON-LD: `src/lib/seo.ts`, `RegistryPublicLayout.astro`. Sitemap: `src/pages/sitemap.xml.ts`. Robots: `public/robots.txt`. Legacy publication: `src/lib/public-publication.ts`; overlay — selective manifests.

Fresh GET audit: 107 URL, 65 ответов 200, 42 ответа 404, fetch errors 0. Все 37 RU selected identities и AR/JA/zh-Hans C1: ожидаемые 200, canonical, exposure и hreflang совпали. Sitemap: 326 уникальных loc, все 310 indexable overlay locales включены, 60 noindex overlay locales исключены, новые country/world/conflicting candidates не попали.

Существующие страницы нельзя удалять/заглушать/noindex из-за чернового planning status. Публикация, indexable markup, sitemap inclusion и фактическая поисковая выдача Google — четыре разные вещи. Search Console / поисковая индексация не проверялись.

## 11. Проверки и реальные оставшиеся долги

18 focused tests PASS; полный authored Registry validator PASS; 370 baseline/current public model comparisons PASS; Astro check 0 errors/0 warnings/2 existing hints; static build 463 pages PASS. Независимый read-only review повторил семь новых тестов и подтвердил публикационные границы.

Найденный P1 локального черновика: structural validator пока не проверяет семантическое соответствие country↔slug↔hub и world visa↔kind/content ID. Подмена Japan → c1 или Japan hub → Singapore структурно допустима. **Текущий импорт правильный**, exact-source importer проверяет pinned source SHA; но до дальнейшего расширения/merge нужны отрицательные проверки и строгие связи. Черновик не выпущен, исправление не объявляется выполненным.

Другие конкретные остатки:

- Documents complete source pack отсутствует; не терять полные JSON SEO/fact/CTA поля при будущем импорте.
- Business/source legal/semantic/native/rendered QA и реальные operator/quote/eligibility decisions остаются отдельными gates.
- Новые 8+4 country proposals и 9 visas не имеют одобренных коммерческих операций.
- Семь новых RU nav groups нельзя включить все сразу: Business/Documents/transport route readiness не достигнута; сохранить assistant/guides/insurance/exchange/housing/visa chooser.
- Клиентская chrome не полностью локализована на 10 языков.
- Background/breadcrumb/lead context жёстко рассчитаны на Бали/визы.
- В старом release receipt остался EN D12 extension static SEO price-unavailable до JS hydration; этот аудит его не исправляет.
- Выявленный drift canonical state/backlog summaries **устранён в последующей docs-only синхронизации**; это не оставшийся продуктовый долг. См. `../DOCUMENTATION_SYNC_2026-10-11.md`.
- Rendered desktop/tablet/mobile/RTL/CJK и клики не проверены; браузеры не запускались.
- Остановленные native/Admin-date/SEC-NEXT/Yoga bot/product работы не возобновлялись и не включались. Прежние документы/immigration tracking и закрытые клиентские данные вне scope.

Это подтверждённый baseline для следующего решения, не сообщение «весь roadmap выполнен».
