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
файле хранится local evidence checkpoint BALI-TASK-020: baseline, test matrix,
migration checksum/status, screenshots и явные operational `NONE`.

10. 06 Development/docs/API Spec.md

Канонический API-контракт, включая calculator invariants и единственную
таблицу восьми exchange routes. Не смешивать её с web-route contract
`ecosystem-routes.v1.json`. Candidate BALI-TASK-020 имеет только статусы
`IMPLEMENTED_LOCAL`/`TESTED_LOCAL`; production release не утверждён.

11. 06 Development/docs/bugs/Bugs Backlog.md

Подтверждённые дефекты, причины, статусы исправления и необходимость ручной проверки.

12. 06 Development/docs/deploy/Web and Mini App Runbook.md

Рабочая production-схема `safrway.online`, Tunnel, Nginx, API и порядок выпуска.

13. 06 Development/docs/releases/

Release notes и отдельные evidence packets конкретных выпусков. Они являются
источником commit/push/deploy/migration/smoke фактов; roadmap и Snapshot только
ссылаются на подтверждённое evidence. Для BALI-TASK-020 release note не
создаётся до назначения версии и evidence commit/push/deploy/smoke.

## Как использовать этот файл

Когда работа по проекту продолжается, сначала нужно смотреть этот файл, потом читать документы по порядку.

Главная логика проекта:

Сначала стабильность заявок, менеджеров и продаж.

Потом единый каталог бота, Mini App и сайта.

Далее автоматизация SAFR Points, партнёры и оплата.

После стабилизации — VK, Android, marketplace, исполнители и токен.
