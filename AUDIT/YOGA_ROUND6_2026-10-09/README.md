# Выпуск текущего дизайна Yoga Ganster

На пользовательском адресе `https://62.133.61.231/yoga-preview/` активирован согласованный с ВайбДизом `round6`. Это anonymous static RU/EN preview, не запуск live-бота или приёма заявок.

## Сверка команды

03 — ВайбДиз подтвердил: после round6 новых согласованных визуальных изменений и незавершённого дизайн-WIP нет. 20 runtime design files закреплены по revision `1037b3526009af1a58559ef5f4384f332ebef28d`; три исторических теста не накладывались поверх текущего набора.

77 подтвердил отсутствие обновлений: его 27 bot files совпали с ранее переданными foundation/shared-intake/topic manifests. Они не включались в этот static visual update. Другие участники: независимый security reviewer проверил новый artifact и archive guard; Documents importer выполнялся в отдельных новых файлах и в этот выпуск не включён. Ответы сверены до активации; основная беседа владеет integration/release.

## Точные версии

Canonical integration base `78d3ec2056e8be537191be7511591f073f7215f8`. Изолированная сборка pin20 design bytes; два компонента временно закреплены на1037 вместо более поздней live-contact логики. Основная рабочая копия и поздняя bot/contact разработка не откатывались.

Build sourceTree SHA `9d6a96530e5c9ede0528cb1368301b77d19ac6ca4ef7a307c165a9443d4b6566`, output SHA `ffb571af591bda5527b772027e48543722ea0b78442fbb1367d5e4cea6d52d2c`, archive SHA `7c7ab5b2a914ccea85585f32e231acfa8aab00145be42bb97aee52b20aa2923b`. Receipt честно отмечает pinned uncommitted overlay. Git HEAD не подменяет эти source/artifact pins.

204 HTML построены, но account/owner/bot-demo/downloads/API routes закрыты и не являются опубликованными услугами. Build receipt и packaged tools находятся вне web root. Предыдущий artifact178files и приватные guarded config backups сохранены.

## Проверки и результат

- Свежие critical checks: 30 static/controller/package tests, 2 synthetic React tests и 3 HTTPS-prefix/package tests — PASS. Вначале проверки без сборки и sandboxed loopback завершились ошибкой; после создания artifact и разрешённого loopback повтор прошёл. Первичные ошибки не считаются успешными проверками.
- Независимый source/artifact security review: 213 generated files, 0 symlink, найденных секретов, customer PII, raw source и API transports. Это ограниченная проверка, не гарантия невозможности взлома.
- Первичный transport archive отвергнут на Linux до production-записей из-за AppleDouble. Исправлены упаковка и raw archive guard; дополнительно усилены magic/version, header checksum и все duplicate entries. Усиленный guard проверил bytes фактически deployed archive. Этот инструмент проверки не является публичным клиентским runtime.
- Production nginx syntax и bounded worker-readiness — PASS. Шесть representative pages и пять assets совпали SHA с новым artifact;20 private-route probes404; writes403; invalid Host421.
- Anonymous access, noindex/no-store и строгий no-connect/no-form сохранены. Единственный media delta — `i.ytimg.com` для thumbnail и `www.youtube-nocookie.com` для iframe после явного клика. Thumbnail обращается к YouTube при открытии; сеть внутри iframe не контролируется родительским connect-src.
- SAFRWAY, Mini App и Quant response bodies не изменились. Общий nginx-конфиг SAFRWAY изменён только внутри Yoga location; Quant config не изменён. База, бот и клиентские сообщения не затронуты.
- External Mac HTTPS checks: RU/EN HTTP200, TLS verification0; hashes совпали с artifact. TLS bypass не использовался.

Rendered Yoga browser/pixel и native-touch — **NOT_RUN**. Новые браузеры/профили не запускались. Пользователь может визуально принять превью по своему существующему адресу; source review не объявляется визуальным PASS.

## Rollback

Возвратить guarded config copies предыдущего static root и CSP, выполнить nginx syntax check/reload и проверить старые RU/EN hashes с bounded readiness. Предыдущий artifact сохранён неизменным. Password removal остаётся согласованным; rollback к прежнему дизайну не должен случайно вернуть пароль. Database/catalog rollback не требуется и не разрешается как часть этого изменения.

Фактическая activation receipt — `DEPLOYMENT_VERIFICATION.json`. Общий живой процесс закреплён в `AUDIT/RELEASE_CHECKLIST.md`, недосмотры — в `AUDIT/RELEASE_INCIDENTS.md`.
