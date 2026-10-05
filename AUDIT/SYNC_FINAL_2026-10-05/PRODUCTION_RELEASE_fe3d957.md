# SAFRWAY — выпуск C1/eVOA/E33G + D1/D2 завершён

Статус: **DEPLOYED / VERIFIED / READY_FOR_FOUNDER_NEXT_SPRINT**.
Публичная проверка завершена 2026-10-05T22:26:44 UTC (6 октября по времени Founder).
Это завершение согласованного релиза, не оценка готовности всей платформы.

## Точная версия и последовательность

- Первый выпуск C1/eVOA/E33G, согласованные17 правок VibeDiz и кнопка
  «Написать человеку» вышли на `ee7a5aeb9ac6c7f0db202762396a831ce0b47491`.
- D1/D2 добавлен следующим выпуском: backend/bot и оба публичных frontend
  build IDs — `fe3d9570737f1684850ddb48d624c86476e8a9c7`.
- GitHub main и release branch фактически подтверждены на fe3 перед фиксацией
  этого отчёта. Последующий docs-only commit не меняет deployed revision;
  повторный production deploy только ради отчёта не выполняется.
- Все четыре exact-revision CI jobs PASS: run37377164391, frontend/browser/
  Lighthouse, bot, backend/PostgreSQL и Next/Vinext.
  [CI](https://github.com/VibeSafrCode/safr-bali/actions/runs/37377164391).
- Backend → каталог → paired static links → реальные публичные ссылки → bot.
  Backend, bot, Nginx и штатный FX timer активны. D1 не меняет Nginx или схему.

## Что опубликовано

Шесть самостоятельных семейств D1/D2 ×10 языков: d1, d2, d1_d2,
d1_d2_extension, knowledge_d1_d2_extension, knowledge_d1_d2_documents.
Нет седьмого сравнения или второй бизнес-услуги.149 Registry records,
200 selected localized Registry pages,295 HTML документов. Исходные полные
JSON/MD/metadata, локализованные SEO, ответы, factBlock, FAQ/CTA сохранены.
Переводы не сочинялись заново. Все60 страниц попали в canonical/hreflang/sitemap;
факт выдачи в поисковой системе не гарантируется и не заявляется.

VibeDiz независимо проверил15 кадров и не запросил новых изменений сверх17
правок первого выпуска.105 локальных браузерных сценариев прошли; это не
сертификация всех страниц, переводов, законодательства или WCAG целиком.
Код импортов, цен, ACL/форм, callback/FSM и браузерные проверки прошли в CI.

## Единые цены и FX

Опубликован каталог4 через существующий owner-only audited publisher.

| Оформление | 1 год: стандарт / экспресс, IDR | 2 года: стандарт / экспресс, IDR |
|---|---:|---:|
| D1 | 5 000 000 / 6 500 000 | 9 000 000 / 11 000 000 |
| D2 | 5 500 000 / 7 000 000 | 9 000 000 / 11 000 000 |

Продление D1 или D2:2 500 000 IDR за этап; два этапа5 000 000 IDR.
Четыре пятилетних варианта — CONTACT без выдуманной фиксированной цены.
Фактически изменены7 начальных сумм: D1 standard2years уже был9млн и сохранён.
Добавлены ровно2 extension SKU. C1 issuance2млн, C1 extension2млн,
VOA/eVOA extension850тыс, E33G12/14млн за1человека — не изменены D1-публикацией.
Редактирование продолжается через действующую админку/каталог, не второй прайс.

Проверка через обычные публичные HTTPS-адреса сайта, Mini App и API плюс
реальный bot pricing consumer получила один projection43987, catalog4 и
FX43984; все10 сумм и примерных USD совпали. Admin использует тот же API;
его renderer/editor проверен локально на synthetic data. Production Admin
UI с клиентскими данными и отправка клиентам не использовались для QA.

Источник сохранён: INDODAX_PUBLIC_ORDER_BOOK/usdtidr, ask17 865 IDR/USDT
в проверенном снимке от22:26:30 UTC. Это историческое наблюдение, не текущий
обменный курс. Decimal, HALF_UP до ближайших$5 для примерных USD и отдельный
USDT до2знаков не менялись. FX freshness60секунд и существующий bounded stale
deadline15минут сохранены; истёкшие derived prices скрываются, публикация
требует fresh FX. Две композиции проверены с parent versions/formulas/expiry
и конвертацией общей IDR-суммы один раз. Timer продолжает обновлять курс.

## Данные, backup и rollback

Схема production `a7e4c9d2f105`; D1 не выполнял миграций. Новый private backup
восстановлен в изолированный PostgreSQL; доказаны равенство всех строк,
табличной схемы, sequences/state, дополнительных ACL/объектов и5 ценовых
инвариантов. Runtime не может подключаться к clone. Предыдущий U-D-U первого
выпуска — отдельное историческое доказательство, не «повторный U-D-U D1».
Analytics policy отключена и не изменена; новые этапы аналитики не запускались.

После выпуска все5 invariant counts снова0. Orders/commercial snapshots в
этой production базе пусты: сравнение old-row hashes прошло на пустом наборе,
а не на заполненных historical orders. Не заявляем обратное. Immutable behavior
проверен на populated synthetic fixtures/CI; publisher write allow-list не
допускает записи в order/client/visa-case tables. Backup защищает весь baseline.

Сохранены ee7 source, старые static targets и private backup. Source/static
rollback не откатывает базу, данные или каталог. При необходимости отдельно
использовать существующий audited Admin restore каталога с version guard.
Не выполнять drop/downgrade/reset, не пересчитывать исторические цены.
Protected docs, native WIP, секреты и локальные visual/source artifacts сохранены.

## Проверяемые квитанции

| Gate | SHA256 |
|---|---|
| Clean static archive:774files | `09e04996416c963d68812f37718d8e31d618f350a2901b0600a5bc19bbb4ee18` |
| Artifact manifest | `d1ec92208315a202725b7881f3d7bba3924f1431f5688c413116dbdd2bf4ce39` |
| Backup restore proof | `601b99ca6d044b17c99922deaa6aa3518f1022cbb5bb7f028fa480e14dd66ba6` |
| Catalog publication:43967/FX43964 | `d662eaee5111432f946adb6659e09749a29575f315221319bf418f987ce88bcb` |
| Static activation | `186603292b4c8c27157afe61588d531427586a1268b8104ba159d3e775891730` |
| Bot activation | `cae86ea2b9eeed7b55bc2ba3b8a6103fe42a3681ff0baf02fd55d7a2a52fb6f5` |
| Final public/same-snapshot proof | `7d9ee6dbba41e78a8dac0b0b6f6926878d0b72ff46a864e57c24a9aa497313a9` |
| Post-release read-only DB proof | `c12ded6baff45a078100b15170ab86e7ac377733fa634273160aa3ae92f46aed` |

Sanitized public/DB JSON receipts сохранены рядом. Private originals находятся
в `/var/backups/safr-bali-sync/d1-fe3d957`; приложение не получает к ним доступ.
Кратковременные HOLD не скрыты: неверныйcwd оператора; ожидание8 замен вместо7;
stale snapshot перед bot activation; локальные TLS timeouts; Python HTTPError.
Первые2 публикации не делали catalog apply. Timer восстанавливался.
Freshness/pins/HTTP200/CSP/права не ослаблялись ради PASS; финальная проверка
прошла через обычный curl/Cloudflare без impersonation/challenge bypass.

## Остатки, не блокирующие этот выпуск

P2: AR320 horizontal comparison/table hint и floating support edge;
RU/EN-only активный bot runtime (остальные8 шаблонов сохранены);
YouTube key restrictions/rotation не подтверждены; bare-root cold two-document
performance observation94. Их не выдаём за исправленные или новый scope.
Официальные source/legal оговорки D1/D2 сохранены в SOURCE_REGISTER/RESEARCH:
это не подтверждение текущей доступности подачи или native/legal certification.
P0/P1 release blockers по согласованным проверкам отсутствуют.
Рассылки клиентам не выполнялись: release announcement требует отдельного
owner approve flow. Новые продуктовые направления не начаты.
