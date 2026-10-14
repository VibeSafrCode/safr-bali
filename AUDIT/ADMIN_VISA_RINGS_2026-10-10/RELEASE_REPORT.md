# Завершение ограниченного выпуска — 10.10.2026

Последние порученные задачи закрыты:

- Ручная реферальная привязка подтверждена в authoritative базе и проекции бота. Одна связь, без изменения исторических начислений; после запуска бота повторно проверено отображение. Персональные данные и закрытый снимок не помещены в Git.
- Кнопка меню бота называется **Mini App**; API read-back подтверждён, ссылка сохранена.
- В админских карточках виз появились круглые счётчики, согласованные по исходникам с 03. Даты, редактор, права, уведомления и сохранение не менялись.

## Фактический выпуск

Source/Git publication и production frontend: `36fe5f9036b6c69cf587b31fc24d5e344c65ae39`. Отдельный docs-only commit не является новой сборкой. Backend source остался `67e293919781923b9606eedc925b07be977bc513`.

22 критических unit-теста, полный typecheck и production build PASS. Семь целевых operator checks PASS. GitHub quality gates SUCCESS. 14 публичных HTML/version/CSS/JS совпали с manifest; повторная сверка entry points PASS. Старый artifact из 56 файлов и старые hashed assets сохранены; live overlay — 66 файлов.

SAFRWAY и Quant доступны; Yoga RU/EN/CSS совпали с ранее выпущенными хешами по штатному HTTPS без обхода TLS. Анонимные admin session/visa-cases — 401. Backend/DB health — 200, бот active.

08 отдельно согласовал Git publication, frontend activation/recovery и одну legacy projection операцию. Для frontend применены общий release lock, окно одного исполнителя, expected-target guards и безопасный откат независимо от повреждённой NEW/transport. Исходный коммит не amended.

## Явное ограничение и сохранённый scope

Rendered desktop/tablet/phone и фактический клик/edit-save-refresh — **NOT_RUN**. Founder прямо разрешил выпуск с этим ограничением; source/unit-проверки не названы браузерными.

Остановленные SEC-NEXT, native/Admin-date и Yoga bot/product WIP не возобновлены и не включены. Полного checkout deploy, миграций, изменения цен/Indodax/округления или клиентской рассылки не было.

Изначальные ошибки подготовки и исправленные guards сохранены в release incidents/checklist. `onboarding_runtime_lock.json` — lock-file, не повреждённые клиентские JSON.

Точный обезличенный [receipt](FINAL_RELEASE_RECEIPT_36fe5f9.json) содержит build/artifact hashes, проверки и сохранённый rollback.
