# Проверки перед выпуском визовых статусов

Изменения подготовлены локально. Founder отложил их выпуск до следующего спринта. Этот список не разрешает production-действия сам по себе.

## Исходная версия и комплект файлов

Базовая revision рабочей копии: `67f8c7c22862881ba33eac267217804fc4ec7818`. Изменения находятся в сохранённой интеграционной копии, а не в устаревшем checkout с unrelated native WIP. При интеграции сравнить текущую ветку с этой baseline; не применять весь архив поверх другой версии без проверки различий.

В комплект обязательно включить общий файл `06 Development/shared/content/visa-workflow-statuses.v1.json`. Backend и bot читают его относительно своего дерева `06 Development`; frontend включает его при сборке. Отдельная доставка только папки backend или bot без shared-файла не является полным релизом. До рестарта проверить чтение JSON от эффективного пользователя каждого сервиса и соответствие runtime/миграции.

## Оставшиеся условия

- [ ] Founder включает этот пакет в следующий спринт и подтверждает Git/production release gates; нынешнее поручение — только локальная подготовка.
- [ ] Сверить актуальный dirty diff; сохранить unrelated WIP, клиентские данные и визуальные артефакты.
- [ ] На изолированном PostgreSQL с восстановленной разрешённой копией проверить backup/checksum/restore и миграцию upgrade → downgrade → upgrade. SQLite не заменяет этот gate.
- [ ] Проверить rollback отказ до изменения схемы, когда присутствует любой новый код, и выбрать совместимый rollback приложения без потери новых записей.
- [ ] Проверить синтетического root и назначенного менеджера: выбор и сохранение всех новых этапов; неподтверждённый внешний текст не переводится автоматически.
- [ ] С VibeDiz выполнить одну ограниченную браузерную приёмку: две колонки и справки, сохранение raw-only правки, клиентский кабинет, мобильная читаемость. Не запускать пользовательские браузеры или автопроигрывание.
- [ ] При объединении с пакетом десяти языков добавить новые клиентские подписи в его delta, не переводя админку или тела услуг.
- [ ] Scope commit только по MANIFEST.json; исключить секреты, runtime JSON, node_modules, unrelated artifacts и native WIP.
- [ ] После разрешённого выпуска проверить deployed SHA, migration head `f3a9d2c6b810`, health, чтение shared JSON, representative admin/client/bot labels. Не рассылать клиентам тестовые сообщения.

## Целевые локальные проверки

Фактические проверки выполнены из изолированной рабочей папки; `DATABASE_URL=sqlite:///:memory:` исключает production-БД. Ниже переносимые команды повторения: SAFR_RELEASE_ROOT — checkout кандидата, SAFR_TEST_PYTHON — тестовый Python с установленными зависимостями, SAFR_NODE — проектный Node. Токены синтетические; предупреждения backend относятся к прежнему `datetime.utcnow()`.

Backend, 54 passed:

```sh
env ENVIRONMENT=local DATABASE_URL=sqlite:///:memory: SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin PYTHONPATH="${SAFR_RELEASE_ROOT}/06 Development/backend" "$SAFR_TEST_PYTHON" -m pytest -q "${SAFR_RELEASE_ROOT}/06 Development/backend/tests/test_visa_workflow_statuses.py"
```

Backend aggregate/permissions/notification regression, 5 passed:

```sh
env ENVIRONMENT=local DATABASE_URL=sqlite:///:memory: SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin PYTHONPATH="${SAFR_RELEASE_ROOT}/06 Development/backend" "$SAFR_TEST_PYTHON" -m pytest -q "${SAFR_RELEASE_ROOT}/06 Development/backend/tests/test_visa_lifecycle.py" -k 'aggregate or configured_root or forbidden_transition or published_update_notify'
```

Backend sanitized/sparse payload regression, 4 passed:

```sh
env ENVIRONMENT=local DATABASE_URL=sqlite:///:memory: SERVICE_API_TOKEN=test-service ADMIN_API_TOKEN=test-admin PYTHONPATH="${SAFR_RELEASE_ROOT}/06 Development/backend" "$SAFR_TEST_PYTHON" -m pytest -q "${SAFR_RELEASE_ROOT}/06 Development/backend/tests/test_visa_notification_safety.py" -k 'case_updated_payload_is_frozen or sparse_status_update or sparse_date_update or published_and_document_payloads'
```

Bot, 22 passed:

```sh
BOT_TOKEN=test-token ADMIN_CHAT_ID=1 PYTHONPATH="${SAFR_RELEASE_ROOT}/06 Development/bot" "$SAFR_TEST_PYTHON" -m pytest "${SAFR_RELEASE_ROOT}/06 Development/bot/tests/test_visa_cabinet.py" -q
```

Frontend, 8 passed; TypeScript typecheck passed. Рабочая папка `06 Development/react-app`:

```sh
"$SAFR_NODE" ./node_modules/typescript/bin/tsc -b --pretty false
"$SAFR_NODE" --import tsx --test tests/visa-editor-state.test.ts
```

`git diff --check` выполнен в integration repository и прошёл.
