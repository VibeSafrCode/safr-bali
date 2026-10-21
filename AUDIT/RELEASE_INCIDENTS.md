# Ошибки выпуска и предотвращающие проверки

История сохраняется. После каждого подтверждённого недосмотра добавлять причину, конкретное исправление и проверку в общий [чек-лист выпуска](RELEASE_CHECKLIST.md).

## Mobile HOME service-caption collision — 21 октября 2026

После удаления перекрывающего FAB реальный FR320 кадр показал вторую,
унаследованную проблему: «Change de devisesAssistant» слипались. Узкое правило
nowrap при360px отменяло предыдущий перенос в четырёх колонках. Scoped HOME
правило до699px возвращает normal/anywhere и max-width100%, не меняя font,
columns, тексты или article/desktop. Fresh build и независимый просмотр девяти
FR/DE/ES/AR/JA кадров подтвердили отсутствие collision/clipping в затронутом
scope. В regression добавлены bounds и scrollWidth/clientWidth каждой подписи;
одного center-hit недостаточно. New CI/production остаются отдельными gates.

## Main public asset nosniff inheritance — 21 октября 2026

После статического Main release bounded live probe показал, что `nosniff`
отсутствует на ответах для части CSS/JS assets: у Nginx `add_header` внутри
asset location отменил наследование server-level headers. Добавлен тот же
header непосредственно в Main asset location production и preview templates;
real fixture теперь требует CSS, JS и MJS MIME, точное тело и `nosniff`.
Локально прошли source assertions для двух шаблонов, Python syntax,
`git diff --check` и Astro redirect contract 5/5. Полный Python suite не
запустился: доступный системный и bundled Python не имеют `pytest`; локальный
Nginx binary также отсутствует. Это `NOT_RUN`, не PASS. Предотвращение:
обязательный exact-source CI с Python dependencies и real-Nginx lane перед
фиксацией кандидата; перед production config change сохранить exact config
и rollback, тестировать syntax и served headers на фактической конфигурации.

### Production config follow-up — 21 октября 2026

Exact CI `39577610555` на `c82f41ce992ad139c363c3d25d577e571546eb0a`
завершился `4/4 SUCCESS`, включая real-Nginx fixture. В live Main config
внесён только reviewed localized-404 и cached CSS/JS `nosniff` delta;
сохранён отдельный rollback, `nginx -t` прошёл до/после и выполнен reload.
Origin smoke подтвердил exact CSS/JS/MJS bodies, MIME и header, а также все
9 locale-specific unknown-path 404 bodies. Не затронуты app/backend/bot
процессы.

Внешняя проверка обнаружила CDN-кеш: обычные CSS/JS URLs были `CF-Cache-Status:
HIT` и всё ещё без нового header; cache-busted MISS отдаёт `nosniff`, как и
MJS DYNAMIC. Поэтому origin release принят, но edge CSS/JS header gate не
закрыт до targeted purge/expiry и повторного обычного GET. Не объявлять
полное исправление по одному origin или cache-busted URL.

Повторный ordinary GET в 09:58:42 UTC подтвердил оба CSS/JS ответа как HIT,
`Age: 159384` при `max-age=604800`; отсутствие `nosniff` сохраняется. Запросы
были публичными read-only, без Cloudflare credentials/API.

Отдельная ошибочная первая проверка использовала `/index.html` вместо
canonical slash-route и ограничила 404 body 64 KiB; повторная проверка по
правильному route с полным body подтвердила точный origin 404. В дальнейшем
фиксировать exact route shape и body cap не ниже фактического 404 размера.

## Yoga white-label и startup edge cases — 15 октября 2026

Итог product source cad0fca: CI38742049647 — все4 jobs SUCCESS, включая
frontend/browser/Lighthouse; исторические red runs ниже не переименованы.
Immutablec94 выпущен с отдельными origin/HTTPS/visual receipts.

Первое переключение остановилось на старом nginx worker сразу после успешного
reload; actual автоматический rollback восстановил прежние static roots и Yoga
runtime без DB restore/Main restart. Successor ждёт exact новых marker bodies
на обоих upstream в ограниченном окне;13 isolated mocks и actual новая
активация приняты. Команда reload сама по себе не доказывает readiness.

Два внешних HTTPS прогона прервались сетевым TLS timeout; они сохранены как
FAIL, а не неполный PASS. Новый verifier продолжает только exact строки того
же manifest после свежих marker checks, сохраняет body evidence до route
guards и использует normal TLS/keepalive. Независимые21 transport/resumption
mocks включают запрет retry после любого известного HTTPstatus/body timeout.
Actual финальная сверка приняла1373 exact bodies; отдельный robots body
разрешает1070 URL, но не совпадает с artifact и не означает actual indexing.

Полная внешняя проверка обнаружила двойной /yoga-preview/ у legacy PDF301:
inner target уже включал mount, а outer proxy добавлял его ещё раз. Исправлен
только inner literal; public composition/privacy regression4/4 и private
rollback mocks12/12 PASS. Actual HTTPS Location имеет один prefix, target PDF
совпадает с98279-byte артефактом. Bots/auth/referrals/DB не менялись. Addendum
откатывать до parent presentation release; это новая обязательная checklist
проверка, не повод снять deny со всего downloads.

CI38739565820/bb20313 завершился3PASS/1FAIL. React browser136PASS/8 прежних
SKIP и Life15PASS; Astro187PASS/4 прежнихSKIP, две новые RU footer fixtures
ошиблись на navigation. Пустой relative path `/yoga-preview/` считался каталогом,
а не index.html; `/en/` уже проходил. Исправлена только адресация fixture для
пустого пути. Обе RU390/1440 проверки и прежние visual assertions сохраняются;
новый exact-SHA CI обязателен, Lighthouse того run SKIPPED, не PASS.

CI38737907255/5beb148 прошёл bot/backend/reference и обе основные application
проверки, затем остановился на York-preview typecheck: его narrow include не
подключал src/vite-env.d.ts после нового транзитивного Yoga asset helper.
Подключена существующая декларация, без ambient any/исключения исходников или
отключения gate. Перед повторным CI проверяются все три tsconfig-входа.

Локальный новый PDF HTTP fixture ошибочно требовал Content-Length от сервера
с chunked ответом. Harness теперь сохраняет binary bytes и сверяет их целиком
с принятым PDF/98279bytes; MIME/status/private guards сохранены. Это исправление
тестового предположения, не изменение сервера ради зелёного результата.

Проверка выявила постобработку целой визовой карточки после вставки API label/
fee_note/URL. Заменена небольшим explicit static_copy hook существующего общего
composer: только проверенные исходные шаблоны до переменных, price gaps D1/D2
по исходным offsets. Default42 карточки/6 меню побайтно прежние; negative API
строки остаются буквально прежними. Main runtime и восемь content pins не менялись.

Private rollback review закрыл fence до остановки Yoga при более новом release,
независимые безопасные шаги восстановления и hash-check резервных nginx bodies.
Оператор проверяет exact unit fragment и отклоняет присутствующие hooks; пустые
systemctl свойства могут отсутствовать и не должны вызывать KeyError до запуска.

Новый scope Founder требует убрать affiliation, а не переписывать общую бизнес-
логику. Независимая проверка нашла обход brand projection в SEO отдельной RU
главной: body уже был Yoga, meta description оставался Main. Главная подключена
к той же display projection; source regression и полный216-page semantic pass
обязательны на свежем артефакте, старый build superseded.

До финальной приёмки также исправлены: case-sensitive защита opaque HTTPS URL,
dead Video action при скрытом Main-канале, потеря support draft из-за route-keyed
boundary и stale locale response после нового offline/preaccount выбора. Yoga
intent revision+locale+pending теперь синхронны до любого await; Main delay не
менялся. Новые browser fixtures проверяют реальный lifecycle, не только helper.
Dependency symlink/CLI IPC отказ не обходили: использовали существующий Node
loader; missing private originals в public checkout не объявляли PASS. Private
frozen build гидрирует только закреплённые240 originals вне Git. Новые exact
CI/visual/production результаты сохраняются отдельно от source/static ACK.

## Незакрытый frontend CI после синхронизации Git 15 октября 2026

CI `38671050083` на `7d72259` завершился3PASS/1FAIL. Ошибка shared-test fixture
`ERR_MODULE_NOT_FOUND` была унаследована от публичного сайта, но запись её в
backlog не закрыла проблему. Founder потребовал довести неуспешную проверку.

Три исторические фикстуры зависели от отсутствующих private preimport snapshots.
Вместо публикации этих файлов восстановлены ровно10 прежних записей из уже
публичного Registry `67e2939`, закреплены provenance/bytes и полные159/157/154
hashes. Порядок записей значим: первая локальная генерация остановилась на
несовпадении порядка до записи; явный порядок IDs и whole-object сверка приняты.
Исходные product restorers и370-baseline не ослаблялись.

Следующий build этап смешивал публичную проекцию с чтением закрытых originals.
Общие public assertions выделены без второго renderer; explicit public CI
не заявляет original-source QA. Strict240/original-byte/parser проверки остались
обязательным отдельным release gate. Независимый локальный review нашёл P2:
неявный `undefined` в новом receipt API мог обойти strict ветку. Он теперь
отклоняется, добавлен regression; пропущенный контракт не означает public mode.

Полный локальный прогон выявил дальнейшие старые ожидания:626 вместо1070
страниц, исключённую privacy, RU источник при EN-публикации, старый импортный
VM harness без нового actual helper. Исправлены тестовые входы и ожидания
по уже закреплённому Owner grant, без правки текстов, цен или разрешений.
Main JS641382bytes разделён на308324/313599bytes чистым выделением публичного
JSON;500000-byte gate сохранён. Для ранее принятого interaction packet и
текущего compiledCSS05 рассмотрел точные frozen exceptions; изменение общего
JS budget указано явно, остальные/totalCSS gates сохранены. Это не новый
visual/performance или production PASS.

Локальная `pnpm` остановилась на безопасном запрете auto-install через
dependency symlink: внешний modules target не удалялся. Эквивалентные команды
types/unit/build запущены напрямую установленными бинарниками; чистый Linux CI
остаётся отдельной проверкой pinned pnpm11.9. Выходные тесты, ошибочно вызванные
до создания `dist`, повторены после успешной1080HTML сборки. Loopback HTTP
проверка первоначально получила sandbox EPERM; повтор допустим только через
обычную scoped approval, не отключение теста или обход защиты.

В offline Yoga build повторный расчёт полного RU/EN route inventory для каждой
кнопки меню занимал минуты. Добавлен module-local immutable cache только списка
маршрутов с deep copies для вызывающих; renderer/pricing/TTL не кэшируются.
Первый завершённый build затем честно остановился на ложном совпадении
«обменным образовательным программам» с финансовым обменом. Customer copy не
переписан: точные educational фразы отделены от financial guard; добавлены
negative financial/camouflage tests и exact244-route HTTPS expectations вместо196.
Зависимость guard включена в точные package source pins. Output/package тесты
запускаются только после exit0 полного build и наличия build receipt; частичный
каталог не является готовым artifact.

Предотвращение: clean-checkout CI, source/private contract equality,
полная pinned route inventory и negative asset guards включены в checklist.
Исторический красный run не переименовывается в green. Результат нового
exact-SHA run проверяется отдельно; сервер и auth/referrals этим ремонтом
не меняются. Подробные границы — [public CI contract](PUBLIC_CI_CONTRACT_2026-10-15.md).

Run38679717799/15041d2 прошёл все прежние source/build/package/browser gates,
но выявил следующий FAIL: Lighthouse script transfer47311/40255 при35000.
Полный10-язычный caption dictionary загружался каждым документом, а pricing
включался даже без цен. Исправление сохраняет канонические460 строк и полную
build validation, доставляет один независимо pinned locale payload и условно
подключает прежний pricing сразу для всех пяти видов потребителей. JSON/CSP
guard разрешает только exact inert caption block, не произвольные inline scripts.
LH35000 и категории не повышены; старый широкий JS exception заменён более
узким exact2file packet, весь HTML+JS transfer проверяется отдельно в CI.

Prevention: на каждом layout/1070 routes проверять one-locale payload и его
bytes; в чистом browser Network проверять отсутствие pricing/API на EN/Bali
после focus/visibility и немедленный запуск для каждого price/SEO/JSON-LD
потребителя. Independent review до push исправил два новых test-fixture риска:
используется канонический zh-cn route helper и мобильный видимый theme control.
Нельзя объявлять CI закрытым по одному устранённому раннему step: требуется
итоговый SUCCESS exact-SHA run, включая Lighthouse, без переноса старых PASS.

## Устаревшие входные сводки после октябрьских выпусков — 11 октября 2026 года

**Симптом:** Current State/Backlog ещё начинались с `c890cae` и закрытого
Yoga `b20cd6a`; audit entry point/prompt указывали сентябрьские версии и старую
ветку. Более новые receipts уже находились в Git, но верхние сводки не были
согласованы. Поэтому разные ассистенты могли повторить сделанное или неверно
считать current preview защищённым паролем.

**Исправление:** актуальный слой 11 октября, единые ссылки на core67e/App36fe/
Yoga030, новая route/content matrix, нормализованные остатки и явное разделение
main source baseline, документационной публикации и local-only кандидата.
История не удалена; runtime/цены/БД/секреты не меняются.

**Предотвращающая проверка:** перед закрытием следующего выпуска сверять
входные документы с его receipts и проверять отсутствие stale current claims.
Этот пункт добавлен в checklist revision4. Для данной docs-only синхронизации
проверяются ссылки/JSON/redaction, точный scoped diff и Git remote read-back;
не требуется новый product build или production switch.

**Отдельный export guard:** первая упаковка полного Decision Ledger остановлена
до создания/передачи ZIP: в историческом appendix найден private local path.
В добавленном docs diff таких значений не было; полный export требовал своей
проверки. История Git не удалялась и не переписывалась. Новый пакет включает
только точный текущий префикс этого ledger, с source/export hashes и явной
границей в EXPORT_SCOPE; полный архив снова проходит privacy scan. Этот
контроль добавлен в checklist, первичный отказ не объявляется PASS.

## Замечания к scoped frontend operator 10 октября 2026 года

08 до активации обнаружил зависимость rollback от исправной NEW/transport, недостаточную защиту параллельного switch и окно ошибки после rename до установки Boolean. Исправлены отдельные rollback preconditions, host-level lock с единственным согласованным исполнителем, expected-target guards и проверка фактической цели после ошибки rename/fsync. Пять целевых synthetic сценариев прошли. Первоначальный synthetic fixture FAIL был связан с macOS alias `/var` → `/private/var`; fixture нормализован, а не ослаблены production guards.

Затем public preflight корректно остановился на 404 для raw HTML URLs до switch. Установлена фактическая карта `/`, `/account/`, `/admin/`; добавлены проверка final HTTPS host/path, именованный диагностический User-Agent и точные body hashes. Финальные семь operator checks и публичная baseline-сверка шести файлов PASS. Прежний сайт не менялся при отказе. Соответствующие guards добавлены в release checklist. Power-loss durability не заявляется.

При отдельной проверке state выяснено: `onboarding_runtime_lock.json` — flock lock-file с расширением `.json`, не JSON-хранилище и не повреждённые клиентские данные. Его не «исправляли»; startup JSON inputs проверялись отдельно строгим parse без fallback/reset.

## Различие базы handoff и Git main при визовых счётчиках 10 октября 2026 года

**Симптом:** изолированный UI handoff прошёл typecheck на production-базе `67e2939`, но интеграционный кандидат на Git main `0fa3f024` получил TS7016 в `react-app/src/york-preview/DemoApp.tsx`: для `shared/src/yoga-content-policy.mjs` нет декларации типов. Эти два файла визовый patch не меняет; их изменения появились между базами. 18 критических проверок счётчика и Vite-сборка проходят, но полный typecheck кандидата остаётся FAIL.

**Граница:** только локальная интеграция; публикации, активации, изменения backend, даты клиентов и production не выполнялись. Старое dirty-зеркало и остановленная security-ветка сохранены.

**Исправление:** 77 подтвердил отсутствие готовой декларации и дополнительных правок для этого выпуска. Добавлена только `shared/src/yoga-content-policy.d.mts`, соответствующая runtime-экспортам; `.mjs` не менялся. Повторный полный `tsc -b` — PASS, 22 целевых unit checks — PASS. Первоначальный FAIL сохранён выше; preview из проверки не исключался.

**Предотвращающая проверка:** в release checklist добавлена сверка базы handoff с интеграционной базой и деклараций shared-модулей. Rendered/browser остаётся NOT_RUN; Founder разрешил этот ограниченный выпуск с указанным ограничением. Security gate и release подтверждаются отдельно.

## Успех Telegram setter без совпадающего read-back 10 октября 2026 года

**Симптом:** при точечном переименовании кнопки меню setter подтверждал запрос, но немедленное чтение ещё показывало старую подпись. Конкретная причина расхождения не установлена; не утверждаем, что это ошибка формата или кэширования.

**Результат:** отдельное последующее чтение подтвердило `Mini App`; ссылка совпала с первоначально считанной. Клиентские сообщения, база и код бота не менялись.

**Предотвращающая проверка:** успех setter не закрывает изменение настройки. Требуется подтверждённый read-back и сохранность незатронутых параметров. Первичные неуспешные проверки не заменяются финальным PASS в истории.

## Неполная интеграция Yoga visibility policy 9 октября 2026 года

**Симптом:** первый critical run нового кандидата не прошёл: packager отверг новый `shared/src/yoga-content-policy.mjs`, а новая проверка ожидала шесть карточек Бали вместо фактических пяти после исключения обмена.

**Причина:** dependency был добавлен в build receipt, но пропущен в строгом allowlist упаковки. Ожидаемый UI count взят без сверки с текущим каталогом. Guards остановили кандидата до upload и переключения сайта; действующий artifact не менялся.

**Исправление:** allowlist дополнен только точным именем нового policy module; тест сверяет количество с canonical cards минус одна исключённая услуга. Независимый review дополнительно проверяет текстовые удаления и неизменность визовых условий.

**Предотвращающая проверка:** список inputs и packager allowlist согласуются при новой зависимости; counts вычисляются из реального текущего каталога. Полная повторная сборка и критический suite обязательны после исправления; первичный FAIL не заменяется успешным повтором в evidence.

**Результат исправления:** повторные36 critical checks PASS; `no-exchange-030900a-caf256b42a47` активирован с root-only delta. Все8 исключённых URL —404,15 HTML и5 assets совпали с artifact; канонические inputs и соседние сайты неизменны. [Activation receipt](YOGA_NO_EXCHANGE_2026-10-09/DEPLOYMENT_VERIFICATION.json).

## Устаревший дизайн Yoga preview 9 октября 2026 года

**Симптом:** пользователь открыл временный IP-адрес Yoga и увидел старый дизайн.

**Подтверждённые факты:** изменение адреса и снятие пароля сохранили предыдущий static artifact `b20cd6a77c00d1ad84371e0ba5f942376a769e9c`. ВайбДиз подтвердил согласованный `round6`, runtime design revision `1037b3526009af1a58559ef5f4384f332ebef28d`. Проверка доступности и защиты старого artifact прошла, но она не доказывала интеграцию нового дизайна.

**Причина процесса:** инфраструктурный выпуск не сопровождался обязательной свежей сверкой всех участников и сравнением фактически отдаваемого artifact с последней согласованной версией дизайна. Наличие новых файлов в рабочей копии ошибочно не было превращено в отдельный verified build и deployment checkpoint.

**Исправление:** свежий handoff 03, запрос обновлений 77, pin20 runtime-файлов `round6`, изолированная HTTPS-сборка с текущими каноническими данными. Password-removal и ограничения приватных разделов сохраняются. Основной сайт и live-бот исключены из визуального выпуска.

**Предотвращающие проверки:** обязательные ответы 03/77 и всех участников; scope hashes → build receipt → served HTML/CSS/JS parity по пользовательскому URL; отдельные статусы инфраструктуры, дизайна и live-функционала. Эти проверки включены в `RELEASE_CHECKLIST.md` и закреплены в `AGENTS.md`.

**Результат исправления:** 20/20 design pins подтверждены,35 critical tests прошли; round6 активирован. Шесть страниц и пять CSS/JS assets совпали с artifact по пользовательскому HTTPS URL; закрытые маршруты остались404, соседние сайты не изменились. [Activation receipt](YOGA_ROUND6_2026-10-09/DEPLOYMENT_VERIFICATION.json) хранит точную сборку. Rendered/browser и native-touch не выполнены и не объявляются PASS.

## Служебные записи macOS в Yoga archive 9 октября 2026 года

**Симптом:** Linux preflight отверг скрытые AppleDouble entries `._*`, отсутствующие в манифесте. На macOS стандартный tar скрывал их при listing/extraction; локальная проверка распакованного каталога не обнаружила различие транспортного архива.

**Граница:** отказ произошёл до записи нового artifact и до изменений конфигурации. Действующий сайт не переключался.

**Исправление:** `COPYFILE_DISABLE=1`, явный `--format=ustar` и независимый контроль raw gzip/tar bytes в packager. Raw members проверяются по допустимым типам, inventory, размерам и hashes манифеста. Добавлен негативный regression test для скрытого `._index.html`.

**Предотвращающая проверка:** transport archive parity перед upload/activation теперь обязательна в общем чек-листе; локальный extract PASS её не заменяет. Новый пакет собирается с обновлёнными source pins.

**Дополнительный независимый разбор:** guard усилен после обнаруженного несовпадения трактовки tar headers: проверяются USTAR magic/version, checksum перед обработкой prefix, trailing slash только у directory, а также дубликаты всех entries. Это предотвращает принятие bytes, которые native tar прочитал бы иначе. Фактически deployed archive прошёл усиленный raw guard; публичные HTML/JS/CSS не менялись при усилении инструмента проверки.
