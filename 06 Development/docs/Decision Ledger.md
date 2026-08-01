# SAFRWAY Bali — Decision Ledger

Актуализировано: 2026-08-01.

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
- Post-release documentation SHA: `UNASSIGNED`; текущий четырёхфайловый docs
  patch: `WORKTREE_UNCOMMITTED`, `NOT_PUSHED` и не входит в deployed code SHA.
- Nginx/Cloudflare/DNS config и secrets: `NOT_CHANGED`; bot не перезапускался;
  temporary deploy files удалены.
- `BALI-TASK-023`: `FIX_VERIFIED`; documentation gate:
  `READY_FOR_FINAL_DOCS_COMMIT`.

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
  App calculator `PASS`. Status: `READY_FOR_FINAL_DOCS_COMMIT`.

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

## Связанные источники истины

- Product requirements: `/Users/safr.nikita/Downloads/SAFRWAY_CODEX_UI_CALCULATOR_MASTER_PROMPT.md`.
- Calculator/API contract: `06 Development/docs/API Spec.md`.
- Architecture and source-of-truth matrix:
  `06 Development/docs/Target Architecture v1.md`.
- Deployed code/migration/artifact/service/smoke evidence BALI-TASK-020 и
  post-release incident BALI-TASK-023: checkpoint в этом файле.
- `Project Snapshot.md` и `06 Development/docs/MVP Task List.md` не входили в
  эту четырёхфайловую reconciliation и не являются evidence candidate release.
- Version остаётся `VERSION_UNASSIGNED`. Post-release documentation SHA будет
  зафиксирован только после отдельного согласованного docs commit/push.
- `BALI-TASK-023` fix evidence подтверждён; documentation gate:
  `READY_FOR_FINAL_DOCS_COMMIT`. Post-release documentation SHA остаётся
  `UNASSIGNED` до согласованного commit/push.
- `BALI-TASK-024` остаётся `IDEA / BLOCKED_BY_DEPENDENCIES`; execution не
  разрешён.
