# Отдельный локальный черновик: что изменено, но НЕ выпущено

После уточнения Founder активный результат — аудит для синхронизации Codex/GPT. Подготовленный до уточнения код сохранён в изолированной рабочей копии. **Candidate code** не коммитился, не пушился, не деплоился. Baseline до последующего docs-only push — `3659ba7…`; опубликованные audit reports не являются merge или deploy этого кандидата.

## Структура данных

В существующий `shared/content/service-registry.v1.json` добавлен только optional `routingPlan`:

- schema/task/provenance pinned source SHA; exposure preview_only, publicationAuthorized false;
- 7 предоставленных RU nav labels/descriptions, activation preview_only; прежние insurance/exchange/assistant/guides/visa entry IDs сохранены;
- 94 Bali intent references: 92 ссылки на 76 текущих IDs, два reserved/unresolved, никаких новых Service/record/price;
- 9 world visa intent references: нынешние `/visas/<country>/` не переименованы, новые country-first URL только предложения;
- 17 entities `country:<ISO>` в отдельном namespace, из них 5 preserve-existing, 8 preview-only, 4 conditional-preview; Schengen остаётся регионом;
- 4 global intents и 9 Knowledge references; Referral не активирован;
- applicationCountryCode=null/context_dependent, ID только origin example.

Все существующие 154 records, legacy bindings, source approvals/revisions, full bodies/metadata, publication/price manifests сохранились. Старый Registry без `routingPlan` восстанавливает точный SHA `5ca10b34e8f5aad70eda240e2af55e02f51dfe330f2e184006f0d459a3870634`.

## Изменённые / новые файлы кандидата

- `shared/src/catalog-country-routing.mjs` + `.d.mts`: planning contract и evidence-only target resolver, не публичный router.
- `shared/src/service-registry.mjs` + `.d.mts`: optional schema validation/type.
- `shared/content/service-registry.v1.json`: только новый root section.
- `shared/scripts/import-country-catalog.mjs`: pinned exact input/checksums, идемпотентный импорт с compare-before-write. В Git могут войти только sanitized MASTER и RU nav source; исторический чат не импортируется.
- `shared/content/registry-copy/country_catalog_source_pack/`: две точные non-private source files.
- `shared/tests/catalog-country-routing.test.mjs`: frozen baseline, import idempotency, countries/regions, no-public-fallback и отрицательные проверки.
- `shared/tests/fixtures/pre-business-registry.mjs`, `business-bundle.test.mjs`: исторический replay сначала валидирует, затем удаляет ТОЛЬКО новую planning extension. Все прежние frozen hashes остались прежними; изменения в records не скрываются.
- `astro-site/scripts/registry-catalog-routing-preview.mjs`, `registry-preview.mjs`: `/_registry/catalog_routing/` только в прежнем localhost/authenticated dev middleware. Предложения URL — escaped text, ссылки только к защищённым existing records; no forms/prices/public navigation.
- `astro-site/tests/registry-catalog-routing.test.mjs`: auth/loopback/GET/HEAD/raw-deny/no route leaks и неизменность 37×10 public projection.
- `AUDIT/COUNTRY_CATALOG_2026-10-11/`: audit/evidence/handoff outputs. Только статические отчёты опубликованы при docs-only sync; candidate-dependent генераторы остались в read-only archive. Это документация, не product release.

Публичные templates/nav, service pages, sitemap/robots, approved manifests, CTA runtime, backend, бот, CRM, referral graph, pricing и client storage НЕ изменены.

## Не закрытые ограничения кандидата

1. Семантическая validator hardening отмечена независимым reviewer: проверить world record kind, unique identities, current referenced candidate route, country/slug/hub associations. Exact-source первоначальный импорт верен; generic structural validation недостаточна для будущего расширения.
2. `approvedRoutingTargets` принимает только явную publication evidence; он ещё не подключён к публичной навигации и сам не удостоверяет переданную caller evidence. Approved manifest adapter должен оставаться authority.
3. Обновлённая Registry schema добавляет planning metadata, не разрешение выпускать Business/Documents/foreign visas. Не добавлять цены/доступность/redirect authority в этот слой.
4. Rendered preview/Designer gate не пройдены. Не использовать unit/static QA как визуальное согласование.

До отдельного решения Founder этот кандидат не merge/release-ready. После независимого GPT review исправить только согласованные замечания и сохранить current public invariants.
