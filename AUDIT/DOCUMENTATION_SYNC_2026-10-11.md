# Синхронизация GitHub и документов — 11.10.2026

Scope: canonical summaries + sanitized Codex/GPT audit. Founder разрешил
синхронизацию, Git push и deploy; это изменение содержит **только документы**.
Production deploy не нужен: product bytes остаются прежними. Незавершённый
новый каталог не получает release-ready статус от общего разрешения.

## Точные границы

- Source baseline до синхронизации: `3659ba7c84ffb73a1be208c66834f3afb256c069`.
- Public Astro `67e293919781923b9606eedc925b07be977bc513`, App/Admin
  `36fe5f9036b6c69cf587b31fc24d5e344c65ae39` — fresh public read-back 11 октября.
- Backend/schema и Yoga — последние точные release receipts, не новая
  серверная/базовая проверка; они приведены в `CURRENT_STATE.md`.
- Git publication определяется commit/history и свежим upstream read-back,
  а не предположением по наличию этих файлов. Самоссылочный commit hash в
  собственном содержимом не используется. Финальная publication receipt и
  обновлённый архив сохраняются отдельными handoff artifacts.

## Изменённые документы

README, Project Snapshot, Project Index; canonical Backlog, Decision Ledger,
Yoga Ganster; AUDIT README, CURRENT_STATE, ROADMAP_AND_ACTIVE_SPRINTS,
OPEN_ISSUES_AND_RISKS, MANIFEST, CHATGPT_PRO_PROMPT, RELEASE_CHECKLIST,
RELEASE_INCIDENTS; этот report и статический
`COUNTRY_CATALOG_2026-10-11/` audit pack.

В новом audit folder сохранены route inventory, ID mapping, HTTP/SEO JSON/CSV,
preservation/check results и отдельная запись NOT_RUN rendered QA. Прежние
проверки описывают audit snapshot до docs push; не объявляются повторно
выполненными или production release evidence.

## Проверки соразмерно scope

Локальная проверка данного docs-only набора: 28 файлов, 5 JSON parse PASS,
73 относительные Markdown-ссылки без пропусков, добавленный текст/новые
файлы без найденных credential/private-path patterns. `git diff --check`
PASS; runtime/shared/deploy/workflow/AGENTS diff против baseline пустой.
Fresh public GET повторно подтвердил Astro67e и App36fe без production writes.
Это ограниченная проверка redaction и сохранности, не security guarantee.

- Только документационные paths; product trees и workflow остаются равны
  baseline. Registry/pricing/publication manifests не меняются.
- Parse предоставленных JSON, ссылки новых актуальных слоёв, `git diff --check`
  и проверка добавленного текста/пакета на секреты и private data.
- GitHub main сверяется перед push и после него; force push не разрешён.
- Единственный existing GitHub workflow — quality-gates, без deploy job.
  CI status фиксируется отдельно от документационной публикации.
- Новый Designer/contributor handoff — N/A: design/code не меняются и
  замороженные handoffs не интегрируются. Последний независимый audit review
  отражён в `COUNTRY_CATALOG_2026-10-11/CHECK_RESULTS.json`.
- Runtime activation, restart, migration, FX refresh, клиентские сообщения,
  rendered browser и восстановление whole host — NOT_RUN / не входят в scope.

## Сохранённое вне публикации

Optional routingPlan/importer/preview/tests — в прежнем изолированном draft,
не в main. Evidence generators с зависимостью от этого draft — только в
предыдущем read-only archive. Private input/chat, .env, токены, clients,
паспортные документы, dumps, node_modules/dist и protected originals не
копируются в Git. Остановленные SEC-NEXT/native/Admin-date/Yoga product work
не возобновляются.

Долги не выданы за завершённые: см.
[Backlog](../06%20Development/docs/Backlog.md) и
[open decisions](COUNTRY_CATALOG_2026-10-11/OPEN_DECISIONS_AND_NEXT_STEPS_RU.md).
