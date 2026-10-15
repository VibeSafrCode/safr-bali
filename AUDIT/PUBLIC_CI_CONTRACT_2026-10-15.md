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

05 рассмотрел два узких budget exceptions для текущей разрешённой source-базы.
Они не обновляются автоматически из проверяемого кандидата:

| Фиксированный asset | SHA256 | Raw bytes | Node gzip bytes |
| --- | --- | ---: | ---: |
| `public-interactions.Cjhhv-a0.js` | `e545b2874a4cab30d4c40bb251c3607d9f14c1a623bc41ecd8de2acf5dcbecde` | 28550 | 12003 |
| `BaseLayout.Bt_MRs3Y.css` | `d7b9cd49e8c9dd186e4b2dd3c5cd44ef45f2da132f93badecbd1bbee71cc3998` | 160840 | 26973 |

Interaction package содержит данные **и исполняемый валидатор**. Его исходный
JSON отдельно закреплён SHA256
`4120b1d225a7e8f08b63f16cea9df3804defa4847166e38d556478c79792c472`.
Остальные JS/MJS сохраняют суммарные `<75000raw/<28000gzip` и пофайловые
`<=16000/<=6000`. Полный JS предел теперь `<103550/<40003`: он увеличен,
а не объявлен прежним. Измеренный текущий total97300/39274.

Все CSS учитываются полностью; общие `<180000raw/<32000gzip` не меняются.
Остальные CSS сохраняют пофайловые `<=155000/<=26000`. Текущий инвентарь:
BaseLayout160840/26973, PublicPage8028/1924 и Registry7588/1844, total176456/30741.
Это новый frozen compiled baseline текущего кандидата, не доказанная идентичность
прежнему production CSS. Файлы CSS и порядок их загрузки не редактировались.

Для каждого исключения требуются ровно один asset, exact hash/bytes и проверки
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
