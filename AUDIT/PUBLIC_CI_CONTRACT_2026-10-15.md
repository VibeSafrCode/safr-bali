# Публичный CI и закрытые оригиналы

Публичная ветка должна собираться и проверяться без передачи закрытых
редакционных оригиналов в GitHub. Это не отменяет проверку originals перед
выпуском. Исправление продолжает красный frontend run
[`38671050083`](https://github.com/VibeSafrCode/safr-bali/actions/runs/38671050083)
на `7d72259`; оно не является production rollout.

## Два обязательных контракта

`PUBLIC_DERIVATIVE` выбран явно в frontend job. Он проверяет реально доступные
публичные body/metadata/structured envelopes, Registry, неизменённые source и
Owner-grant anchors, identity/locale/route/SEO/FAQ/pricing/indexability и все
обычные frontend/output/security/browser/Lighthouse gates. Результат
`PUBLIC_DERIVATIVE_VERIFIED` оставляет private originals `NOT_EXECUTED`.

`PRIVATE_ORIGINALS` остаётся default для build/render validation. Перед
выпуском Root запускает его на том же commit, validator/toolchain и фиксированном
наборе240 originals. Он сохраняет исходные byte hashes, receipt/parser проверки
и требует полное совпадение публичной проекции обоих путей. Missing original,
неизвестный контракт или source/grant drift — FAIL, не public fallback.

В чистом публичном checkout:

```sh
SAFR_EDITORIAL_VERIFICATION_CONTRACT=PUBLIC_DERIVATIVE \
  node astro-site/scripts/verify-editorial-contract.mjs --contract PUBLIC_DERIVATIVE
```

Команда запускается из `06 Development`; обычные `pnpm` тесты/сборки используют
тот же явный контракт из workflow. Закрытый gate выполняется локально:

```sh
SAFR_EDITORIAL_VERIFICATION_CONTRACT=PRIVATE_ORIGINALS \
  node scripts/verify-editorial-contract.mjs --contract PRIVATE_ORIGINALS
```

Его рабочий каталог — `06 Development/astro-site`. Для внешнего локального
source bundle использовать только существующий проверенный private-input
resolver. Не создавать originals из public metadata, не добавлять их в
Git/artifacts/cache/logs и не загружать в CI. В release receipt записать exact
commit/tree/toolchain, binding hash, public projection hash и output artifact.
Green public CI без этого strict gate не даёт source-equivalence или выпуска.

## Исторические тестовые данные

Три fixture helpers используют один компактный публичный snapshot10 прежних
записей из Registry `67e293919781923b9606eedc925b07be977bc513`, а не отсутствующие
private preimport files. Donor commit/blob/raw hash и snapshot hash закреплены.
Сохраняются полные159/157/154 stage hashes, исходные product restorer guards,
контроль370 прежних проекций и negative mutation tests. Глубокая Git history
для выполнения CI не требуется.

## Маршруты и бюджеты

Output assertions используют действующий независимо закреплённый Owner grant:
1070 публичных routes,610 Registry/450 legacy/10 UAE, десять языков. Expected
inventory не берётся из dist/sitemap. Private routes отсутствуют; approval
не превращается в native/legal/source QA. Уникальность SEO проверяется внутри
каждой локали и по всему прежнему RU/EN набору: одинаковое утверждённое имя
на разных языковых URL не является дублированием route identity.

Main React сохранил route-level lazy imports и лимит500000bytes для каждого
JS chunk. Отдельно упакован прежний публичный i18n JSON; тексты/API/auth/referral
логика не меняются. Локальные Main chunks308324/313599bytes — build evidence,
не подтверждение скорости production.

Run `38679717799` на `15041d2` прошёл все source/build/package/browser этапы,
но остался красным на Lighthouse: EN47311 и Bali40255 script-transfer bytes
при прежнем35000. Оценки EN98/100/96/100 и Bali99/100/96/100 прошли; это не
устраняет превышение transfer. Новый ремонт сохраняет лимит35000 и категории.

Полный pinned interaction JSON по-прежнему проходит source/stage/key/token
проверку при сборке. Каждый документ получает один inert JSON с46 подписями
только своей локали. Data-free browser reader сверяет независимый locale hash,
source4120, полный keyset, параметры и locale документа без fallback; JSON
экранирует HTML-разделители, строки читаются через textContent. Все460 значений
и подстановки сравниваются с каноническим источником побайтно. Новые данные
учитываются в HTML transfer, а не считаются бесплатными.

Небольшой deferred pricing loader после разбора DOM проверяет все пять
потребителей: canonical/Registry prices, оба SEO template и JSON-LD template.
Нужный pricing стартует сразу, включая скрытые/SEO-only цены; нет click/idle
или Lighthouse-особого поведения. Документы без потребителей не загружают
pricing chunk и не запускают его API/polling. Сам pricing module, expiry,
защита от старого ответа, тексты, авторизация и рефералы не переписаны.

05 рассмотрел замену прежнего interaction исключения на два exact assets
ниже. Старый e545/28550raw/12003gzip пакет больше не разрешён. Новый frozen
пакет не обновляется автоматически из проверяемого кандидата:

| Фиксированный asset | SHA256 | Raw bytes | Node gzip bytes |
| --- | --- | ---: | ---: |
| `public-interaction-captions.3rJzfbIC.js` | `3f6aa157abd7128881afbccb718b43c8c5961fff6b94a46ca5fce698ad5a9c8c` | 5205 | 2794 |
| `pricing-entry.Dydp6ekl.js` | `4cd910adee18e7fec7fb3af0b187b03cc6ff35ecdeda98b36e38149813636f4d` | 1659 | 855 |
| `BaseLayout.Bt_MRs3Y.css` | `d7b9cd49e8c9dd186e4b2dd3c5cd44ef45f2da132f93badecbd1bbee71cc3998` | 160840 | 26973 |

Полный interaction JSON остаётся только server/build и отдельно закреплён SHA256
`4120b1d225a7e8f08b63f16cea9df3804defa4847166e38d556478c79792c472`.
Остальные JS/MJS сохраняют суммарные `<75000raw/<28000gzip`. Пофайловые
`<=16000/<=6000` действуют для **всех** файлов, включая новые два. Полный JS
предел сужен с `<103550/<40003` до `<81864/<31649`; относительно исходного
общего75000/28000 это всё ещё явно принятое исключение. Оба файла полностью
учитываются в total. Новый inventory22files75653raw/30948gzip против прежнего
21files97300/39274; остальные20files68789/27299. Это локальные build-метрики,
не actual browser/Lighthouse transfer или production evidence.

Все CSS учитываются полностью; общие `<180000raw/<32000gzip` не меняются.
Остальные CSS сохраняют пофайловые `<=155000/<=26000`. Текущий инвентарь:
BaseLayout160840/26973, PublicPage8028/1924 и Registry7588/1844, total176456/30741.
Это новый frozen compiled baseline текущего кандидата, не доказанная идентичность
прежнему production CSS. Файлы CSS и порядок их загрузки не редактировались.

Для каждого закреплённого файла требуется ровно один asset, exact hash/bytes и проверки
missing/duplicate/drift/other-growth. Полная рекурсивная инвентаризация,
secrets scan, CSS total и browser/Lighthouse thresholds сохранены. Следующее
изменение frozen asset требует нового рассмотрения или реальной оптимизации.
Node24.19.0/gzipSync и чистый CI должны воспроизвести pins; расхождение нельзя
исправлять автоматическим пересчётом ожидаемого hash.

## Границы результата

Offline Yoga inventory рассчитывается один раз на неизменном source внутри
процесса сборки, каждый вызов получает глубокую копию. Это не cache renderer,
цен или TTL. Exact244-route parity и mutation-isolation проверяются отдельно.
Guard финансового обмена не удаляет точные фразы об образовательном обмене
из закреплённых student articles; financial routes/marketing по-прежнему
блокируются, включая camouflage negatives. Старый196HTML HTTPS fixture
заменён фиксированным244 scope и сравнением с фактической route inventory.

Local gates, Git push, exact-SHA Linux CI и production — разные результаты.
Исходный run3PASS/1FAIL сохранён как история; результат successor commit
проверяется в его workflow. Этот ремонт не перезапускает Main/Yoga/backend,
не переписывает auth, referral graph, данные или выплаты и не выпускает
отложенные правки ВайбДиза.
