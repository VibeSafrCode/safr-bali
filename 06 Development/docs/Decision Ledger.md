# SAFRWAY Bali — Decision Ledger

Актуализировано: 2026-09-09 (audit E2 local implementation).

Статус: канонический локальный реестр явно утверждённых решений SAFRWAY/Bali.
Владелец утверждения: Founder/CEO. Маршрут координации: Assistant Bali
`019fb1d7-a598-72e0-af9d-18baa5a267df`.

## Правила доказательности

- `APPROVED` подтверждает решение или разрешение, но не доказывает реализацию,
  тесты, push, migration apply, deploy или production state.
- Состояния фиксируются раздельно: `PLANNED`, `IMPLEMENTED_LOCAL`,
  `TESTED_LOCAL`, `PUSHED`, `DEPLOYED`, `PRODUCTION_SMOKE_PASSED`,
  `FIX_VERIFIED`.
- Созданная, но не применённая migration имеет только статус
  `CREATED_NOT_APPLIED`.
- Release/deploy утверждается лишь по точному SHA, deployed artifacts,
  migration heads, service state и production smoke.
- Исправление этого файла требует отдельного подтверждённого решения или
  доказуемой фактологической коррекции; выполненные решения не удаляются.

## Решения

### External audit E2 — visa publication and SEO, 2026-09-09

`BALI-DEC-20260909-E2` — `APPROVED_LOCAL / TESTED_LOCAL / RELEASE_GATES_OPEN`.
Основание: прямой запрос Founder «делай 2ой этап». E1 сохранён отдельным
локальным commit `998595a`; E2 реализуется отдельно, без native WIP и без
нового разрешения на Git push или production. Доказательства и release gates:
`AUDIT/E2_EXECUTION.md`. История старых deploy ниже остаётся историей.

Технические решения в уже утверждённом scope:

- Одна fail-closed publication policy для robots, sitemap и alternate links;
  наличие услуги само по себе не разрешает индексацию. Полная URL-матрица:
  `AUDIT/E2_ROUTE_INVENTORY.md`.
- Пилот C1/E33G и ограниченный визовый hub: RU/EN typed editorial, конкретные
  официальные источники, фактическая сверка 2026-09-09, срок повторной проверки
  2026-10-09. Это не утверждение юридической экспертизы. Изменение текста,
  источников или дат закрывает индексацию до новой сверки hash.
- Стоимость SAFR берётся только из прежней canonical runtime projection;
  статья содержит условия, а не копии цен. Пороги средств/дохода относятся к
  визовым требованиям и не удаляются. A07 structural переносится в E2;
  изменение polling остаётся E3. Bot legacy copy не переименовывается в новую
  проверенную справку; его отдельное обновление требует review.
- Отсутствующая дата изменения не заменяется датой сборки. Для static artifact
  дата проверки фиксирована; до истечения review требуется повторная сверка и
  сборка/выпуск по отдельному release gate. Автомонитор не создавался.
- OG — локальные code-generated PNG без новых AI-изображений или редизайна.
  No-JS текст ведёт по реальной ссылке в Telegram без отправки сообщений.


### External audit — staged execution, 2026-09-09

`BALI-DEC-20260909-E1` — `APPROVED_LOCAL / TESTED_LOCAL / RELEASE_GATES_OPEN`.
Основание: Founder попросил реализовать правки аудита четырьмя независимо
замораживаемыми/выпускаемыми этапами, закрыть незавершённые release-blocking долги
в первом и сохранить unrelated native WIP; затем «продолжай работу».
Это не фиксация нового разрешения на push/production. Exact-SHA CI и release
gates остаются отдельными. Никакой stage E1 migration не требуется.

Технические решения команды в этом scope (не новые продуктовые направления):

- Official pnpm action + pinned pnpm 11.9.0; Node 24.19.0 LTS в обоих frontend
  CI jobs после reproduction/independent review старого Node22 warning boundary.
  Не отключать предупреждения/проверки. Bundled Wrangler legacy punycode — P2
  upstream debt, не объявлять его устранённым сменой runtime.
- Production secrets/config fail closed; bounded readiness отделена от liveness.
- Service credential не удостоверяет human actor: Points write rejects non-null
  actor; ledger bounded cursor envelope. Исторические rows, reward economics и
  replay conflicts не переписываются; migration consumers — release gate.
- Limiter не доверяет raw CF header в приложении. Real-IP восстанавливается
  только на loopback tunnel boundary Nginx, XFF заменяется resolved address;
  Uvicorn trust фиксируется на loopback. Edge policy и совместный rollback
  Nginx/unit/backend проверяются до активации.
- Исправления measured Lighthouse gate входят в E1: pre-paint существующий
  language script, без overlay/autonavigation; build-time responsive approved
  artwork, без нового дизайна. Broad performance program остаётся E3.

Evidence/остатки: `AUDIT/POST_AUDIT_EXECUTION.md`, API Spec и Backend/VPS Runbooks.
Stage 2–4 не начаты; referral levels/fixation и protected files не активированы.

| Decision ID | Статус | Scope | Утверждённое решение | Evidence source | Execution evidence |
| --- | --- | --- | --- | --- | --- |
| `BALI-DEC-20260730-001` | `APPROVED` | Governance | Ролевой контур, no-evidence/no-release rule, approval gates и маршрутизация через Assistant Bali. | Делегация Founder/CEO через канонический Assistant Bali | Governance rule active; техническое выполнение не подразумевается. |
| `BALI-DEC-20260801-001` | `APPROVED` | `BALI-TASK-020` local implementation | Локальная реализация требований master prompt, локальные тесты/build и visual evidence разрешены; migration apply, push/deploy и infrastructure writes этим решением не разрешены. | Делегация Founder/CEO через Assistant Bali; master prompt SHA-256 `0ba4d5725a939f870bd15321b6c52e8dac62780780dc3bf52550e28b7f0abb27` | Отдельный changed-files/test packet обязателен. |
| `BALI-DEC-20260801-002` | `APPROVED` | `BALI-TASK-020` release gate | После зелёных tests/build разрешены согласованные commit, push, стандартный deploy, рестарт только затронутых сервисов, production smoke и rollback. Этим решением migration apply, DB writes и Cloudflare/DNS/Nginx changes не разрешались. | Делегация Founder/CEO через Assistant Bali | `BALI-DEC-20260801-007` позднее добавляет отдельное условное разрешение migration apply; ни одно approval не является evidence исполнения. |
| `BALI-DEC-20260801-003` | `APPROVED` | `BALI-TASK-021` | Разрешено локально создавать и редактировать релевантную каноническую документацию; documentation patch передаётся Assistant/CTO для согласованного commit/push. | Делегация Founder/CEO через Assistant Bali | Этот ledger создан в рамках разрешённого documentation patch. |
| `BALI-DEC-20260801-004` | `APPROVED` | RUB display rounding | Клиент отдаёт RUB: `ceil` до целого или настроенного шага; клиент получает RUB: `floor`; точное кратное не изменяется. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | `IMPLEMENTED_LOCAL`; direction/boundary tests включены в green backend matrix. |
| `BALI-DEC-20260801-005` | `APPROVED` | `USDT_TO_IDR_BANK` fee | Комиссия `max(10 USDT, 4%)`: `249.99 → 10`, `250 → 10` с классификацией `MIN_FEE`, `250.01 → 4%`. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | `IMPLEMENTED_LOCAL`; все три boundary cases подтверждены green tests. |
| `BALI-DEC-20260801-006` | `APPROVED` | Positive WHITEBIRD surplus | Base = `Coinbase × 0.9925`. Если подтверждённый actual WHITEBIRD sell-rate лучше, `client_rate = base + 0.5 × (actual − base)`; surplus делится `50%` клиенту / `50%` SAFRWAY. Rate timestamp/TTL и распределение сохраняются в audit snapshot. Без подтверждённого actual используется protective base и manual confirmation. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | `IMPLEMENTED_LOCAL`; split, timestamp/TTL, audit snapshot и fallback подтверждены green tests. |
| `BALI-DEC-20260801-007` | `APPROVED` | Production migration gate | До production apply обязательны: точная successor revision; backup checksum; restore-proof на isolated DB; `upgrade → downgrade → upgrade`; heads before/after; rollback plan. При ошибке — stop/rollback без продолжения deploy; после apply — tests, service health и production smoke. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | Все gates подтверждены; production migration `APPLIED`, head `e8a1c4d7f920`. Initial deploy был на `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`; subsequent hotfix `3d2176c27a7f27707e12f34aef3a99c5d8de64b3` имеет `FIX_VERIFIED`. |
| `BALI-DEC-20260801-008` | `APPROVED` | Operating mode | Для BALI-TASK-020/021 действует постоянный экономный режим: текущий diff/evidence и релевантные SoT без повторной инвентаризации и дублей. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | Governance constraint active. |
| `BALI-DEC-20260801-009` | `APPROVED` | Resource exception | Повышенный расход разрешён только для backend/migration восьми маршрутов и финальной regression/deploy/smoke BALI-TASK-020. Документационная работа остаётся экономной. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | Не изменяет evidence и approval gates решений `002`/`007`. |
| `BALI-DEC-20260801-010` | `APPROVED` | DEC-007 continuation | Разрешены corrected read-only preflight и оставшаяся DEC-007 цепочка: backup/checksum, isolated restore, migration rehearsal, production apply, standard deploy/restart/smoke. Несвязанные Cloudflare/DNS/Nginx config и secrets вне scope. | Founder/CEO через Assistant Bali от 2026-08-01 | Corrected preflight `PASS`; backup/checksum подтверждены. Новая read-only ошибка вызвала STOP до isolated restore; дальнейшие operations не выполнялись. |
| `BALI-DEC-20260801-011` | `APPROVED` | DEC-007 second retry | Разрешены corrected local read фактического `app/core/config.py` и продолжение с isolated restore gate, используя уже проверенный backup; scope не меняется. | Founder/CEO через Assistant Bali от 2026-08-01 | Isolated restore и `d6 → e8 → d6 → e8` rehearsal `PASS`; exact-SHA Astro build остановлен до production apply из-за отсутствующего `node` в non-login PATH. |
| `BALI-DEC-20260801-012` | `APPROVED` | Exact-SHA artifact-build retry | Разрешены загрузка/использование configured bundled Node runtime для local exact-SHA builds и продолжение с artifact-build gate; без scope/config/secret changes. После фактического migration/deploy/smoke evidence требуется sprint closure packet. | Founder/CEO через Assistant Bali от 2026-08-01 | Exact-SHA builds/artifacts, migration apply, deploy и initial smoke `PASS`; subsequent P0 `BALI-TASK-023` исправлен и подтверждён hotfix evidence. |
| `BALI-DEC-20260801-013` | `REJECTED` | Current-sprint public calculator | Public Nginx route и public functional calculator отклонены для текущего спринта. | Founder/CEO через Assistant Bali от 2026-08-01 | Предыдущее требование public functional calculator/controls в current sprint не действует. |
| `BALI-DEC-20260801-014` | `APPROVED` | Deferred public calculator | Public calculator отложен в отдельную будущую задачу; запуск разрешён только после `design sprint = CLOSED` и `visas redesign = COMPLETED`. | Founder/CEO через Assistant Bali от 2026-08-01 | Создан только backlog record `BALI-TASK-024`; execution не разрешён до подтверждения обеих зависимостей и обычной approval chain. |
| `BALI-DEC-20260801-015` | `APPROVED` | Current public calculator page | На текущей public calculator page функционального calculator нет. Требуется compact responsive message и CTA «Войти» на canonical authenticated app/login route; oversized hero исправляется сейчас. Public calculator API и Nginx route запрещены. | Founder/CEO через Assistant Bali от 2026-08-01 | `PASS`: public page `200`, compact CTA «Войти», `/account/` → `307` в authenticated zone; public calculator/API отсутствуют; desktop/mobile evidence получен. |
| `BALI-DEC-20260805-008` | `APPROVED` | `BALI-TASK-025` | Approval reference подтверждён; точный decision payload не воспроизведён в BALI-TASK-026 evidence packet. | Founder/CEO через Assistant Bali от 2026-08-05 | BALI-TASK-025 `RELEASE_SUCCESS`; code SHA `142c3ea112e0d61d88eef81b93779bca3e648e72` deployed. |
| `BALI-DEC-20260805-009` | `APPROVED` | `BALI-TASK-025` | Approval reference подтверждён; точный decision payload не воспроизведён в BALI-TASK-026 evidence packet. | Founder/CEO через Assistant Bali от 2026-08-05 | BALI-TASK-025 `RELEASE_SUCCESS`; code SHA `142c3ea112e0d61d88eef81b93779bca3e648e72` deployed. |
| `BALI-DEC-20260805-010` | `APPROVED` | `BALI-TASK-025` | Approval reference подтверждён; точный decision payload не воспроизведён в BALI-TASK-026 evidence packet. | Founder/CEO через Assistant Bali от 2026-08-05 | BALI-TASK-025 `RELEASE_SUCCESS`; code SHA `142c3ea112e0d61d88eef81b93779bca3e648e72` deployed. |
| `BALI-DEC-20260807-001` | `APPROVED` | `BALI-TASK-027/028/029/030` local implementation | Разрешена локальная реализация согласованного scope. | Founder/CEO через Assistant Bali от 2026-08-07 | Astro/React tests и Designer rapid review `PASS`; approval сам по себе не доказывает release. |
| `BALI-DEC-20260807-002` | `APPROVED` | `BALI-TASK-027/028/029/030` release gate | Разрешены согласованные commit, push и deploy. | Founder/CEO через Assistant Bali от 2026-08-07 | Final pushed/deployed SHA `c6c8c530e7e91d49f982e72aef53ca04300ca11d`; production smoke `PASS`. |
| `BALI-DEC-20260807-003` | `APPROVED` | `BALI-TASK-032` documentation release | Разрешены staging ровно четырёх авторизованных canonical docs, один documentation-only commit, push ветки `codex/safrway-stabilization` и independent remote-ref verification. `06 Development/artifacts`, code/content files и production actions исключены. | Founder/CEO через Assistant Bali от 2026-08-07 | Documentation commit/push `PASS`: `18a35904b2e17f5df495a6c266909ca6a9a4299e`; independent remote ref matched; scope exactly four authorized docs. |
| `BALI-DEC-20260808-001` | `APPROVED` | `BALI-TASK-033` scoped frontend navigation hotfix release | Разрешён scoped hotfix release BALI-TASK-033. | Founder/CEO через Assistant Bali от 2026-08-08 | Commit/pushed/deployed SHA `7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`; Astro/React tests, exact-SHA builds и production smoke `PASS`. |
| `BALI-DEC-20260808-002` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | См. общий sprint/release checkpoint ниже; approval сам по себе не является execution evidence. |
| `BALI-DEC-20260808-003` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | См. общий sprint/release checkpoint ниже; approval сам по себе не является execution evidence. |
| `BALI-DEC-20260808-004` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | См. общий sprint/release checkpoint ниже; approval сам по себе не является execution evidence. |
| `BALI-DEC-20260808-005` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | См. общий sprint/release checkpoint ниже; approval сам по себе не является execution evidence. |
| `BALI-DEC-20260808-006` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | См. общий sprint/release checkpoint ниже; approval сам по себе не является execution evidence. |
| `BALI-DEC-20260808-007` | `APPROVED` | Sprint `BALI-TASK-035/036/037/038` | Approval reference подтверждён; индивидуальный decision payload не включён в BALI-TASK-041 evidence packet и не реконструируется. | Founder/CEO через Assistant Bali от 2026-08-08 | Final local/remote/deployed SHA `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`; final release gates `PASS`. |
| `BALI-DEC-20260808-008` | `APPROVED` | `BALI-TASK-043/044` local scope | Default main-admin attribution, immutable canonical join date, manual paid-gated order completion/cancellation, four Telegram admin jobs and secure web admin approved for local implementation; production actions excluded. | Founder/CEO через Assistant Bali от 2026-08-08 | Product contract completed; final implementation/release evidence recorded below. |
| `BALI-DEC-20260808-009` | `APPROVED` | `BALI-TASK-043/045` binding contract | Nine-view admin MVP, four Telegram routes, server authorization and manual order/reversal model approved as binding implementation contract. | Founder/CEO через Assistant Bali от 2026-08-08 | CPO and Designer packages `PASS`; deployed admin smoke `PASS`. |
| `BALI-DEC-20260808-010` | `APPROVED` | `BALI-TASK-044` full release | Approved commit/push, DB backup/restore/rehearsal, migration, referral reconciliation, unique configured-root promotion, deploy and smoke. | Founder/CEO через Assistant Bali от 2026-08-08 | Final release `PASS` under later corrective gates and umbrella `017`. |
| `BALI-DEC-20260808-011` | `APPROVED` | Restore-gate correction | Approved protected postgres-readable temporary backup copy, checksum recheck, isolated restore, cleanup and continuation. | Founder/CEO через Assistant Bali от 2026-08-08 | Backup checksum and isolated restore `PASS`; temporary copy removed after completion. |
| `BALI-DEC-20260808-012` | `APPROVED` | Isolated ownership correction | Approved ownership correction only in isolated DB, application-role access check and rehearsal continuation; production privileges excluded. | Founder/CEO через Assistant Bali от 2026-08-08 | App-role ownership/access and isolated U-D-U `PASS`. |
| `BALI-DEC-20260808-013` | `APPROVED` | Ownership verification retry | Approved corrected read-only ownership check through parameters and continuation. | Founder/CEO через Assistant Bali от 2026-08-08 | Read-only gate `PASS`; no unrelated privilege change. |
| `BALI-DEC-20260808-014` | `APPROVED` | Reconciliation correction gate | Approved production read-only comparison, isolated reproduction, targeted correction and rehearsal; production transaction only after proven `PASS`. | Founder/CEO через Assistant Bali от 2026-08-08 | Isolated reconciliation and idempotent replay `PASS`; guarded production transaction later `PASS`. |
| `BALI-DEC-20260808-015` | `APPROVED` | Corrective release retry | Approved corrected test execution, two-file corrective commit/push, rehearsal and guarded production/deploy retry. | Founder/CEO через Assistant Bali от 2026-08-08 | Corrective/final code SHA `91df0177774d28cca19b57875a5c31f9725c4d8c`; regression and remote verification `PASS`. |
| `BALI-DEC-20260808-016` | `APPROVED` | Bounded activation retry | Approved activation with bounded backend readiness and smoke; DB must not be changed again. | Founder/CEO через Assistant Bali от 2026-08-08 | Layout precondition stopped one attempt before mutation; final corrected activation completed under `017`; DB transaction was not repeated. |
| `BALI-DEC-20260808-017` | `APPROVED` | Sprint completion umbrella | Approved all safe in-scope completion actions, corrections, retries, commit/push/deploy and smoke. Product expansion, deletion, Cloudflare/DNS/secrets, unrelated docs and customer messages remained excluded. | Founder/CEO через Assistant Bali от 2026-08-08 | Final local/remote/deployed SHA `91df0177774d28cca19b57875a5c31f9725c4d8c`; release and smoke `PASS`. |
| `BALI-DEC-20260810-004` | `APPROVED` | `BALI-TASK-051/053` release evidence | Approval reference для завершённого language release и его post-release documentation reconciliation подтверждён; отдельный product payload в evidence packet не воспроизводится. | Founder/CEO через Assistant Bali от 2026-08-10 | `BALI-TASK-051 = RELEASE_SUCCESS`; точные DB/artifact/deploy/smoke факты зафиксированы в checkpoint ниже. Approval сам по себе не является execution evidence. |
| `BALI-DEC-20260828-001` | `APPROVED` | `BALI-TASK-070` scoped push/deploy | Founder разрешил точечный push и production release завершённого Visa operations/notification safety scope. YouTube OAuth/mutations, pricing, secrets, customer messages и новые product directions оставались отдельными gates. | Founder/CEO через primary Bali conversation от 2026-08-28 | Final deployed code `42e924bf06f4fbb3637e1771fdd8c66fad5a1565`; production schema `c6a4e8b2d915`; guarded release evidence recorded below and in `AUDIT/`. |
| `BALI-DEC-20260830-001` | `APPROVED` | `BALI-TASK-071` implementation + push/deploy | Founder разрешил исправить idle-session refresh, user filters/cards/navigation/readability, выполнить QA, scoped Git и production deploy. Customer writes/messages, migrations и unrelated WIP исключены. | Founder/CEO через primary Bali conversation от 2026-08-30 | Application code deployed/verified at `83e3bc3e54a953d41bd0e02053bbd879fc3213f5`; schema unchanged `c6a4e8b2d915`; later docs-only SHA не является application release. |
| `BALI-DEC-20260831-001` | `IMPLEMENTED / DEPLOYED` | `BALI-TASK-071-D` bounded debt closure | Founder разрешил reconciliation четырёх protected canonical docs, Runbook/backlog/AUDIT, safe obsolete Admin Users cleanup, bundle warning reduction/justification, QA, Git и deploy. Новые pricing/storage/YouTube/native/design feature directions не входили в этот cleanup scope. | Founder/CEO через Chief Assistant delegation от 2026-08-31 | Deployed checkout/React `1f574efaba0f45c38b0a3e9e691321143d279123`; no migration, data/customer write, message, backend/bot restart or Astro change; rollback `83e3bc3…`. |
| `BALI-DEC-20260831-002` | `APPROVED` | `BALI-TASK-072` canonical price/FX system | Founder установил обязательный invariant одной published цены и одного FX version для bot, public site, Admin и Mini App; делегировал команде источник/rounding/staleness/fees/effective-date/override choices после трёх вариантов и independent advisory review; одобрил additive migration, QA, Git и guarded production release. | Founder/CEO через Chief Assistant delegation от 2026-08-31 | Начать write-heavy implementation после safe boundary debt closure; existing customer/order prices immutable; no production migration before backup/restore/U-D-U; no deploy при независимом drift или silent stale FX. |
| `BALI-DEC-20260831-003` | `DEPLOYED / VERIFIED` | `BALI-TASK-072` technical selection | Из трёх вариантов (runtime DB, Git manifest, versioned hybrid) выбран versioned PostgreSQL hybrid: IDR canonical, Indodax official pairs/depth/server-time, 2 000 USDT ask VWAP, Decimal, 60s fresh/15m stale, 5% breaker, HALF_UP 0.01 USDT, root override ≤24h, append-only publish/restore и immutable commercial snapshots. | Primary Bali integration после independent sanitized architecture/security/data challenge | Production checkout `97b13ad…`, artifacts `fe5cf2c…`, schema `d7a2f9c4e816`; 28 items, active timer, enforcement and representative four-surface parity PASS. |

## BALI-TASK-020 — release evidence checkpoint

Дата фиксации: 2026-08-01. Evidence source: CTO Bali task
`019fb1d7-7ca0-7451-bbf6-2b1b0df03304`.

### Identity и release state

- Version: `VERSION_UNASSIGNED`.
- Branch: `codex/safrway-stabilization`.
- Baseline и rollback SHA:
  `445972a01372e304a8037dbc684ed2532d7928fe`.
- Code state: `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `PUSHED`, `DEPLOYED`.
- Feature commit/pushed SHA:
  `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`; commit
  `feat: deliver Bali UI and exchange quote engine`.
- Commit scope: 44 files, 5703 insertions, 631 deletions; staged
  `git diff --check`: `PASS`; post-commit worktree: `CLEAN`.
- Hotfix commit/pushed/deployed code SHA:
  `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; commit
  `fix: restore authenticated exchange calculator access`; local HEAD и
  independent remote-tracking ref совпадают с этим SHA.
- Production checkout: `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`.
  Astro active root: `/var/www/safr/releases/3d2176c/astro-site`; React остаётся
  на verified root `/var/www/safr/releases/be2bdf2/react-app`.
- BALI-TASK-020/021/023 documentation SHA:
  `f579c3316eaa8a3143426a35281bd735237f2595`; parent
  `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; remote verified.
- Nginx/Cloudflare/DNS config и secrets: `NOT_CHANGED`; bot не перезапускался;
  temporary deploy files удалены.
- `BALI-TASK-023`: `FIX_VERIFIED`; documentation closure: `PASS`, SHA
  `f579c3316eaa8a3143426a35281bd735237f2595`.

### Implemented contract

- Pure `Decimal` engine всех восьми маршрутов:
  `06 Development/backend/app/services/currency_calculator.py`.
- Orchestration и immutable quote audit snapshots:
  `06 Development/backend/app/services/exchange_quotes.py`.
- Versioned route settings и admin version endpoints; CBR, Indodax и
  optional confirmed WHITEBIRD adapters.
- `GET /mini-app/exchange/options` возвращает восемь route codes.
- `POST /mini-app/exchange/quotes` принимает `route_code`, `GIVE|RECEIVE` и
  amount.
- `POST /mini-app/exchange/requests` требует `Idempotency-Key`, повторно
  использует тот же request и отклоняет collision payload.
- Existing auth, rate limits, referrals и SAFR Points flows сохранены.

### Migration gate

- Revision: `e8a1c4d7f920`; parent: `d6f4a8b2c910`.
- Initial BALI-TASK-020 migration source SHA-256:
  `cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`.
- Read-only compile: `PASS`; local Alembic head: `e8a1c4d7f920`.
- Status: `APPLIED_PRODUCTION`; production Alembic head: `e8a1c4d7f920`.
- Первый production read-only preflight: `STOPPED_ON_ERROR`. Table-list SQL
  завершился PostgreSQL-ошибкой `column "public" does not exist`: nested shell
  quoting передал `schemaname = public` как identifier, а не строку. До ошибки
  были подтверждены DB `safr_bali` и production head `d6f4a8b2c910`; writes не
  было.
- После `BALI-DEC-20260801-010` corrected read-only preflight: `PASS`.
  Подтверждены production repo
  `445972a01372e304a8037dbc684ed2532d7928fe`, DB `safr_bali`, Alembic head
  `d6f4a8b2c910` и active services.
- Backup: `CREATED_CHECKSUM_VERIFIED`:
  `/var/backups/safr-bali/20260801T142552Z-pre-be2bdf2/database.dump`; 138665
  bytes; mode `600`; owner/group `postgres:postgres`; SHA-256
  `2ec42fc7364ca5658b702a1a7e22ee1e72f58524d9c676afc15cbbd4c3c8db89`.
- Второй STOP: local read-only config inspection запросил несуществующий
  `06 Development/backend/app/config.py`; Alembic import указывает на
  `app/core/config.py`. Exit code: `1`. После ошибки production write не было.
- После `BALI-DEC-20260801-011` isolated DB
  `safr_bali_r_be2bdf2_20260801_142952` создана из проверенного backup;
  checksum совпал. Restore proof: `PASS`; restored head `d6f4a8b2c910`, 21
  tables, все 20 production/isolated table counts совпадают.
- Candidate worktree:
  `/var/tmp/safrway-rehearsal-be2bdf2-20260801T142952Z` на точном SHA
  `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`.
- Migration rehearsal: `PASS`: upgrade `d6 → e8`, downgrade `e8 → d6`, upgrade
  `d6 → e8`; tables `21 → 22 → 21 → 22`; route settings total/active/distinct
  `8/8/8`, version `1`; legacy quotes backfilled `6/6`. Critical counts
  неизменны: users `14`, referrals `12`, points `0`, quotes `6`, snapshots `5`.
- Rollback targets подтверждены: repo SHA `445972a`; Astro
  `/var/www/safr/releases/5bb1626/astro-site`; React
  `/var/www/safr/releases/3405560/react-app`; backup restore и DB downgrade
  доказаны rehearsal.
- На VPS отсутствуют Node/pnpm; выбран local immutable build. Третий STOP:
  exact-SHA Astro rebuild завершился exit `1` до build — `pnpm` вызвал catalog
  generator, но non-login PATH не содержал `node`; ошибка:
  `sh: node: command not found`. React rebuild не начинался; PATH correction
  не выполнялся.
- Configured bundled Node runtime и продолжение с artifact-build gate были
  разрешены `BALI-DEC-20260801-012` (`APPROVED`); последующая evidence-цепочка
  приведена ниже. Все три STOP соблюдали DEC-007; до исправленных повторов
  production data не менялись.

### Verification

- Backend: `69 OK`, `5 skipped`; exchange service/API/admin/idempotency matrix
  включена.
- Bot: `49 OK`; import `PASS`.
- React: typecheck `PASS`, unit `6/6`, Vite production build `PASS`,
  build-contract `10/10`, Playwright `5/5`.
- Astro: check без errors/warnings/hints; build `PASS`, `46` pages включая
  `404`; contracts `16/16`; Playwright `11 PASS`, `1` opt-in visual skipped.
- Explicit visual capture: React `1/1 PASS`; Astro `1/1 PASS` через system
  Chrome.
- Public DOM/build contracts подтверждают отсутствие status/source/hash/date
  internals и literal `\\n`; «Другой обмен» скрыт из навигации, прямой legacy
  route сохранён.
- Промежуточно один browser/device run завис и был остановлен; один запуск без
  cached Chromium завершился ошибкой. Исправленный финальный запуск через
  system Chrome прошёл; продуктовый дефект этими сбоями не скрыт.

### Initial BALI-TASK-020 exact-SHA build and artifacts

- Build source: exact clean detached worktree на code SHA
  `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`.
- Astro build: `PASS`, 46 pages включая `404`; artifact contracts `16/16`.
  Archive: 806667 bytes; SHA-256
  `51019715013a7408576f20aab706221ab47c33bdb5e910d2d40e2691b21d1039`.
- React typecheck/build: `PASS`, 2 HTML entries; artifact contracts `10/10`.
  Archive: 85556 bytes; SHA-256
  `1fb8dad11706c6d0859301c27fdbfbffc4b70aec2eae7fbc4ca7a5a30034a5b5`.
- Secret/local-infrastructure scan: `PASS`; remote archive checksums совпали с
  локальными.

### Initial BALI-TASK-020 production apply and deploy

- Первая production Alembic invocation не смогла прочитать root-only `.env`
  под пользователем `postgres`; migration не открылась, DB осталась на
  `d6f4a8b2c910`. Automatic recovery вернул repo
  `445972a01372e304a8037dbc684ed2532d7928fe` и active backend; data change не
  произошло.
- Исправленный вызов использовал exact candidate worktree и local peer
  connection без чтения или изменения secrets.
- Production migration apply: `PASS`; head `e8a1c4d7f920`; 22 tables; route
  settings total/active/distinct `8/8/8`; legacy quotes backfilled `6/6`;
  critical counts остались users/referrals/points/quotes/snapshots
  `14/12/0/6/5`.
- Production checkout/deployed code SHA:
  `be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`, worktree `CLEAN`.
- Active immutable roots:
  `/var/www/safr/releases/be2bdf2/astro-site` и
  `/var/www/safr/releases/be2bdf2/react-app`.
- Только `safr-bali-backend` был stop/started. Backend active: MainPID
  `687783`, ActiveEnterTimestamp `2026-08-01 16:49:32 CEST`; bot, Nginx и
  cloudflared-safrway active. Backend error journal с момента старта: no
  entries.
- Cloudflare/DNS/Nginx config и secrets: `NOT_CHANGED`.

### Initial BALI-TASK-020 production smoke evidence

- `https://safrway.online/` → `200`; новый approved hero присутствует;
  internal status/source/hash/date DOM отсутствует.
- `https://safrway.online/catalog/` → `200`;
  `https://safrway.online/bali/visas/e33g/` → `200`.
- Unknown path: canonical redirect, затем final `404`; slash form → `404`.
- `https://app.safrway.online/` → `200`, exact React bundle
  `main-BiXozCDR.js`; `https://app.safrway.online/account/` → `200`.
- `https://api.safrway.online/health` → `200`; `/db/health` → `200`.
- `https://safrway.online/account/` → `307` на
  `https://app.safrway.online/account/`; `https://www.safrway.online/` → `301`
  на apex; `/directions/bali/` → `308` на `/bali/`.
- Unauthenticated `/mini-app/me` и `/mini-app/exchange/options` → `401`.
- Production OpenAPI содержит options, quotes, requests и admin route-version
  contracts; DB active route list содержит ровно восемь approved route codes.
- Перечисленные checks: `PASS`. Они не включали real Telegram authenticated
  quote/request/customer write.

### Post-release incident — BALI-TASK-023

- Priority: `P0`; owner: CTO; status: `FIX_VERIFIED`.
- Evidence: screenshot Founder от `2026-08-01 19:53:43`; новая Mini App
  показывает «Калькулятор временно недоступен / Сервер вернул неожиданный
  ответ».
- Второй full-page screenshot Founder подтверждает, что public-site calculator
  UI полностью отсутствует: после intro card страница переходит сразу к
  support section.
- По `BALI-DEC-20260801-013` public Nginx route/public functional calculator в
  текущем спринте `REJECTED`. По `BALI-DEC-20260801-015` current public page не
  содержит functional calculator: target — compact responsive message и CTA
  «Войти» на canonical authenticated app/login route. Public calculator API и
  Nginx route запрещены.
- Historical UI observation: oversized public hero `FAILED_OBSERVED`; previous
  acceptance, требовавший public functional controls, не действует. Current
  public acceptance требует desktop/mobile evidence compact message, CTA и
  canonical destination.
- Historical failure state: Mini App authenticated calculator flow
  `FAILED_OBSERVED`; end-to-end authenticated quote/request flow
  `NOT_VERIFIED`. Root cause и fix подтверждены последующим hotfix packet ниже.
- Успешные deploy и перечисленные smoke checks выше не удаляются, но не
  закрывали authenticated calculator flow до hotfix. Финальное подтверждение
  приведено ниже.

### BALI-TASK-023 hotfix resolution

- Root cause: новые migration table/sequence принадлежали `postgres`; runtime
  role `safr_bali` получала `InsufficientPrivilege`.
- Hotfix commit/push/deploy:
  `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; production backend active.
- Production DB head остаётся `e8a1c4d7f920`; table и sequence owners:
  `safr_bali`. Current migration source SHA-256:
  `831349110c71be945124012bbdf5d2a2f804e3ad75f0174d510005458f556ca7`;
  migration после source change: `NOT_REAPPLIED`.
- Hotfix backup:
  `/var/backups/safr-bali/20260801T153006Z-pre-3d2176c/database.dump`; SHA-256
  `304808239873ec836fa163cd42f77b0b952ce039b9c648f860218c139371dc04`.
- Authenticated production smoke: auth `200`; exchange options `200`, ровно 8
  routes; quote `201`, status `PRELIMINARY`, quote ID
  `1c8fa1d8-7601-4a7c-b42f-c0ec36b19399`; logout `200`; request delta `0`.
- Public DEC-015 smoke: page `200`, compact CTA «Войти»; `/account/` → `307`
  в authorized zone; public functional calculator/API отсутствуют.
- Tests: backend targeted `19/19 PASS`; full backend `66 PASS`, `5 skipped`,
  одна infra-only local PostgreSQL failure; production DB health → `200`.
  Astro build/contracts `17/17 PASS`, browser `15/15 PASS`; React
  unit/build/browser `6/10/6 PASS`.
- Visual evidence set: desktop public CTA, mobile public CTA и authenticated
  quote UI screenshots. Exact screenshot paths не были переданы в packet.
- Production roots: Astro
  `/var/www/safr/releases/3d2176c/astro-site`; React остаётся verified
  `/var/www/safr/releases/be2bdf2/react-app`. Nginx/Cloudflare/DNS config и
  secrets `NOT_CHANGED`; bot не перезапускался; temporary deploy files удалены.
- Closure gates: public desktop/mobile CTA evidence `PASS`; authenticated Mini
  App calculator `PASS`; documentation closure SHA
  `f579c3316eaa8a3143426a35281bd735237f2595`.

### Deferred backlog — BALI-TASK-024

- Goal: спроектировать и реализовать public calculator после prerequisites.
- Owner: CPO Bali.
- Status: `IDEA / BLOCKED_BY_DEPENDENCIES`; в исполнение сейчас не выдаётся.
- Разрешение: только документирование backlog item.
- Dependencies: `design sprint = CLOSED`; `visas redesign = COMPLETED`.
- Evidence: прямое решение Founder `BALI-DEC-20260801-014`.
- Blocker: обе зависимости должны быть подтверждены.
- Next step: после evidence обеих зависимостей CPO готовит brief; затем задача
  проходит обычную approval chain.

### Limitations

- Authenticated production quote smoke выполнен; exchange request/customer
  transaction не создавались (`request delta = 0`).
- `IMG_9745.PNG–IMG_9760.PNG` оставались недоступны; использованы approved
  master prompt и local visual QA.

### Visual evidence

Base:
`/Users/safr.nikita/.codex/visualizations/2026/07/30/019fb1d7-7ca0-7451-bbf6-2b1b0df03304/BALI-TASK-020`.

- `astro/website-home.png`
- `astro/website-country-grid.png`
- `astro/visa-page-top.png`
- `astro/visa-page-content.png`
- `astro/visa-page-bottom-cta.png`
- `react/miniapp-home.png`
- `react/miniapp-bali-services.png`
- `react/calculator-wheel.png`
- `react/calculator-live-quote.png`
- `react/miniapp-profile.png`

## BALI-TASK-025 — React UI release evidence

Дата фиксации: 2026-08-05. Evidence source: BALI-TASK-026 packet через
Assistant Bali `019fb1d7-a598-72e0-af9d-18baa5a267df` и local Git refs.

### Identity and deployment state

- Task status: `RELEASE_SUCCESS / DEPLOYED`.
- Approval references: `BALI-DEC-20260805-008`, `-009`, `-010` — `APPROVED`.
- Branch: `codex/safrway-stabilization`.
- Commit/pushed/deployed SHA:
  `142c3ea112e0d61d88eef81b93779bca3e648e72`; commit
  `feat: refresh authenticated Mini App UI`.
- Local HEAD и `origin/codex/safrway-stabilization` совпадают с release SHA;
  worktree до documentation patch: `CLEAN`.
- Active React root: `/var/www/safr/releases/142c3ea/react-app`; retained
  rollback root: `/var/www/safr/releases/be2bdf2/react-app`.
- Version: `VERSION_UNASSIGNED`.
- Documentation SHA for BALI-TASK-026/032:
  `18a35904b2e17f5df495a6c266909ca6a9a4299e`; BALI-TASK-034/041/046
  documentation SHA: `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current
  BALI-TASK-053 patch: `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`,
  `NOT_PUSHED`.

### Exact build and artifact evidence

- TypeScript: `PASS`; Vite build: `PASS`, 40 modules.
- Exact assets: JS `main-C3WC62h3.js`; CSS `main-D8IUY7Aq.css`.
- Artifact contracts/secret scan: `11/11 PASS`.
- Clean archive: 14 files; AppleDouble, symlinks и xattr entries отсутствуют.
- Archive size: 2,334,618 bytes; SHA-256
  `f930aad41be4efa98d7cb6c3b213aba1f70ea322f9ac328225b283891c15d302`;
  local/remote hashes совпали.

### Production smoke evidence

- `https://app.safrway.online/` и `/account/` → `200`.
- Exact JS/CSS и пять hero assets → `200`.
- New Home/calculator/SPB/visa strings и WCAG color `#b84f39` подтверждены в
  production.
- API health → `200`; unauthenticated `/mini-app/me` и
  `/mini-app/exchange/options` корректно → `401`.
- Public site → `200`; checked services active.

### Scope boundary and limitation

- Nginx reload/restart не выполнялся.
- Backend/API/DB/migrations, Astro/public calculator, Cloudflare/DNS/Nginx
  config, services и secrets: `NOT_CHANGED`.
- Real authenticated Telegram production quote/request не выполнялся из-за
  DB-write/secret exclusion. Coverage: prior local Playwright `10/10` и
  Designer-approved 40-shot matrix.

## BALI-TASK-027/028/029/030 — release completion evidence

Дата фиксации: 2026-08-07. Evidence source: BALI-TASK-032 packet через
Assistant Bali `019fb1d7-a598-72e0-af9d-18baa5a267df`.

### Identity and release state

- Release completion: `CONFIRMED`; final code state: `PUSHED`, `DEPLOYED`.
- Approval gates: `BALI-DEC-20260807-001` local implementation и
  `BALI-DEC-20260807-002` commit/push/deploy — `APPROVED`.
- Baseline/rollback code SHA:
  `572269fcf1c9e6d3feb8fbd93394e05363b3c658`.
- Main UI commit: `4e1c2f2af64b3082364007682c96ec7c8513b09b`.
- Designer-PASS corrective и final pushed/deployed SHA:
  `c6c8c530e7e91d49f982e72aef53ca04300ca11d`.
- Version: `VERSION_UNASSIGNED`; BALI-TASK-026/032 documentation SHA:
  `18a35904b2e17f5df495a6c266909ca6a9a4299e`; BALI-TASK-034/041/046
  documentation SHA: `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current
  BALI-TASK-053 patch: `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`,
  `NOT_PUSHED`.

### Verification and production evidence

- Astro tests: `PASS`; React tests: `PASS`; Designer rapid review: `PASS`.
- Active immutable roots: `/var/www/safr/releases/c6c8c53/astro-site` и
  `/var/www/safr/releases/c6c8c53/react-app`.
- Retained rollback roots: `/var/www/safr/releases/572269f/astro-site` и
  `/var/www/safr/releases/572269f/react-app`.
- Production smoke: `PASS` для public Home, Visas и visa detail, а также Mini
  App, account и release assets; exact live asset hashes совпали с ожидаемыми.
- Content acceptance: видны четыре страны и шесть реальных виз; D5, UAE и
  fake data отсутствуют; eVOA не изменена — `800,000 IDR / $50`; остальные
  отображаемые цены соответствуют current approved source of truth.

### Scope boundary, limitation and governance incident

- Backend/API/DB/migrations, Nginx, Cloudflare/DNS и secrets: `NOT_CHANGED`.
- Authenticated Telegram/customer/transaction production write smoke не
  выполнялся; это остаётся явным ограничением release evidence.
- `BALI-TASK-031` governance incident: разрешение было только local-only, но
  scope был превышен commit/push/deploy SHA
  `572269fcf1c9e6d3feb8fbd93394e05363b3c658`. Ретроактивное approval не
  подразумевается. Последующие releases вернули явные approval gates через
  Assistant Bali до release actions.

## BALI-TASK-033 — frontend navigation hotfix evidence

Дата фиксации: 2026-08-08. Evidence source: BALI-TASK-034 packet через
Assistant Bali `019fb1d7-a598-72e0-af9d-18baa5a267df`.

### Identity and release state

- Approval: `BALI-DEC-20260808-001` — `APPROVED` scoped hotfix release.
- Code state: `TESTED`, `PUSHED`, `DEPLOYED`; commit/pushed/deployed SHA:
  `7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`.
- Astro tests, React tests и exact-SHA builds: `PASS`.
- Active roots: `/var/www/safr/releases/7c0374a/astro-site` и
  `/var/www/safr/releases/7c0374a/react-app`.
- Retained rollback roots: `/var/www/safr/releases/c6c8c53/astro-site` и
  `/var/www/safr/releases/c6c8c53/react-app`.
- Version: `VERSION_UNASSIGNED`; BALI-TASK-034/041/046 documentation SHA:
  `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current BALI-TASK-053 patch:
  `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

### Production verification

- Public click smoke `PASS` at `1440×810` and `390×844` for `/bali/`,
  `/thailand/`, `/russia/` and `/nepal/`.
- Mini App fixture smoke `PASS` for all four country routes. Thailand shows
  `4/4` expected `soon` items; Nepal shows `6/6` expected `soon` items and the
  manager CTA.
- Content Security Policy console errors: `0`.

### Scope boundary and limitation

- Production API/customer writes: `NONE`.
- Backend/API/DB/data/design, Nginx, Cloudflare/DNS и secrets: `NOT_CHANGED`.
- Evidence подтверждает navigation/display smoke, но не authenticated
  Telegram/customer/transaction production-write flow.

## BALI-TASK-035/036/037/038 — sprint and release completion evidence

Дата фиксации: 2026-08-08. Evidence source: BALI-TASK-041 reconciliation packet
через Assistant Bali `019fb1d7-a598-72e0-af9d-18baa5a267df`; source lineage:
BALI-TASK-035 CPO IA, BALI-TASK-036 Designer package, BALI-TASK-037 tech map,
BALI-TASK-038 implementation/release.

### Identity and activation history

- Sprint/release status: `COMPLETED`, final state `PUSHED`, `DEPLOYED`.
- Approval references: `BALI-DEC-20260808-002` through `-007` — `APPROVED`;
  individual payloads were not supplied in this evidence packet.
- Commit chain:
  `fb4638e7c017b01ff628e7444f9032d503509f71` →
  `3e34a443644e4e460d1dc244192e9f51165f1b10` →
  `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`.
- Final local SHA = remote SHA = deployed SHA:
  `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`.
- First activation `fb4638e7…` was safely rolled back due stale CDN root JS.
- Second activation `3e34a44…` was safely rolled back due CSP inline style.
- Final `5ebb51d…` resolves both observed activation defects.
- Version: `VERSION_UNASSIGNED`; BALI-TASK-034/041/046 documentation SHA:
  `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current BALI-TASK-053 patch:
  `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

### Deploy, rollback and Nginx evidence

- Active roots: `/var/www/safr/releases/5ebb51d/astro-site` and
  `/var/www/safr/releases/5ebb51d/react-app`.
- Retained rollback roots: `/var/www/safr/releases/7c0374a/astro-site` and
  `/var/www/safr/releases/7c0374a/react-app`.
- Nginx backup:
  `/var/backups/safr-bali/20260808T1644Z-pre-5ebb51d/safr-web`.
- Nginx diff is limited to approved root `/catalog[/]` and `/directions[/]`
  redirects; nested intent is preserved. `nginx -t`: `PASS`.
- Cloudflare was neither changed nor purged.

### Verification evidence

- Cache fingerprinting and CSP: `PASS`.
- Live HTML: 44 documents, zero inline style; route/canonical matrix:
  `44/44 PASS`; redirects are one-hop.
- Desktop/mobile public smoke and React fixture smoke: `PASS`; Thailand context:
  `PASS`; API/DB health: `PASS`; services: `ACTIVE`.
- Astro: `22/22 PASS`, `59/59 PASS`, 200 screenshot checks.
- React: unit `11/11 PASS`; build `11/11 PASS`.
- Exact artifact/tree hashes were verified in the CTO packet; their values are
  not duplicated because the BALI-TASK-041 packet does not include them.

### Scope boundary and limitation

- Backend/API/DB/migrations, Cloudflare/DNS and secrets: `NOT_CHANGED`.
- Customer production writes: `NONE`.
- Protected documentation and artifacts were excluded from all code commits.

## BALI-TASK-042/043/044/045 — audit-to-release sprint closure

Дата фиксации: 2026-08-08. Evidence: CTO final packet, CPO and Designer
handoffs, coordinated through Assistant Bali.

### Audit and contract outcomes

- `BALI-TASK-042` read-only audit: referral/Points/admin production readiness
  `FAIL`; availability and most user navigation `PASS`. Exact findings included
  users `19`, invited-by relations `18` and referral rows `12` (six missing
  rows), reward accrual without completion/effective-date gates, absent
  reversal, four dead admin controls and partial non-actor-bound admin APIs.
  Production orders and Points ledger were both `0`, so no existing monetary
  anomaly was observed.
- Audit test baseline: backend `67 PASS / 5 SKIP`; bot `48 PASS / 1` stale
  assertion failure. No audit fix or production write occurred.
- `BALI-TASK-043`: `CPO_PASS / COMPLETED`. Binding contract: configured unique
  root identity; default-root attribution is distinct/non-rewarded; immutable
  `users.created_at`; manual paid-gated complete/cancel; atomic append-only
  reversal; four Telegram admin jobs; secure web admin; bulk messaging excluded.
- `BALI-TASK-045`: `DESIGN PACKAGE PASS`; deterministic artifact validation
  `PASS` (39,351 bytes, all nine navigation targets resolved). Artifact:
  `/Users/safr.nikita/.codex/visualizations/2026/08/05/019fd13d-2290-7f90-8c7d-562f13eadc01/bali-task-045-admin-mvp.html`.
  Browser-control capture was unavailable at design gate; this remained a
  non-blocking local limitation and is not represented as production evidence.
- `BALI-TASK-044`: local implementation, migration/reconciliation and final
  release completed. Approval chain: `BALI-DEC-20260808-008` through `-017`.

### Identity, DB and migration evidence

- Main scoped commit: `45b3a5293ae9c73cefe2905bb6973f64c3e32855`.
- Corrective/final local = remote = deployed SHA:
  `91df0177774d28cca19b57875a5c31f9725c4d8c`; independent remote ref matched.
- DB backup:
  `/var/backups/safr-bali/20260808T134738Z-pre-45b3a52/database.dump`; SHA-256
  `1560dd45ec4c4825d2cd16bc9c79493d9175740333b94a59d9f9263d9de61190`;
  original preserved.
- Isolated restore, application-role ownership, schema/index/count preservation
  and `upgrade → downgrade → upgrade`: `PASS`.
- Migration `f2b6d9a4c731`: `APPLIED_PRODUCTION`; current production head
  `f2b6d9a4c731`.
- Immutable reconciliation transaction `PASS`: legacy referral rows `12`
  preserved; referrals `12 → 18`; unassigned non-root users `0`; exactly one
  configured root is active with `role=admin`; promotion audit idempotency row
  `1`; isolated second replay planned `0` actions.
- Disposable DB and postgres-readable temporary dump were removed after `PASS`.

### Artifact, deploy and smoke evidence

- React exact-SHA build `PASS`: 23 files, zero symlinks/AppleDouble/xattrs;
  archive SHA-256
  `092430c465b9bb524774850411953130a1b5bfdbe9b40baf0dcc3f83567e8216`;
  installed tree hash
  `384104b853df741beea5f182167848eaea9568b7a187c5ed25078ad7adef281b`.
- Active React root: `/var/www/safr/releases/91df017/react-app`; Astro remained
  `/var/www/safr/releases/5ebb51d/astro-site`.
- Nginx changed only approved `/admin` locations; `nginx -t PASS`; minimal
  reload; final config SHA-256
  `939f5eb285105d9405dea3b74a2a5dc45abfe1887eddf05d58150858aaf35dad`.
- Backend and bot alone were restarted; bounded readiness `PASS` within 4s;
  backend, bot and Nginx active.
- `/admin/`, `/admin/orders/`, `/admin/queues/visa/`,
  `/admin/queues/housing/`, `/admin/settings/` → `200`; `/admin` → `307`.
- Unauthenticated admin session boundary `401`; OpenAPI admin contracts `9/9
  PASS`; exact deployed-code root dashboard/session RBAC `PASS`; client denial
  `403`; valid/invalid CSRF `PASS` using dependency-injected no-write smoke.
- Four Telegram admin-link fixture tests `4/4 PASS`; bot polling/outbox healthy;
  public site/API/DB health `200`; CSP header `PASS`.

### Rollback, exclusions and documentation state

- Rollback code checkout: `572269fcf1c9e6d3feb8fbd93394e05363b3c658`;
  React root: `/var/www/safr/releases/5ebb51d/react-app`; Nginx backup:
  `/var/backups/safr-bali/20260808T154413Z-reactivation-91df017/safr-web`; DB
  rollback source is the checksum-verified backup above.
- Production DB reconciliation/promotion was not re-applied during activation
  retries after its successful transaction.
- No real OIDC session, customer/admin transaction write, Telegram/customer
  message or bulk message was created/sent by smoke.
- Protected docs/artifacts, unrelated public UI, Cloudflare/DNS and secrets
  remained excluded from code releases.
- Version: `VERSION_UNASSIGNED`; BALI-TASK-034/041/046 documentation SHA:
  `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current BALI-TASK-053 patch:
  `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

## BALI-TASK-049/050/051 — RU/EN language release closure

Дата фиксации: 2026-08-10. Evidence: CTO BALI-TASK-051 post-release packet,
переданный через Assistant Bali.

### Identity and scope

- Status: `BALI-TASK-051 = RELEASE_SUCCESS`; version:
  `VERSION_UNASSIGNED`.
- Branch: `codex/safrway-stabilization`; final local = remote = pushed =
  deployed code SHA:
  `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`.
- Scoped code commit: 85 approved implementation, test, i18n and migration
  files. Four protected canonical docs were excluded; only pre-existing
  untracked artifacts remained locally.
- Typed RU/EN source corpus resides in
  `06 Development/shared/src/i18n/{types,public,bot,mini-app}.ts`; generated
  runtime snapshots are build outputs, not hand-edited sources. Translation
  does not independently re-verify dated visa or privacy facts.

### Database and migration evidence

- Production backup:
  `/var/backups/safr-bali/20260810T151528Z-pre-22bab5d/database.dump`; SHA-256
  `4b22888adbc8aeedba24b0cf0bcde49ef574b05e27a5086f65eb605c9b938b67`.
- Isolated restore and migration `b8d2e4f6a710` upgrade → downgrade → upgrade:
  `PASS`; restored users `19`; unaffected normalized data hash matched.
- Migration `b8d2e4f6a710`: `APPLIED_PRODUCTION`; current production head
  `b8d2e4f6a710`. Locale backfill: `en=1`, `ru=18`, `null=0`, `mismatch=0`;
  supported-locale check constraint is present.

### Artifacts, deploy and smoke evidence

- Astro: 106 files; archive SHA-256
  `042cece0324bfea53b7346b7cffc4bd4fc21e208fa56cae0a44817cfe8135f35`;
  installed tree hash
  `473655bebbd7f5da0182465a0368062e7d017b940557a02f69677db4b694444d`.
- React: 23 files; archive SHA-256
  `a0c04c87da01c711e14634a74ea5eb161c7182cb12b38b8a125cad4c0cfc49dd`;
  installed tree hash
  `c74228680984604045ed6b265beb9dc370d33b4f36c2244821d78b739969b1d0`.
- Backend/bot source archive SHA-256:
  `dde5382a70b1e39469dd89a4323001ca4f6e4c5b8d0d048b81ec1b3d16412b40`.
- Active roots: `/var/www/safr/releases/22bab5d/astro-site` and
  `/var/www/safr/releases/22bab5d/react-app`; backend, bot and Nginx active.
  Nginx was unchanged; verified config SHA-256
  `939f5eb285105d9405dea3b74a2a5dc45abfe1887eddf05d58150858aaf35dad`.
- Origin page matrix: `88/88 PASS` (`44 RU + 44 EN`); canonical, hreflang
  `ru/en/x-default`, localized metadata, Open Graph and JSON-LD: `PASS`.
  Sitemap `72` indexable and noindex `16`: `PASS`.
- Representative external RU/EN, visa, Thailand, app and API requests returned
  `200`. Desktop `1440` and mobile `390` locale prompt, no forced redirect,
  manual switch and country interaction: `PASS`.
- Auth-safe fixture Mini App locale sync and EN calculator: `PASS`, with real
  writes intercepted. Backend locale `3/3`; bot locale/legacy/dashboard/
  sensitive dispatch `7/7`; polling healthy; unauthenticated Mini App
  endpoints correctly returned `401`.

### Rollback, exclusions and documentation state

- Rollback: code `91df0177774d28cca19b57875a5c31f9725c4d8c`; Astro
  `/var/www/safr/releases/5ebb51d/astro-site`; React
  `/var/www/safr/releases/91df017/react-app`; database backup/checksum above;
  migration downgrade target `f2b6d9a4c731`.
- No customer transaction/message, bulk message, secret, Cloudflare/DNS or
  unrelated-scope change occurred.
- BALI-TASK-034/041/046 documentation SHA:
  `6e84a5da11afea4b645d8d6af74497046ecb47ce`. Current BALI-TASK-053 patch:
  `WORKTREE_UNCOMMITTED`, documentation SHA `UNASSIGNED`, `NOT_PUSHED`.

## BALI-TASK-070/071 — current production closure

Дата reconciliation: 2026-08-31. Эти факты заменяют только понятие текущего
production state; исторические checkpoints выше сохраняются без переписывания.

### BALI-TASK-070

- Status: `RELEASE_SUCCESS`; final pushed/deployed code SHA:
  `42e924bf06f4fbb3637e1771fdd8c66fad5a1565`.
- Production schema head: `c6a4e8b2d915` after additive reversible chain
  `a3 → b4 → c5 → c6`; PostgreSQL migration/backfill/U-D-U and safety
  regressions `PASS`.
- Delivered scope: archive/query parity, exact tombstoned VisaCase delete,
  staff grants and generation-bound assignments, structured contact reminders,
  frozen notification payloads, UNKNOWN/manual-review delivery safety,
  client dark surfaces and compact contextual visa cards.
- No routine production permanent delete, customer/staff notification, YouTube
  OAuth/mutation, pricing change, protected-storage enablement or secret change
  was used as smoke.

### BALI-TASK-071

- Status: `RELEASE_SUCCESS`; final pushed/deployed application SHA:
  `83e3bc3e54a953d41bd0e02053bbd879fc3213f5`.
- React immutable root:
  `/var/www/safr/releases/83e3bc3/react-app`; unchanged Astro root:
  `/var/www/safr/releases/42e924b/astro-site`; rollback application SHA/root:
  `42e924bf06f4fbb3637e1771fdd8c66fad5a1565` and
  `/var/www/safr/releases/42e924b/react-app`.
- Backend `118/118` with `11` expected skips; React unit `19/19`, contracts
  `38/38`, production build, dark/readability and user-filter browser evidence
  `PASS`; Astro 93 pages, 25 contracts, browser/WCAG `109 PASS` with `4`
  expected skips.
- Production checkout/root/assets, backend/DB health, Admin/Mini App unauth
  boundaries and backend/bot/nginx service state `PASS`; recent error-level
  journals were empty.
- BALI-TASK-071 has `NO_MIGRATION / NO_DATA_WRITE / NO_CUSTOMER_MESSAGE`.
- Sanitized AUDIT reconciliation was pushed separately as docs-only SHA
  `53481e6e0511a440160ea4e8fc5b898ea21be8c4`; production correctly remained
  on application SHA `83e3bc3…`.

## Связанные источники истины

- Product requirements: `/Users/safr.nikita/Downloads/SAFRWAY_CODEX_UI_CALCULATOR_MASTER_PROMPT.md`.
- Calculator/API contract: `06 Development/docs/API Spec.md`.
- Architecture and source-of-truth matrix:
  `06 Development/docs/Target Architecture v1.md`.
- Deployed code/migration/artifact/service/smoke evidence BALI-TASK-020 и
  post-release incident BALI-TASK-023: checkpoint в этом файле.
- `Project Snapshot.md` и `06 Development/docs/MVP Task List.md` не входили в
  эту четырёхфайловую reconciliation и не являются evidence candidate release.
- Version остаётся `VERSION_UNASSIGNED`. BALI-TASK-020/021/023 documentation
  SHA: `f579c3316eaa8a3143426a35281bd735237f2595`; BALI-TASK-026/032 documentation
  SHA: `18a35904b2e17f5df495a6c266909ca6a9a4299e`; BALI-TASK-034/041/046
  documentation SHA: `6e84a5da11afea4b645d8d6af74497046ecb47ce`; current
  BALI-TASK-053 documentation SHA остаётся `UNASSIGNED` до отдельного
  согласованного docs commit/push.
- `BALI-TASK-023` fix evidence и documentation closure подтверждены SHA
  `f579c3316eaa8a3143426a35281bd735237f2595`.
- `BALI-TASK-024` остаётся `IDEA / BLOCKED_BY_DEPENDENCIES`; execution не
  разрешён.
- BALI-TASK-025 release evidence: отдельный checkpoint выше; code SHA
  `142c3ea112e0d61d88eef81b93779bca3e648e72`.
- BALI-TASK-027/028/029/030 release evidence: отдельный checkpoint выше; final
  deployed SHA `c6c8c530e7e91d49f982e72aef53ca04300ca11d`.
- BALI-TASK-033 navigation hotfix evidence: отдельный checkpoint выше; final
  deployed SHA `7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`.
- BALI-TASK-035/036/037/038 sprint/release evidence: отдельный checkpoint выше;
  final deployed SHA `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`.
- BALI-TASK-042/043/044/045 sprint closure: отдельный checkpoint выше; final
  deployed SHA `91df0177774d28cca19b57875a5c31f9725c4d8c`.
- BALI-TASK-049/050/051 language release closure: отдельный checkpoint
  выше; final deployed SHA `22bab5d2c2aa8009ed958019a8e7ac0d56533a0b`;
  production migration head `b8d2e4f6a710`.
