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
post-release documentation SHA пока `UNASSIGNED`. P0 `BALI-TASK-023` имеет
статус `FIX_VERIFIED`: ownership root cause подтверждён, authenticated smoke и
public DEC-015 desktop/mobile CTA evidence `PASS`. Public functional
calculator/API/Nginx исключены. По `BALI-DEC-20260801-014` future public
calculator записан как `BALI-TASK-024` (`IDEA / BLOCKED_BY_DEPENDENCIES`, owner
CPO Bali), без разрешения на execution.

10. 06 Development/docs/API Spec.md

Канонический API-контракт, включая calculator invariants и единственную
таблицу восьми exchange routes. Не смешивать её с web-route contract
`ecosystem-routes.v1.json`. Contract BALI-TASK-020 имеет code-статусы
`IMPLEMENTED_LOCAL`/`TESTED_LOCAL`/`PUSHED`/`DEPLOYED`; production migration
head `e8a1c4d7f920`, а DB содержит ровно восемь active route codes. После
hotfix owners table/sequence исправлены на `safr_bali`; migration source не
применялся повторно. Authenticated calculator smoke и current public page
contract — compact message + CTA на canonical authenticated app/login route —
`PASS`; public functional API/Nginx запрещены.

11. 06 Development/docs/bugs/Bugs Backlog.md

Подтверждённые дефекты, причины, статусы исправления и необходимость ручной проверки.

12. 06 Development/docs/deploy/Web and Mini App Runbook.md

Рабочая production-схема `safrway.online`, Tunnel, Nginx, API и порядок выпуска.

13. 06 Development/docs/releases/

Release notes и отдельные evidence packets конкретных выпусков. Они являются
источником commit/push/deploy/migration/smoke фактов; roadmap и Snapshot только
ссылаются на подтверждённое evidence. Для BALI-TASK-020 текущий авторизованный
release packet находится в Decision Ledger: version `VERSION_UNASSIGNED`, а
post-release documentation SHA ещё не назначен. Новый versioned release note
не создавался в четырёхфайловом scope. BALI-TASK-023 fix evidence подтверждён;
documentation gate: `READY_FOR_FINAL_DOCS_COMMIT`. `BALI-TASK-024` остаётся
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
