# SAFRWAY Bali — Decision Ledger

Актуализировано: 2026-08-01.

Статус: канонический локальный реестр явно утверждённых решений SAFRWAY/Bali.
Владелец утверждения: Founder/CEO. Маршрут координации: Assistant Bali
`019fb1d7-a598-72e0-af9d-18baa5a267df`.

## Правила доказательности

- `APPROVED` подтверждает решение или разрешение, но не доказывает реализацию,
  тесты, push, migration apply, deploy или production state.
- Состояния фиксируются раздельно: `PLANNED`, `IMPLEMENTED_LOCAL`,
  `TESTED_LOCAL`, `PUSHED`, `DEPLOYED`, `PRODUCTION_SMOKE_PASSED`.
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
| `BALI-DEC-20260801-007` | `APPROVED` | Production migration gate | До production apply обязательны: точная successor revision; backup checksum; restore-proof на isolated DB; `upgrade → downgrade → upgrade`; heads before/after; rollback plan. При ошибке — stop/rollback без продолжения deploy; после apply — tests, service health и production smoke. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | `e8a1c4d7f920` создана как successor `d6f4a8b2c910`: `CREATED_NOT_APPLIED`. Backup/restore/rehearsal/apply/deploy не подтверждены. |
| `BALI-DEC-20260801-008` | `APPROVED` | Operating mode | Для BALI-TASK-020/021 действует постоянный экономный режим: текущий diff/evidence и релевантные SoT без повторной инвентаризации и дублей. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | Governance constraint active. |
| `BALI-DEC-20260801-009` | `APPROVED` | Resource exception | Повышенный расход разрешён только для backend/migration восьми маршрутов и финальной regression/deploy/smoke BALI-TASK-020. Документационная работа остаётся экономной. | Делегация Founder/CEO через Assistant Bali от 2026-08-01 | Не изменяет evidence и approval gates решений `002`/`007`. |

## BALI-TASK-020 — local evidence checkpoint

Дата фиксации: 2026-08-01. Evidence source: CTO Bali task
`019fb1d7-7ca0-7451-bbf6-2b1b0df03304`.

### Identity и release state

- Version: `VERSION_UNASSIGNED`.
- Branch: `codex/safrway-stabilization`.
- Baseline и rollback SHA:
  `445972a01372e304a8037dbc684ed2532d7928fe`.
- Implementation: `WORKTREE_UNCOMMITTED`, `IMPLEMENTED_LOCAL`,
  `TESTED_LOCAL`.
- `git diff --check`: `PASS`.
- Pushed SHA: `NONE`; deployed SHA: `NONE`.
- Push, deploy, restart, Alembic apply, production/DB writes,
  Cloudflare/DNS/Nginx и secret actions: `NOT_EXECUTED`.

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
- SHA-256:
  `cdd4110273676080c0fc46c1f26c90dc2e0d77288f6d79a752c61d4af9e2001c`.
- Read-only compile: `PASS`; local Alembic head: `e8a1c4d7f920`.
- Status: `CREATED_NOT_APPLIED`.
- Production backup checksum, restore rehearsal, isolated
  `upgrade → downgrade → upgrade`, production heads/schema-data checks,
  apply и post-apply smoke: `NOT_YET_EXECUTED`; `BALI-DEC-20260801-007`
  остаётся hard gate.

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

Входные `IMG_9745.PNG–IMG_9760.PNG` были недоступны; реализация основана на
утверждённом master prompt и локальном visual QA.

## Связанные источники истины

- Product requirements: `/Users/safr.nikita/Downloads/SAFRWAY_CODEX_UI_CALCULATOR_MASTER_PROMPT.md`.
- Calculator/API contract: `06 Development/docs/API Spec.md`.
- Architecture and source-of-truth matrix:
  `06 Development/docs/Target Architecture v1.md`.
- Local execution evidence BALI-TASK-020: checkpoint в этом файле.
- `Project Snapshot.md` и `06 Development/docs/MVP Task List.md` не входили в
  эту четырёхфайловую reconciliation и не являются evidence candidate release.
- После назначения версии/commit/deploy требуется отдельный release report;
  local checkpoint не доказывает operational success.
