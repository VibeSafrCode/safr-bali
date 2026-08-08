# SAFR Bali — Project Index

## Главные файлы проекта

1. README.md  
Главный паспорт проекта: что такое SAFR Bali / Na Bali Team, чем занимается проект, какие услуги есть, какие каналы и направления планируются.

2. 01 Project Core/Research/ЦА Бали.pdf  
Исследование целевой аудитории: сегменты, боли, триггеры, продуктовые пакеты, платформы и воронка.

3. 01 Project Core/Planning/SAFR_Bali_Roadmap.md  
Стратегическая дорожная карта экосистемы: Telegram Bot, Mini App, Website, SAFR Points, партнёры, исполнители, marketplace, TON и будущий токен.

4. 01 Project Core/Planning/SAFR_Bali_MVP.md  
План первого запуска: Telegram-first MVP, заявки, рефералы, SAFR Points, админка, QR-коды, баланс, правила начислений и порядок разработки.

5. 05 Bot/Bot Logic.md  
Логика Telegram-бота: первый вход пользователя, меню, услуги, передача вопросов владельцу, оплата и сценарии общения.

6. Project Snapshot.md

Текущий handoff: production-инфраструктура, последний Git commit, локальные
незадеплоенные изменения и ближайший безопасный шаг.

7. 06 Development/docs/MVP Task List.md

Актуальная таблица готовности MVP и технический backlog.

8. 06 Development/docs/Target Architecture v1.md

Каноническая целевая архитектура backend, Astro, React/Vite, PostgreSQL,
общих contracts и source-of-truth matrix. Файл
`06 Development/docs/Architecture.md` сохраняется как legacy/reference и не
является источником текущего статуса.

9. 06 Development/docs/Decision Ledger.md

Канонический реестр явно утверждённых решений и approval gates. Решение не
доказывает implementation, tests, push, migration apply или deploy. В этом же
файле хранится release evidence checkpoint BALI-TASK-020: baseline, tests,
backup/checksum, isolated restore/rehearsal/rollback, artifacts, deployed code
SHA, migration head, immutable roots, services и production smoke. Deployed
hotfix SHA `3d2176c27a7f27707e12f34aef3a99c5d8de64b3`; feature SHA
`be2bdf2dc77a62132d8fb4e23af5238d3d0248a1`;
documentation SHA `f579c3316eaa8a3143426a35281bd735237f2595`. P0 `BALI-TASK-023` имеет
статус `FIX_VERIFIED`: ownership root cause подтверждён, authenticated smoke и
public DEC-015 desktop/mobile CTA evidence `PASS`. Public functional
calculator/API/Nginx исключены. По `BALI-DEC-20260801-014` future public
calculator записан как `BALI-TASK-024` (`IDEA / BLOCKED_BY_DEPENDENCIES`, owner
CPO Bali), без разрешения на execution.
Там же находится BALI-TASK-025 React UI release checkpoint: status
`RELEASE_SUCCESS`, deployed SHA `142c3ea112e0d61d88eef81b93779bca3e648e72`,
active root `/var/www/safr/releases/142c3ea/react-app`, artifact checksum и
production smoke. BALI-TASK-027/028/029/030 release checkpoint: baseline
`572269fcf1c9e6d3feb8fbd93394e05363b3c658`, main UI commit
`4e1c2f2af64b3082364007682c96ec7c8513b09b`, final pushed/deployed SHA
`c6c8c530e7e91d49f982e72aef53ca04300ca11d`, Astro/React/Designer checks и
production smoke `PASS`. BALI-TASK-026/032 documentation SHA:
`18a35904b2e17f5df495a6c266909ca6a9a4299e`. BALI-TASK-033 navigation hotfix:
deployed SHA `7c0374a79ddf59fe517a5a9b8dc1692bd7bcb374`, Astro/React tests, exact-SHA
builds, public/Mini App navigation smoke и CSP check `PASS`; active roots
`/var/www/safr/releases/7c0374a/`, rollback `c6c8c53`. BALI-TASK-034 evidence
входит в combined BALI-TASK-034/041/046 documentation patch. BALI-TASK-035/
036/037/038 completed sprint checkpoint: commit chain `fb4638e7…` → `3e34a44…`
→ final local/remote/deployed `5ebb51d99d0d9e8c7a984db64a1feab2966555ef`;
active roots `/var/www/safr/releases/5ebb51d/`, rollback `7c0374a`, Nginx backup,
approved root redirects, tests and final smoke recorded. Current BALI-TASK-034/
041/046 documentation SHA — `UNASSIGNED`. BALI-TASK-042 audit findings and
BALI-TASK-043/044/045 outcomes are also recorded: main commit `45b3a529…`, final
local/remote/deployed SHA `91df0177774d28cca19b57875a5c31f9725c4d8c`, migration
head `f2b6d9a4c731`, referral reconciliation `12 → 18`, unique root admin and
admin/RBAC/CSRF/bot-link smoke `PASS`. Governance incident BALI-TASK-031 также
сохранён: local-only permission был превышен release actions SHA `572269f…`;
ретроактивное approval не подразумевается, последующие releases прошли через
явные Assistant gates.

10. 06 Development/docs/API Spec.md

Канонический API-контракт, включая calculator invariants и единственную
таблицу восьми exchange routes. Не смешивать её с web-route contract
`ecosystem-routes.v1.json`. Contract BALI-TASK-020 имеет code-статусы
`IMPLEMENTED_LOCAL`/`TESTED_LOCAL`/`PUSHED`/`DEPLOYED`; current production
migration head `f2b6d9a4c731`, while exchange revision `e8a1c4d7f920` remains
an applied ancestor and DB contains exactly eight active route codes. После
hotfix owners table/sequence исправлены на `safr_bali`; migration source не
применялся повторно. Authenticated calculator smoke и current public page
contract — compact message + CTA на canonical authenticated app/login route —
`PASS`; public functional API/Nginx запрещены.
Документ также фиксирует BALI-TASK-025 как React-only UI release: backend/API/
DB/migration contract не менялся; production limitation authenticated-write
smoke сохранён явно. Для BALI-TASK-027/028/029/030 зафиксирован frontend/content
release без изменений backend/API/DB/migrations: четыре страны, шесть реальных
виз, без D5/UAE/fake data; eVOA `800,000 IDR / $50`; остальные цены — из
current approved source of truth. BALI-TASK-033 меняет только frontend
navigation; calculator API и production DB state не изменены, API/customer
production writes не выполнялись. BALI-TASK-035/036/037/038 изменяет frontend
route delivery и только два approved Nginx root redirects; nested intent
preserved, backend/API/DB/migrations unchanged, customer writes `NONE`.
Latest BALI-TASK-042/043/044/045 sprint adds secure React `/admin/`, FastAPI
admin contracts, referral/reward corrections and migration `f2b6d9a4c731`;
no real OIDC/customer write or message was used for smoke.

11. 06 Development/docs/bugs/Bugs Backlog.md

Подтверждённые дефекты, причины, статусы исправления и необходимость ручной проверки.

12. 06 Development/docs/deploy/Web and Mini App Runbook.md

Рабочая production-схема `safrway.online`, Tunnel, Nginx, API и порядок выпуска.

13. 06 Development/docs/releases/

Release notes и отдельные evidence packets конкретных выпусков. Они являются
источником commit/push/deploy/migration/smoke фактов; roadmap и Snapshot только
ссылаются на подтверждённое evidence. Для BALI-TASK-020 текущий авторизованный
release packet находится в Decision Ledger: version `VERSION_UNASSIGNED`, а
post-release documentation SHA —
`f579c3316eaa8a3143426a35281bd735237f2595`. Новый versioned release note не
создавался в четырёхфайловом scope. BALI-TASK-023 fix evidence подтверждён.
BALI-TASK-025, BALI-TASK-027/028/029/030, BALI-TASK-033 и BALI-TASK-035/036/
037/038 plus BALI-TASK-042/043/044/045 release evidence находятся в Decision
Ledger. BALI-TASK-026/032 documentation SHA:
`18a35904b2e17f5df495a6c266909ca6a9a4299e`; current BALI-TASK-034/041/046
documentation SHA `UNASSIGNED` до отдельного согласованного docs commit/push.
`BALI-TASK-024` остаётся
заблокирован до
`design sprint = CLOSED` и `visas redesign = COMPLETED`; затем CPO готовит
brief и запускается обычная approval chain.

## Как использовать этот файл

Когда работа по проекту продолжается, сначала нужно смотреть этот файл, потом читать документы по порядку.

Главная логика проекта:

Сначала стабильность заявок, менеджеров и продаж.

Потом единый каталог бота, Mini App и сайта.

Далее автоматизация SAFR Points, партнёры и оплата.

После стабилизации — VK, Android, marketplace, исполнители и токен.
