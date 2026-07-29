# SAFR Bali — API Spec

Актуализировано: 2026-07-29.

## Production Mini App API v0.8.0

Подготовлены:

- `POST /mini-app/auth/session` — HMAC-проверка `initData`, проверка
  `auth_date`, создание access/refresh session;
- `POST /mini-app/auth/refresh` — ротация refresh token;
- `POST /mini-app/auth/logout` — отзыв сессии и очистка cookies;
- `GET /mini-app/me` — профиль только по действующей серверной access session.

Access cookie: 30 минут. Refresh cookie: 30 дней. Cookies `HttpOnly`,
`SameSite=Lax`, а в production также `Secure`. Backend хранит hashes токенов,
не исходные значения.

Контракт развёрнут в production на commit `39dd069`, schema
`b3f28c7a91d0`. Legacy `Authorization: tma <initData>` не является основным
browser session flow.

## Реально работающие дополнительные API

Помимо исходного MVP ниже, в production используются:

- `GET /health`;
- `GET /db/health`;
- `GET /users/by-telegram/{telegram_id}/dashboard`;
- `GET /mini-app/me` с заголовком `Authorization: tma <Telegram initData>`;
- `POST /bot-events` с service-token;
- `GET /bot-events/{client_telegram_id}` с service-token.

`/mini-app/me` проверяет HMAC-подпись Telegram и срок `auth_date`, затем
возвращает только профиль текущего пользователя, баланс, реферальную ссылку,
число прямых приглашённых и его заявки.

Публичный frontend обращается к API через `https://api.safrway.online`.
Bot token, service-token и admin-token во frontend не передаются.

Следующий API-этап: каталог направлений/услуг и создание заявки из Mini App с
полным route context.

## Назначение документа

Этот файл описывает минимальный API для MVP проекта SAFR Bali / Na Bali Team.

API нужен, чтобы Telegram-бот, будущий Mini App, сайт и админка работали с одной базой данных и одной бизнес-логикой.

Главный принцип:

> Backend является центром системы. Бот, Mini App и сайт не должны хранить отдельную бизнес-логику.

---

## 1. Основные группы API

В MVP нужны следующие группы API:

1. Users API
2. Services API
3. Orders API
4. Referrals API
5. SAFR Points API
6. Partner Modes API
7. Reward Rules API
8. Admin API
9. Payments API

---

## 2. Users API

### POST /users/register

Создать или обновить пользователя после входа в Telegram-бота.

### Request

- telegram_id
- username
- first_name
- last_name
- language
- ref_code

### Response

- user_id
- telegram_id
- ref_code
- invited_by_user_id
- role
- status

### Зачем нужно

Когда человек впервые заходит в бота, система должна сохранить его Telegram ID, создать профиль и зафиксировать, пришёл ли он по реферальной ссылке.

---

### GET /users/{user_id}

Получить профиль пользователя.

### Response

- id
- telegram_id
- username
- first_name
- role
- partner_mode
- status
- created_at

---

### GET /users/{user_id}/balance

Получить баланс SAFR Points пользователя.

### Response

- user_id
- balance_points
- internal_discount_usd

---

## 3. Services API

### GET /services

Получить список активных услуг.

### Response

- id
- name
- slug
- category
- description
- can_pay_with_points

---

### GET /services/{service_id}

Получить одну услугу.

---

### POST /admin/services

Создать услугу.

Только для админа.

---

### PATCH /admin/services/{service_id}

Изменить услугу.

Только для админа.

---

## 4. Orders API

### POST /orders

Создать заявку.

### Request

- user_id
- service_id
- client_comment
- amount_usd

### Response

- order_id
- status
- created_at

### Зачем нужно

Когда клиент выбирает услугу в боте, бот создаёт заявку через backend.

---

### GET /orders/{order_id}

Получить заявку.

---

### GET /users/{user_id}/orders

Получить заявки пользователя.

---

### PATCH /admin/orders/{order_id}/status

Изменить статус заявки.

Только для админа.

### Request

- status
- admin_comment

### Возможные статусы

- new
- contacted
- waiting_payment
- paid
- in_progress
- completed
- cancelled
- refunded

---

## 5. Referrals API

### GET /users/{user_id}/referral-link

Получить реферальную ссылку пользователя.

### Response

- user_id
- ref_code
- referral_link

---

### GET /users/{user_id}/qr-code

Получить QR-код пользователя.

### Response

- user_id
- qr_code_url
- referral_link

---

### GET /users/{user_id}/referrals

Получить список приглашённых пользователей.

### Response

- level_1
- level_2
- level_3

---

## 6. Partner Modes API

### GET /partner-modes

Получить список партнёрских режимов.

### Response

- Direct
- Balanced
- Network

---

### PATCH /users/{user_id}/partner-mode

Изменить партнёрский режим пользователя.

### Request

- partner_mode_id

### Важно

Режим влияет только на будущие начисления. Старые начисления не пересчитываются.

---

## 7. Reward Rules API

### GET /reward-rules

Получить актуальные правила начислений.

### Response

- service_id
- partner_mode_id
- level_1_points
- level_2_points
- level_3_points
- valid_from

---

### POST /admin/reward-rules

Создать новое правило начислений.

Только для админа.

### Request

- service_id
- partner_mode_id
- level_1_points
- level_2_points
- level_3_points
- valid_from

### Важно

При создании нового правила старое правило закрывается через valid_to.

---

## 8. SAFR Points API

### Общий idempotency contract

Общий ручной endpoint `POST /points/accrue` требует header:

`Idempotency-Key: <уникальный ключ операции>`

- повтор с тем же ключом и тем же payload возвращает прежнюю операцию;
- повтор с тем же ключом и изменённым payload возвращает `409`;
- пустой или состоящий из пробелов ключ отклоняется;
- referral reward дополнительно защищён уникальностью одного начисления на
  один заказ;
- header не является токеном и не должен содержать чувствительные данные.

### GET /users/{user_id}/points-ledger

Получить историю операций SAFR Points.

### Response

- operation_type
- amount
- balance_after
- order_id
- referral_level
- reward_rule_snapshot
- comment
- created_at

---

### POST /admin/points/manual-add

Ручное начисление SAFR Points.

Только для админа.

### Request

- user_id
- amount
- comment

---

### POST /admin/points/manual-subtract

Ручное списание SAFR Points.

Только для админа.

### Request

- user_id
- amount
- comment

---

### POST /admin/orders/{order_id}/confirm-reward

Подтвердить начисление бонусов по заявке.

Только для админа.

### Что делает

1. Проверяет заказ.
2. Проверяет статус.
3. Находит реферальную цепочку.
4. Находит актуальное reward_rule.
5. Создаёт операции в points_ledger.
6. Обновляет балансы пользователей.

---

## 9. Payments API

### POST /payments/create

Создать оплату по заявке.

### Request

- order_id
- user_id
- amount
- currency
- payment_method

### Response

- payment_id
- status
- payment_url

---

### POST /payments/webhook

Webhook от платёжной системы.

### Что делает

1. Получает статус оплаты.
2. Проверяет подпись платежа.
3. Обновляет payment_status.
4. Обновляет order status, если оплата прошла.

---

## 10. Admin API

### GET /admin/orders/new

Получить новые заявки.

---

### GET /admin/orders

Получить все заявки.

---

### GET /admin/users

Получить пользователей.

---

### GET /admin/users/{user_id}

Получить карточку пользователя.

---

### GET /admin/ledger

Получить журнал SAFR Points.

---

### GET /admin/actions

Получить действия админа.

---

## 11. Минимальный API для первого запуска

Для самого первого MVP обязательно реализовать:

1. POST /users/register
2. GET /services
3. POST /orders
4. PATCH /admin/orders/{order_id}/status
5. GET /users/{user_id}/referral-link
6. GET /users/{user_id}/balance
7. GET /reward-rules
8. POST /admin/orders/{order_id}/confirm-reward
9. GET /users/{user_id}/points-ledger

---

## 12. Что пока не делаем

В MVP пока не нужны:

- API для marketplace;
- API для исполнителей;
- API для заданий;
- API для выплат;
- API для TON Connect;
- API для SAFR Token;
- API для отзывов;
- API для рейтингов;
- API для сложной CRM.

Эти блоки появятся позже по Roadmap.
