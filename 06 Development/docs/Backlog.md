# SAFRWAY / Bali — Canonical Backlog

Актуализировано: 2026-08-31.

Этот файл — единый индекс незавершённой работы. Он не является разрешением на
реализацию, Git или production. `Decision Ledger.md` хранит решения Founder,
`AUDIT/CURRENT_STATE.md` — подтверждённый deployed state, а старые Roadmap,
MVP Task List, Bugs Backlog и Next Sprint Brief остаются историческими
источниками требований.

## Статусы

- `CANDIDATE` — возможный следующий спринт; требуется выбор Founder.
- `APPROVED_NEXT` — scope и release authority выданы, но write-heavy реализация ждёт указанную safe boundary/review.
- `BLOCKED_BY_FOUNDER_INPUT` — направление известно, но отсутствует материальное решение или безопасный доступ.
- `BLOCKED_BY_OPERATIONS` — продуктовый контракт известен, но не пройдены эксплуатационные security-гейты.
- `EVIDENCE_ONLY` — проверка или аудит без продуктовой реализации.
- `CLOSED` — выполнено и подтверждено; подробности находятся в release evidence.

## Последние закрытые работы

| ID | Статус | Результат |
| --- | --- | --- |
| `BALI-TASK-070` | `CLOSED / DEPLOYED` | Visa Archive, безопасное удаление, staff grants и multi-assignment, contact reminders, notification safety, client dark surfaces и локальный guarded YouTube tooling. Code `42e924b…`, schema `c6a4e8b2d915`. |
| `BALI-TASK-071` | `CLOSED / DEPLOYED` | Исправление первого запроса после idle-сессии, серверные user filters/sorts, безопасные Telegram links, компактные карточки, active navigation и readability regression. Code `83e3bc3…`, schema без изменений. |
| `BALI-TASK-071-D` | `CLOSED / DEPLOYED` | Канонические документы, Runbook/backlog/AUDIT reconciled; duplicate Admin Users structure удалена; React routes split ниже 500 KB. Code/React `1f574ef…`, schema/Astro без изменений. |

## Кандидаты следующего продуктового спринта

| ID | Статус | Ценность | Зависимости / Founder gate |
| --- | --- | --- | --- |
| `BALI-TASK-072 / PRICE-001` | `IMPLEMENTED_LOCAL / RELEASE_GATE` | Одна versioned цена и FX projection в bot, public site, Admin и Mini App; preview/publish/restore, immutable order/case snapshot и Indodax refresh. | Local parity, PostgreSQL backup/restore/U-D-U, `170` backend, `83` bot, shared/React gates PASS. Остались exact scoped Git, production backup/restore, migration/bootstrap, deploy и production parity evidence. |
| `YOUTUBE-001` | `BLOCKED_BY_FOUNDER_INPUT` | Детерминированная инвентаризация канала, reviewable playlist plan и тематические видео на страницах без runtime AI. | Локальный OAuth Founder, dry-run review и отдельное разрешение на playlist mutation/publication. Токены не передаются в чат/VPS/Git. |
| `DOCSTORE-001` | `BLOCKED_BY_OPERATIONS` | Реальная загрузка и авторизованное скачивание защищённых документов. | Production key custody, private root, scanner, retention, backup и restore-decrypt proof. До прохождения всех гейтов функция остаётся fail-closed. |
| `DESIGN-001` | `CANDIDATE` | Один современный visual/motion pilot с измеримой доступностью и производительностью перед широким redesign. | Founder brief, references/anti-references и выбор одной art direction; не начинать с product-wide переписывания компонентов. |
| `AVATAR-001` | `BLOCKED_BY_FOUNDER_INPUT` | Telegram avatars вместо initials fallback. | Политика consent, retention, refresh, proxy/storage и удаления. |
| `NATIVE-001` | `CANDIDATE` | Native packaging поверх общего Web/PWA/backend. | Отдельный приоритет, toolchain, OIDC/deep-link/cookie proof и store policy. `.app/.apk` сейчас не требуются. |
| `IMMIGRATION-001` | `CANDIDATE` | Автоматизированный tracking официальных заявок. | Legal/portal/API feasibility и отдельный security review; не смешивать с текущим VisaCase status. |

## Проверки и независимый аудит

| ID | Статус | Следующий безопасный шаг |
| --- | --- | --- |
| `AUDIT-001` | `EVIDENCE_ONLY` | Передать sanitized `AUDIT/` пакет ChatGPT Pro только по отдельной команде Founder; рекомендации триажировать, а не выполнять автоматически. |
| `DEVICE-001` | `EVIDENCE_ONLY` | При удобном реальном аккаунте повторить iOS/Android Telegram WebView smoke для Mini App launch/session без ослабления init-data validation и без тестовых customer writes. |

## Правила дедупликации

1. Новое сообщение Founder связывается с существующим ID, если меняет тот же результат; новый ID создаётся только для независимого результата.
2. Один backlog item не дублируется отдельно для bot/site/Admin/Mini App, если Founder установил cross-surface invariant.
3. Исторические `todo` в старых документах не открывают работу автоматически.
4. Закрытие требует evidence и точного release state; наличие кода или текста само по себе не означает deployment.
5. Идентификаторы клиентов, сотрудников, секреты, production paths и raw evidence в backlog не записываются.
