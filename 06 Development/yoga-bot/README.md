# Yoga Ganster Telegram runtime

Отдельный runtime для `@Yoga_ganster_bot`, интегрируемый основной беседой проекта «01 — БалиЛоки». Текущий продуктовый режим — **`shared_intake`**: клиент пишет обычный текст в Yoga, backend сохраняет один общий диалог SAFRWAY и создаёт доставки Михаилу и действующей команде. Публичный ответ менеджера возвращается в исходный Yoga-чат. Михаил получает уведомление только для просмотра; штатные reply/history/internal-note controls остаются у команды в основном боте.

Пакет реализует Telegram adapter, клиент узкого `/api/yoga-channel` и приватный журнал контекста повторов. Canonical backend, его миграция, website handoff и main-bot adapter принадлежат основной интеграции. Эта поставка проверена **offline**; live Telegram, запуск unit и production release не выполнены. Локальные тесты сами по себе не подтверждают готовность всего сервиса.

## Режимы

| `YOGA_MVP_MODE` | Поведение |
| --- | --- |
| `shared_intake` | Утверждённый сценарий: RU/EN, каталог, текстовый вопрос в Yoga, canonical receipt и собственные observer/client deliveries |
| `service_links` | Прежний режим: каталог и обычная ссылка в основной SAFRWAY-бот; сообщение в Yoga не сохраняется |
| `welcome_links` | Прежний режим: RU/EN и ссылка на сайт |

Режим задаётся явно, без fallback. Link modes не заменяют требуемый общий intake. Кабинет, создание User/lead/order, реферальная привязка, Points, цены и начисления этим runtime **не реализованы**. /start и меню не регистрируют пользователя и не меняют пригласившего. Backend может связать уже известного User по своей канонической политике; runtime не создаёт вторую базу клиентов.

## Общий каталог

Источник service routes и RU/EN названий — `../shared/content`:

- `service-registry.v1.json`: устойчивые content IDs, published legacy routes, revisions и pins.
- `generated/i18n/public.v1.json`: RU/EN названия опубликованных legacy страниц.
- `registry-*-build.v1.json`: новые ссылки только при `indexable: true`, actual PASS и всех пяти `publicationGates: true`.
- `registry-copy/`: SHA-256 body/metadata pins; новые кнопки берут только `h1` из согласованных metadata.

Rendered RU `sourceRevision` связывается с Registry. `approvedSourceRevision` в full-payload пакетах может быть pin исходного Founder Markdown и не заменяет rendered revision. EN должен относиться к текущему rendered revision, иметь complete/QA и совпадать с projection pins. Цены и текст услуг не копируются в бот. Legacy published route — отдельное основание ссылки, а не проверка доступности услуги.

Меню включает услуги и hub/guide страницы, использует Yoga origin и канонические RU/EN пути. При публикации новой услуги обновляйте общий Registry и перезапускайте только Yoga service с согласованным website/Registry выпуском. Каталог читается при старте процесса.

## Intake и источник обращения

Обрабатываются только private chats, где фактический sender равен chat ID. Непустой обычный текст до 4000 символов сохраняется целиком, без strip/перефразирования и без message rate limiter. Медиа, в том числе подпись к медиа, не сохраняются: бот прямо пишет «сообщение не передано» и предлагает обычный текст. Голосовые, фото, видео, документы и прочие non-text updates имеют статус **NOT_IMPLEMENTED**.

`/start svc_<contentId>` принимает синтаксис до 64 символов. Темой становится известный уникальный ID общего Registry (до 60 символов), включая Family, Knowledge, Partners и страницы вне меню услуг; неизвестный означает `general`. Для этого отдельно читаются только IDs: schema v1, не более 1000 records и 20 MB, некорректные/повторные IDs останавливают startup. Это контекст, **не публикация ссылки, authentication/referral/role grant**. Publication gates и состав меню `load_catalog` остаются прежними. Смена темы начинает новый conversation context; исходные параметры отправленного update сохраняются для точного повтора. Backend задаёт trusted brand, разрешённых recipients и безопасный topic label. Arbitrary slug не становится HTML marker.

Перед POST журнал фиксирует update ID, HMAC ключ actor, topic, locale и исходный optional conversation ID. HTTP retry передаёт тот же exact update/payload. Backend принимает сообщение, idempotency receipt и recipient deliveries одной транзакцией. Только после валидного receipt и записи принятия в журнал бот сообщает «обращение сохранено». Ошибка UI ACK после принятия не отменяет canonical message. Сбой backend/journal до принятия останавливает poller до следующего подтверждающего offset; aiogram не должен проглатывать такую ошибку.

Ошибки callback ACK и редактирования меню — отдельный best-effort UI; они не блокируют следующие вопросы. Меню имеет paging/back/home и RU/EN переключатель. Media, неизвестные команды и недоступный кабинет не получают ложного подтверждения сохранения.

## Собственный delivery worker

Worker использует тот же **Yoga Bot instance**, отдельный Yoga API principal и claim по одному target. Он не запускает SAFRWAY `app.main`, backfill, global outbox/bridge, main token или staff adapter и не открывает БД. Yoga принимает только `observer`/`client`, запрещает staff controls, проверяет server brand/marker/read-only scope и не принимает request-controlled destination.

Observer notice содержит marker, стабильный `#conversation_id` и, если сервер передал optional `author_type`, «Вопрос»/«Ответ» либо Question/Reply. Текст на выбранном RU/EN языке прямо говорит: **«Только просмотр; ваш ответ создаёт новую заявку» / «Read-only; your reply creates a new request»**. Ответ Михаила этому сообщению не является ответом клиенту. Нет reply/history/note кнопок. При 4000-символьном body сокращается только display marker; номер, предупреждение и полный canonical body сохраняются. Body/labels HTML-escaped. По умолчанию observer notice RU; сохранённый выбор языка применяется к следующим уведомлениям.

Lease — 60 секунд. Перед send требуется не менее 25 секунд остатка; send выполняется один раз с ограниченным timeout. DELIVERED записывается только после положительного Telegram message ID. Definitive blocked/bad recipient даёт FAILED. Telegram RetryAfter даёт разрешённый pre-send RETRY и provider cooldown; invalid bot credential даёт pre-send RETRY и обязательно останавливает runtime для оператора. Generic timeout/connection loss после начала send означает UNKNOWN, без слепого повтора. HTTP settlement retry повторяет exact lease/outcome/message ID и **не повторяет Telegram send**. Потерянный claim/settlement и истёкшая lease обрабатываются backend как UNKNOWN. Пять попыток и backoff принадлежат backend.

Это ambiguity-safe доставка с дедупликацией intake, **не exactly-once Telegram**. UNKNOWN требует ручной сверки основной командой. Provider cooldown не хранится отдельно между рестартами; canonical retry budget сохраняется backend.

## Приватный журнал и восстановление

`YOGA_STATE_DIRECTORY` содержит только operational metadata. Директория принадлежит Yoga user, `0700`; `context.key` и `context.json` — `0600`. Используются random 32-byte key, HMAC-SHA256 actor key, atomic replace, file fsync и directory fsync. В журнале нет текста обращения, raw Telegram IDs, токенов, User/lead/referral/price records. Conversation/update IDs и HMAC metadata тоже private: их не копируют в Git, AUDIT или чат.

Формат ограничен 5 MB, 2000 actors, 10000 updates. Accepted metadata и inactive actor context сохраняются 48 часов; **unaccepted records не вытесняются и не истекают**. Переполнение, corruption, небезопасные permissions/symlinks и отсутствующий key существующего journal прекращают intake до проверки оператором. Silent reset/re-key запрещён.

Журнал сохраняет exact retry context, но **не тело сообщения**. После сбоя повтор возможен только пока Telegram снова выдаёт исходный update с текстом. Это не самостоятельная durable очередь. Длительная недоступность backend за пределами upstream replay/retention может потребовать ручного восстановления. Не обещать сохранность обращения без canonical receipt и не удалять journal для «починки». Backup/restore выполняется через закрытый operator flow для согласованной пары key+journal; source archive не содержит эту пару. Canonical сообщения остаются в общей БД.

## Offline проверка

Python 3.10+; проверено на 3.12. В отдельном virtualenv установить `requirements.txt`, затем из этого пакета:

```sh
python -m unittest discover -s tests -v
python -m yoga_bot.check_catalog --shared-root ../shared/content --site-origin https://yoga.example.org
```

Синтетический origin не публикует сайт. Тесты используют synthetic IDs, fake Telegram session и httpx MockTransport; не требуют токенов, .env, сети, сервера или браузера. Проверяются transport isolation, actual polling offset boundary, exact retry после потерянного receipt/restart, исходный topic/conversation, media rejection, UI failure, HTML escaping, observer RU/EN reference, claim scope, ambiguity и private journal permissions/corruption/capacity.

Frozen API: repository packet `AUDIT/YOGA_CHANNEL_2026-10-09/API_CONTRACT.json`. Runtime evidence: `AUDIT/SHARED_INTAKE_2026-10-09/` внутри этого пакета. Optional claim поле `author_type: client|staff` принято по согласованию основной интеграции; отсутствие поля сохраняет совместимость.

## Конфигурация оператора

Шаблоны: `deploy/yoga-bot.env.example` и `deploy/yoga-gangster-bot.service`. Секреты вводит оператор через закрытый flow; не отправлять их в чат, shell arguments, Git, AUDIT или логи. Не читать/печатать реальные environment файлы для проверки.

| Переменная | Назначение |
| --- | --- |
| `YOGA_BOT_TOKEN` | Только Telegram token Yoga; main BOT_TOKEN игнорируется |
| `YOGA_MVP_MODE` | Для текущего выпуска явно `shared_intake` |
| `YOGA_SITE_ORIGIN` | Доступный с телефона HTTPS origin без path/query/fragment/credentials; public domain вместо localhost/IP |
| `YOGA_SERVICE_API_TOKEN` | Отдельный Yoga API credential, согласованный с backend; без main/admin fallback и отправки в browser |
| `YOGA_BACKEND_API_ORIGIN` | HTTPS bare origin либо явный HTTP `127.0.0.1[:port]`; no redirects/environment proxy |
| `YOGA_STATE_DIRECTORY` | Абсолютный private persistent path; default `/var/lib/yoga-gangster-bot` |
| `YOGA_SHARED_CONTENT_ROOT` | Read-only каталог конкретного website/Registry выпуска |
| `YOGA_RUNTIME_LOCK` | Собственный `/run/yoga-gangster-bot/instance.lock` |
| `YOGA_MANAGER_BOT_USERNAME` | Только прежний `service_links`; в shared intake команда отвечает здесь |

Backend service credential имеет 32–256 ASCII letters/digits/underscore/hyphen. Main/admin credentials runtime не читает; отличность контролирует также backend principal gate. Купленный домен не нужен: HTTPS адрес может быть выдан существующей инфраструктурой. Изменение origin не создаёт DNS и не публикует сайт; RU/EN страницы оператор проверяет с телефона.

## Выпуск и откат — основной оператор

1. Зафиксировать contract, package revision, website/Registry pair и public origin. Выполнить offline tests/preflight. Отдельно основная беседа проверяет backend transaction/ACL, observer identity, staff recipients, migration/backup/restore и main/web adapters.
2. Проверить `@Yoga_ganster_bot` и одного poller owner. Local lock не обнаруживает другой сервер. Непустой webhook останавливает запуск; автоматического deleteWebhook/drop pending updates нет.
3. Подготовить user/group `yoga-bot`, virtualenv `/opt/yoga-bot/venv`, versioned package и `/opt/yoga-bot/current`. Source/Registry read-only. Не давать доступ к main environment/private files. systemd создаёт отдельные RuntimeDirectory и StateDirectory с `0700`.
4. Через safe credential flow подготовить root-owned `/etc/yoga-bot/runtime.env`, `0600`, только Yoga variables. systemd читает файл до смены пользователя. StateDirectory сохраняется при restart/rollback. После crash проверить private key+journal pair, не удалять её.
5. После общего release gate и backend migration оператор включает backend Yoga feature с отдельным credential и проверенными numeric observer/staff destinations. Михаил должен разрешить уведомления своим /start; username не заменяет identity verification и не выдаёт SUPPORT/staff права.
6. Только по разрешению основной беседы активировать Yoga unit. Startup обращается к getMe/getWebhookInfo, затем начинает реальные polling/claim. `runtime_ready` — preflight/identity check, не end-to-end proof.
7. Выполнить согласованный controlled test оператора: RU/EN, approved svc context, текст → один canonical dialogue/message → observer copy и existing main staff controls → public staff reply в исходный Yoga chat. Internal note не должна попасть Михаилу/клиенту. Media получает явный отказ; нет legacy duplicate outbox. Реальная проверка отдельно разрешается и в этом пакете не выполнена.
8. Rollback: остановить **только Yoga unit**, вернуть compatible previous package/Registry pair и сохранить StateDirectory/canonical history. Не возвращаться автоматически в link-only mode вопреки обещанному intake. Backend/main/web rollback с сохранением additive tables/history ведёт основная беседа. Runtime не содержит миграции и не выполняет schema downgrade. Не переигрывать DELIVERED/UNKNOWN и подтверждённые Telegram updates.

`RestartPreventExitStatus=2` требует operator review при неверной конфигурации/identity/webhook/owner conflict, journal corruption/capacity и rejected/malformed contract. Временный transport outage получает exit 1 без подтверждения неподтверждённого update для service restart с исходным metadata. Unit ограничивает restart bursts. При обновлении aiogram снова проверить polling override и fake transport tests.

Логи содержат фиксированные коды (`runtime_ready`, `intake_ack_failed`, `yoga_ui_delivery_failed`, `intake_requires_operator_review`, `yoga_delivery_unknown`). Vendor logs/warnings подавляются; raw exceptions/tracebacks, bodies, Telegram IDs, lease tokens, start payload и credential URLs не выводятся.
