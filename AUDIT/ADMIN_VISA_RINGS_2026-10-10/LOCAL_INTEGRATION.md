# ADMIN-VISA-RINGS-20261010 — ограниченный выпуск

Состояние на фиксации кандидата: LOCAL_VERIFIED / RELEASE_GATE_PENDING. Последующие фактические результаты выпуска сохраняются отдельным receipt. Прочие остановленные продуктовые и security-задачи не включены.

## База и состав

- Production frontend и source: `67e293919781923b9606eedc925b07be977bc513`; версия прочитана из реального `build-version.json`, inventory статических файлов снят отдельно.
- Интеграционная Git main: `0fa3f0248fa57c1499dd4d55bdb4f957989e41ca`, свежая remote-сверка выполнена.
- Patch 03 SHA256: `b5c4fd143eff1525b64a9f123b011b76c77860d1416d0b98a7ebcc91ce935c06`. Все 7 переданных файлов совпали с handoff до дополнительного callback unit-теста 01.
- Между production и main есть два React Yoga preview-файла и shared policy. Они не входят в три production entry points Vite; runtime Yoga preview и самостоятельный Yoga artifact не обновляются этим выпуском. `.mjs` не изменён.

Runtime: `AdminServiceCountdown.tsx`, новый `AdminVisaTile.tsx`, минимальный mapping/import в `AdminVisaCRM.tsx`, React import в `AppIcon.tsx`, 7 строк `admin-life-tiles.css`. Проверки: два тестовых файла. Build-only: `shared/src/yoga-content-policy.d.mts`. Документация: этот отчёт, release checklist и история инцидентов. Backend/bot/API/RBAC/миграции/уведомления/клиентские даты/FX/прайсинг не меняются.

## Поведение и безопасность

В карточке клиента визы используют стиль жилья/байков и существующий `visaDatePresentation`. После въезда — `stay_end`; до въезда — `entry_deadline`; предварительная дата обозначена явно. Дни — календарные Asia/Makassar. Без конца или при неверной дате — «Дата уточняется», без выдуманного срока. Без начала — реальные дни без выдуманного процента. CANCELLED/REFUSED — без активного счётчика. EXPIRED с будущей/сегодняшней датой — «Проверьте дату».

Карточка остаётся `button type=button`, с тем же `onOpen={() => editCase(item)}` и объектом из `displayedVisaCases`. Рендер не вызывает callback и не записывает данные. `editCase`, `saveCase`, ids/version/idempotency/error handling/CSRF, серверный `_case_query`/`require_visa_write` и endpoint `/api/web/admin/visa-cases/{id}/aggregate` не изменены. Новых полей ответа, URL, ролей, запросов, raw HTML, логирования или хранения PII нет. React escaping проверен.

Существующий PWA получает HTML из сети; API не кэширует; hashed assets cache-first. Старые hashed assets сохраняются при переключении; immutable artifact остаётся доступным для отката. Конфиги сервера не меняются.

## Фактические проверки

| Проверка | Результат |
| --- | --- |
| Patch integrity и первоначальные 7 handoff hashes | PASS |
| `git apply --check`, `git diff --check` | PASS |
| Countdown, visa tile, life progress, date presentation | 22/22 PASS, включая identity/repeated callback и escaping |
| Полный `tsc -b` после declaration и теста | PASS; первоначальный TS7016 сохранён в истории |
| Production Vite build | Повторяется с final commit build id |
| Свежий 03 | SOURCE_ACCEPTED; rendered/click NOT_RUN |
| Свежий 77 | Дополнительных готовых правок нет; Yoga WIP DEFERRED |
| React source checklist | Общий clock, без новых effects/network/unsafe HTML; button/accessible label/reduced-motion |
| Existing-browser desktop/tablet/phone и edit-save-refresh | NOT_RUN; explicit Founder waiver 10.10.2026 |
| Exact-candidate security review 08 | PENDING, Git и activation отдельно |
| Git publication / production activation | PENDING после соответствующих gates |

## Ручная проверка владельцем после обновления

Открыть двух разных клиентов с разрешёнными данными; нажать разные визовые карточки; убедиться, что редактор показывает выбранную визу. Закрыть без сохранения. На desktop/tablet/phone проверить отсутствие наложения имени и круга, дату, missing/expired состояния. Сохранение и данные не менялись; браузерный сценарий не объявляется проверенным.

## Отдельные операции

Порученная реферальная коррекция проведена штатной транзакцией с аудитом и без перерасчёта начислений. Это не часть UI security approval. Legacy bot projection проверяется/синхронизируется отдельно; PII не помещается в Git. Кнопка `Mini App` подтверждена API read-back; ссылка сохранена.

Старые dirty/native/Admin-date/security ветки и private originals сохранены. Нет full checkout deploy, каталоговых публикаций, рассылок или обновления live Yoga bot.
