# Codex — G01 Working KITAS: единый многоязычный пакет

**Основа:** текущая ветка/фактический рабочий baseline Codex; не откатывать изменения после v82 и не предполагать, что main по-прежнему 4404c94. Файлы этого ZIP — редакционный источник, а не команда на немедленный деплой.

## 0. Сначала согласовать с выполняемой v82

1. Зафиксировать текущую ветку, SHA, локальные несохранённые изменения и состояние задач v82 (semantic routing, page context, Documents import, UI-key export).
2. Не применять этот пакет поверх незавершённой работы в пересекающихся файлах. Взять контент в отдельную staging-область существующего Registry.
3. Сохранить действующие опубликованные страницы, Registry, Service IDs, pricingRef, Indodax и любые формулы, CRM/лиды, bot/рефералы и исторические данные.

## 1. Импорт без дублей

Изучить `DATA/RU_SOURCE_MANIFEST_v83.json`, `DATA/CONTENT_IMPORT_STAGING_ALL_10.json`, юридические ограничения и все полные Markdown. Сопоставить 6 смысловых идентификаторов:

| contentId | Предлагаемый RU route | Категория | Действие |
|---|---|---|---|
| `working` | `/bali/visas/working-kitas/` | visa service | REUSE existing |
| `rptka` | `/bali/business/foreign-worker-permits/` | business/manpower | REUSE existing |
| `wlkp` | `/bali/business/wlkp/` | company reporting | REUSE existing |
| `working_conversion` | `/bali/visas/working-kitas/conversion/` | immigration status review | REUSE existing |
| `knowledge_working_documents` | `/bali/knowledge/working-kitas/documents/` | Knowledge | check duplicates, then add |
| `knowledge_working_vs_e33g` | `/bali/knowledge/working-kitas/e23-vs-e33g/` | Knowledge | check duplicates, then add |

`serviceId=null` НЕ означает создать Service; ни один contentId не является основанием для нового прайса или backend operation.

## 2. Языки и SEO

RU без префикса, EN `/en`, DE `/de`, ZH-Hans `/zh-cn`, KO `/ko`, FR `/fr`, JA `/ja`, HI `/hi`, ES `/es`, AR `/ar`. Реальные маршруты сверить с текущим resolver; `routeHint` — не доказательство live URL.

- Сохранять полноценный контент (не только H1 и описание), семантические FAQ, мета-данные, CTA, реальные внутренние ссылки.
- Локализовать внутренние ссылки через stable `contentId` и доступность переведённой целевой страницы. Не направлять пользователя на 404 и не включать отсутствующие локали в hreflang.
- Проверить canonical, real alternates/hreflang, sitemap, robots, видимые даты, schema только по видимому тексту.
- Артикулы/названия виз и документов (`E23`, `E33G`, `E28A`, `RPTKA`, `WLKP`, `ITK`, `ITAS`, `DKPTKA`) не переводить как отдельные legal index IDs.
- AR RTL: полноценный bidi QA для смешанных кодов, таблицы сравнения, денег, кнопок и входных полей.
- 10 языков страниц **не заменяют** задачу v82 по переводу общей UI-оболочки; не утверждать полную мультиязычность сайта до её выполнения.

## 3. Юридические и коммерческие гейты

Проверить eVisa/Immigration и JDIH Kemnaker в актуальных официальных источниках при внедрении:
- E23 не универсален для всех рабочих ролей.
- RPTKA работодателя и трудовая отчётность WLKP — разные обязанности.
- DKPTKA не SAFRWAY fee.
- Первоначальные сроки E23 зависят от индекса и основания (источник перечисляет 180 дней / 1 год / 2 года).
- E33G для работы на зарубежную компанию; не дает автоматического права на локальный найм.
- ITK → ITAS/onshore/Bridging требует case check, не обещать для C1/B1/D12 автоматически.
- Цена для всех новых коммерческих услуг индивидуальная; запрещён тариф «0» либо заимствованный прайс.
- Проверить, доступен ли законный подрядчик для каждой услуги, прежде чем обещать исполнение.

Значимые неопределённости не должны блокировать другие готовые релизы v82.

## 4. QA и отчёт

Запусти `python3 QA/validate_bundle.py --self-test`, сверку SHA и тесты проекта. Обязательно VibeDiz для новых страниц, desktop/mobile, CJK/RTL. Затем отчитайся:
- текущая ветка и commit SHA, changed files, конфликты с v82;
- что импортировано и что оставлено preview;
- исходный RU hash + locale QA evidence;
- реальные опубликованные URL, HTTP, canonical/hreflang, robots, sitemap, CTA; результаты тестов, VibeDiz;
- unresolved legal/service/pricing gates;
- deployed SHA **только если деплой действительно состоялся**.

Не создавать отдельную CMS/прайсинг и не изменять рабочие валютные механизмы.
