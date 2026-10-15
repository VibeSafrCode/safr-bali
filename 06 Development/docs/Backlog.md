# SAFRWAY / Bali — Canonical Backlog

## Текущий спринт и остатки 14 октября 2026

Сайт SAFRWAY на 10 языках опубликован: 1070 публичных страниц, версия `f96845f`.
Yoga-бот, собственный кабинет, непрозрачные реферальные коды и Mini App работают
на общем ядре. Дизайн Yoga Mini App восстановлен и подтверждён Founder.
Версии и границы приёмки — в [Current State](../../AUDIT/CURRENT_STATE.md).

Сейчас синхронизируются проектные документы и Git-ветка с уже выпущенным кодом.
Это не разрешение на произвольную операцию с клиентскими документами, визовой
подачей или защищённым хранилищем и не новый production rollout.

### GIT-CI-PUBLIC-FIXTURE-20261015

Статус: `LOCAL_FIX / EXACT_SHA_CI_REQUIRED`. Красный frontend run38671050083
на7d72259 не закрывается одной записью о долге. Исторические тестовые данные
восстановлены из уже публичного Registry; closed originals не добавлены в Git.
Explicit public derivative CI и обязательный strict240 release gate разделены
без второго renderer. Старые output fixtures сверены с1070-route Owner grant,
исправлена упаковка Main, точные asset исключения рассмотрены отдельно.

Следующий gate — successful workflow на точном successor commit. Локальные
проверки не являются Linux CI или production proof. Границы и negative guards:
[public CI contract](../../AUDIT/PUBLIC_CI_CONTRACT_2026-10-15.md).

### YOGA-WEB-BRANDING-20261014

Статус: `NEXT_SPRINT / NOT_PUBLISHED` по уточнению Founder «Запиши на след
спринт. Сейчас займитесь документами».

- Использовать готовые правки ВайбДиза: убрать тексты о SAFRWAY с Yoga, оставить
  некликабельный логотип SAFRWAY; добавить `AI Creative Agency NИИK` внизу обоих сайтов.
- Не менять авторизацию, рефералку, ботов, БД и уже принятый дизайн Mini App.
- Сохранить юридическую идентичность и условия; косметическая очистка не подменяет
  юридическое лицо. До выпуска нужны новый точный artifact, затронутая визуальная
  проверка и сверка фактически отданных HTML/CSS.

### Другие незавершённые результаты

- Полный influencer-кабинет с серверной изоляцией ветки; повышенные проценты
  требуют заданных ставок и не включены в текущие выплаты.
- Недостающие страницы и CTA SAFRWAY, глобальное подключение Client10/F01,
  расширенная приёмка реальных Telegram WebView и английского кабинета.
- Protected document storage остаётся fail-closed до проверки ключей, сканера,
  хранения, срока удаления и восстановления с расшифровкой.
- Search Console и фактическое попадание в поиск проверяются отдельно от открытых
  robots, sitemap, canonical и hreflang.

## Исторический реестр до текущего спринта

Актуальный слой: 2026-10-11. Исторический реестр сентября сохранён ниже;
его PENDING/NOT_STARTED не означают, что поздние выпуски нужно повторять.

## Последние подтверждённые выпуски и остатки

C1/eVOA/E33G, D1/D2, D12/E28A и связанные Knowledge уже выпущены;
публичный Astro — `67e2939`, Mini App/кабинеты/Admin — `36fe5f9`.
Свежий HTTPS version read-back 11 октября и точные receipts:
[`AUDIT/CURRENT_STATE.md`](../../AUDIT/CURRENT_STATE.md).
Backend/schema `67e2939` / `a1f9c3d7e620` подтверждены последними release
receipts, не новым SSH/DB-check. Счётчики виз, название кнопки `Mini App`
и одна разрешённая частная referral correction завершены 10 октября.
Прайсинг/Indodax/округление до ближайших $5, опубликованные тексты и
существующий country dropdown не являются задачами повторной реализации.

| Направление | Подтверждённое состояние | Оставшаяся работа |
| --- | --- | --- |
| Yoga Ganster static preview | Anonymous HTTPS на `https://62.133.61.231/yoga-preview/`; round6 + Yoga-only исключение обмена, source `030900a`, latest no-exchange receipt. Старый пароль снят; RU/EN страницы обновлены | Rendered/native-touch acceptance — NOT_RUN, постоянный домен не задан. Companion repository pin — исторический checkpoint, не доказательство последнего artifact. |
| Yoga Ganster live product/bot | Foundation/intake/migration code есть; live Yoga feature выключена, текущий сайт — static demo. Остановленная работа не возобновлена | Подтверждённый numeric Telegram ID получателя и `/start`; contact-enabled artifact, menu/visibility reconciliation, polling ownership, ACL/attribution/ledger/rollback и controlled smoke до отдельного включения. Не считать всё направление «не начатым» или уже live. |
| Клиентские интерфейсы на десяти языках | Article bodies/SEO для 37 identities есть на 10 языках; detection/switcher уже есть. Website chrome и bot menu остаются RU/EN | Подключить client-only дополнительные языки к меню/системным надписям и проверить RTL/CJK. Admin остаётся русскоязычным; визы/услуги не переводить повторно. |
| First-party analytics | Existing consent/GPC/DNT/allowlist pipeline и экран есть; enabled policy production в аудите 11 октября — UNKNOWN | Отдельно проверить privacy/consent activation, financial producers и retention job; Search Console credentials/actual indexing не подтверждены. Не создавать второй pipeline. |
| Защищённые документы | `FAIL_CLOSED` | Key custody/private storage/scanner/retention и restore-decrypt proof. |
| YouTube | Плеер и read-only metadata cache выпущены | OAuth channel/playlist management отдельно; ограничения и ротация API key не подтверждены. |
| Business | Шесть identities × 10 локалей, 60 payload; publication gates закрыты, public release не выполнялся | Исполнитель, approved quote/цены, применимость, semantic/legal/native QA; существующие URL сохранить до решения по конфликтам. Не создавать вторую бизнес-услугу ради новой страницы. |
| Documents | Registry и RU source draft существуют; полный предоставленный all-10-locale JSON ZIP отсутствует в доступных материалах | Получить оригинальный пакет, сверить RU revisions и полный JSON (SEO/facts/CTA/tables). Переводы не сочинять. Защищённое хранение клиентских документов — отдельная задача. |
| Family / Partners | Уже public noindex; это не пустые каркасы | Сохранить текущую публикацию; legal applicability семейных категорий и точные Partners payout terms требуют отдельных решений. |
| Country catalog / routing plan | Завершён read-only аудит: 94 Bali intents → 76 existing IDs + 2 unresolved; 9 world intents; 17 country entities. Optional plan — локальный незакоммиченный черновик | GPT review, semantic association validation, canonical/route ownership и section/country lead context до нового внедрения. Пять URL conflicts; никаких массовых pages/redirects. Audit docs опубликованы отдельно от candidate code. |
| Native/аватары/официальный tracking | Отложенные кандидаты | Отдельный Founder-selected scope и операционные/security gates. |

P2 последних выпусков: узкие AR320 таблицы, floating support edge, холодная
двухдокументная загрузка корня (historical performance 94) и статический EN
D12-extension SEO fallback до hydration цен. Business preview сохраняет одну
старую RU related-label в zh. Backup/restore proof не равен WAL/PITR или
восстановлению всего сервера/global roles. Rendered QA 10 октября пропущена
с разовым waiver; это не waiver будущего каталога.

Актуальная матрица маршрутов, сохранности и следующий минимальный scope:
[`AUDIT/COUNTRY_CATALOG_2026-10-11/START_HERE_RU.md`](../../AUDIT/COUNTRY_CATALOG_2026-10-11/START_HERE_RU.md).
Авторизация push/deploy 11 октября записана отдельно от готовности кандидатов:
[`Decision Ledger.md`](Decision%20Ledger.md). Текущая синхронизация не запускает
остановленные SEC-NEXT/native/Admin-date/Yoga product scopes.

CI evidence debt: run для старого docs baseline3659 упал на одном browser
test `react-app/tests/browser/task070-admin-staff-notifications.spec.ts`;
bot/backend/reference jobs прошли. Source-preserving docs push не устраняет
или объясняет этот FAIL. Проверять новый exact-SHA run отдельно; прежний
release36fe CI SUCCESS не переносить на следующую версию автоматически.

## Исторический реестр сентября

Этот файл — единый индекс незавершённой работы. Он не является разрешением на
реализацию, Git или production. `Decision Ledger.md` хранит решения Founder,
`AUDIT/CURRENT_STATE.md` — подтверждённый deployed state, а старые Roadmap,
MVP Task List, Bugs Backlog и Next Sprint Brief остаются историческими
источниками требований.

## Активный аудит — один реестр без дублирования по поверхностям

Четыре Founder-approved local этапа и A01–A18 находятся в
`AUDIT/POST_AUDIT_EXECUTION.md`. `BALI-AUDIT-20260905-E1` — reliability/CI и
release-blocking debt, `READY_LOCAL / RELEASE_GATES_OPEN`, local commit `998595a`.
E2 SEO — `READY_LOCAL / RELEASE_GATES_OPEN`; результаты в `AUDIT/E2_EXECUTION.md`.
E3 performance и E4 account UX — `NOT_STARTED`. Отдельный commit/PR/release каждого этапа
позволяет заморозить оставшееся; наличие записи не открывает release authority.

Локальные candidate gates пройдены. Остатки E1 до выпуска: exact-SHA Linux CI,
совместимость Points integration consumers, Cloudflare/tunnel trust preflight,
согласованный release/rollback и smoke. Подробные результаты обновляются только
в evidence register; не считать старые CLOSED задачи доказательством E1 release.

P2 residual: bundled Wrangler legacy dependency. P1 architecture debt: shared
service scopes и legacy admin-token actor attribution требуют технического сужения и
consumer migration, не расширения прав. Protected-file activation и экономика
рефералов остаются отдельными решениями с прежними fail-closed gates.

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
| `BALI-TASK-072 / PRICE-001` | `COMPLETE / DEPLOYED` | Одна versioned цена и FX projection в bot, public site, Admin и Mini App; preview/publish/restore, immutable order/case snapshot и Indodax refresh. | Production `97b13ad…`, artifacts `fe5cf2c…`, schema `d7a2f9c4e816`; backup/restore/U-D-U, active FX timer, enforcement and four-surface parity PASS. |
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
