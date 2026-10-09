# Проверка выпуска Yoga без обмена

Выпуск 9 октября 2026 года, primary integration. Кандидат `030900a89b83de2d33e516cce63def63a020f68b` с двумя изолированными component pins1037. Scope — только anonymous static RU/EN Yoga по пользовательскому IP URL. Общий живой шаблон — `AUDIT/RELEASE_CHECKLIST.md`, редакция2.

## Команда и scope

- [x] PASS — получены свежие ответы03 и77: новых согласованных изменений нет; round6 сохраняется, exchange removal согласован. Ответы, ревизии и bounded independent review записаны в README.
- [x] PASS — проверены текущие субагенты/handoffs. Других активных Yoga writers нет; Documents и Admin/date WIP исключены с указанной следующей границей.
- [x] PASS — scoped source commits32aafd6 и030900a опубликованы в GitHub main. Не включались чужие dirty paths; Admin diff SHA сохранён.
- [x] PASS — canonical catalog/Registry/price inputs равны прежнему deployed artifact. Shared content, FX, Indodax, business IDs, historical orders и live runtime не меняются.
- [x] PASS —19 неизменённых round6 pins, узкий `information.ts` projection delta; CSS/components/carousels unchanged. Никто не cherry-pick'ал весь чужой commit или старый dist.
- [x] PASS — исключение покрывает меню, cards, related/breadcrumb links, overview/arrival/FAQ copy, synthetic selector и8 direct routes. Новые shared импорты блокируются guard, если возвращают exchange topic.

## Кандидат и публикация

- [x] PASS — две изолированные196-page builds;36 critical checks, independent source/artifact review, strict raw USTAR/manifest parity и standalone verification.
- [x] PASS — sourceTree/output/archive hashes закреплены в receipt, два uncommitted1037 component pins честно отражены. Git HEAD не выдан за полный build composition.
- [x] PASS — секреты, клиентские записи, private originals, env/dumps и sourcemaps не добавлены; packaged tools/receipts вне web root.
- [x] PASS — explicit Founder scope сохранён. До activation проверены текущие config guards, backup bytes, старый artifact и root-only candidate.
- [x] PASS — nginx syntax, bounded readiness,15 реально served HTML и5 CSS/JS совпали с artifact.8 exchange URLs —404;20 private probes —404; writes403; invalid Host421.
- [x] PASS — trusted TLS без `-k`; с Mac независимо проверены RU/EN home и services с exact artifact parity. Anonymous, noindex/no-store, CSP и base path сохранены.
- [x] PASS — независимый77 подтвердил12 published RU/EN pages200 без exchange offers и8 excluded URLs404, noindex20/20; actual home hashes совпали с artifact.
- [x] PASS — SAFRWAY, Mini App, Quant response bodies/configs unchanged.212 старых artifact files сохранены; guarded rollback готов.
- [x] PASS — первый candidate FAIL и предотвращающие изменения внесены в incident log и общий checklist. Успешный повтор не подменяет первоначальную ошибку.

## Неприменимые или невыполненные проверки

- N/A — DB migration, backup/restore U-D-U, catalog publish и notification outbox: база и live runtime не входят в static release.
- NOT_RUN — rendered browser/pixel и native-touch. Новые браузеры/профили не открывались; source/controller review не является визуальным PASS.
- DEFERRED — live Yoga bot/intake. До отдельной activation его inherited menu должен соблюдать excluded-service policy; frozen runtime не менялся.
- DEFERRED — Documents import и Admin/date controls остаются отдельной подготовкой, не считаются выпущенными.

Activation evidence: `DEPLOYMENT_VERIFICATION.json`. Последующие docs-only commits не меняют приведённые runtime/artifact hashes.
