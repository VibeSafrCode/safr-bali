# SAFRWAY — синхронизация Codex / GPT, 11.10.2026

Это аудит существующего состояния для продолжения разработки. Публичный выпуск нового каталога НЕ выполнялся. После аудита Founder разрешил синхронизацию документов и push/deploy; опубликованы только документы, не optional routing-plan code. Пакет сам не даёт аудитору разрешения на автоматическое применение рекомендаций, изменение цен или клиентские сообщения. Scope: [documentation sync](../DOCUMENTATION_SYNC_2026-10-11.md).

Читайте в таком порядке:

1. `CURRENT_IMPLEMENTATION_AUDIT_RU.md` — что действительно есть и опубликовано, архитектура и риски.
2. `ROUTE_ID_MAPPING.json` — все 94 позиции Бали, девять международных визовых намерений, 17 стран и Knowledge, сопоставленные с действующими идентификаторами.
3. `CURRENT_ROUTE_INVENTORY.json` — 463 реально собранных HTML-маршрута и 154 записи исходного Registry.
4. `LIVE_HTTP_SEO_QA.csv` / `.json` — свежие HTTP/SEO-наблюдения, не утверждение об индексации Google.
5. `CATALOG_IMPLEMENTATION_DIFF.md` — отдельный локальный черновик, не часть GitHub main или production.
6. `OPEN_DECISIONS_AND_NEXT_STEPS_RU.md` и `CHECK_RESULTS.json`.
7. `CODEX_GPT_SYNC_PROMPT_RU.md` — готовое задание независимому GPT-аудитору.

Исходный GitHub main на момент аудита и source baseline: `3659ba7c84ffb73a1be208c66834f3afb256c069`, свежий `git ls-remote` подтвердил его до синхронизации. Последующий documentation-only commit не меняет product source. Это не общий SHA всех работающих компонентов; точный текущий main сверять по Git history / publication receipt.

Свежий read-back публичных build-version:

- `safrway.online`: `67e293919781923b9606eedc925b07be977bc513`.
- `app.safrway.online`: `36fe5f9036b6c69cf587b31fc24d5e344c65ae39`.

В отдельно переданном архиве `BASELINE_SOURCES/` содержит разрешённые архитектурные исходники из точного baseline, а `LOCAL_CANDIDATE/` и `LOCAL_CANDIDATE.patch` — подготовленную незакоммиченную планировочную интеграцию. **На GitHub в этом audit folder только статические отчёты**; этих каталогов и draft-dependent генераторов здесь нет. Не смешивать archive-only кандидат с действующим продуктом.

В пакет не включены `.env`, токены, ключи, OTP, клиенты, паспортные файлы, production dumps, исторический приватный чат из входного архива, базы или защищённые документы. GPT получает только read-only данные и рекомендации, не доступ к production.

`NAV_SCREENSHOTS/STATUS.md`: rendered-проверка не выполнялась. Не запускались отдельные браузеры или профили пользователя.
