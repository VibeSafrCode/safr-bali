# SAFR Bali — Database Schema

Актуализировано: 2026-07-27.

## Production-дополнение

К исходным MVP-таблицам добавлена таблица `bot_runtime_events`.

Она хранит append-only события Telegram-контура:

- сообщение клиента;
- ответ менеджера;
- внутреннюю заметку;
- сообщение staff-чата.

Основные поля:

- `id`;
- `source_key` — идемпотентный ключ legacy-миграции;
- `client_telegram_id`;
- `actor_telegram_id`;
- `event_type`;
- `text`;
- `payload`;
- `created_at`.

Переходная dual-write модель сохраняет JSON как отказоустойчивый fallback и
зеркалирует события в PostgreSQL. Клиентские сообщения и внутренние сообщения
команды остаются логически разделёнными.

## Назначение документа

Этот файл описывает минимальную структуру базы данных для MVP проекта SAFR Bali / Na Bali Team.

База данных должна обслуживать:

- Telegram-бота;
- заявки клиентов;
- услуги;
- реферальную систему;
- SAFR Points;
- партнёрские режимы;
- админские действия;
- будущий Mini App;
- будущий сайт.

Главный принцип:

> Сначала делаем базу под заявки, рефералов, баллы и админку. Остальное добавляем позже.

---

## 1. users

Таблица пользователей.

В неё попадают все, кто зашёл в Telegram-бота: клиенты, партнёры, админы, будущие исполнители.

### Поля

- id
- telegram_id
- username
- first_name
- last_name
- language
- phone
- role
- ref_code
- invited_by_user_id
- partner_mode_id
- status
- created_at
- updated_at

### Зачем нужна

Чтобы хранить каждого пользователя, понимать, кто его пригласил, какой у него партнёрский режим, какой баланс и какие заявки.

---

## 2. services

Таблица услуг.

### Поля

- id
- name
- slug
- category
- description
- is_active
- can_pay_with_points
- admin_comment
- created_at
- updated_at

### Примеры услуг

- Оформить визу
- Продлить визу
- Консультация
- Подбор жилья
- Трансфер
- Байк
- Soft Landing
- Другое

### Зачем нужна

Чтобы админ мог управлять услугами, включать/выключать их и задавать начисления по каждой услуге.

---

## 3. orders

Таблица заявок / заказов.

### Поля

- id
- user_id
- service_id
- status
- client_comment
- admin_comment
- amount_usd
- payment_status
- paid_at
- completed_at
- cancelled_at
- created_at
- updated_at

### Статусы заявки

- new
- contacted
- waiting_payment
- paid
- in_progress
- completed
- cancelled
- refunded

### Зачем нужна

Чтобы фиксировать все заявки клиента: что он заказал, на каком этапе находится, оплатил ли, завершена ли услуга.

---

## 4. partner_modes

Таблица партнёрских режимов.

### Поля

- id
- name
- slug
- description
- is_active
- created_at
- updated_at

### Режимы

- Direct
- Balanced
- Network

### Зачем нужна

Чтобы пользователь мог выбрать стратегию начислений: больше за прямого клиента или меньше, но с глубиной сети.

---

## 5. reward_rules

Таблица правил начислений.

### Поля

- id
- service_id
- partner_mode_id
- level_1_points
- level_2_points
- level_3_points
- valid_from
- valid_to
- is_active
- created_by_admin_id
- created_at

### Зачем нужна

Чтобы админ мог менять правила начислений по услугам и режимам.

Главное правило:

> Старые начисления не пересчитываются. Новые правила действуют только на новые заявки.

---

## 6. referrals

Таблица реферальных связей.

### Поля

- id
- parent_user_id
- child_user_id
- level
- source
- created_at

### Зачем нужна

Чтобы понимать, кто кого пригласил, и строить цепочку начислений на 1, 2 и 3 уровня.

---

## 7. points_ledger

Главная таблица SAFR Points.

### Поля

- id
- user_id
- operation_type
- amount
- balance_after
- order_id
- service_id
- referral_level
- reward_rule_id
- comment
- created_at
- created_by_admin_id

### Типы операций

- referral_reward
- manual_add
- manual_subtract
- order_payment
- refund
- correction
- bonus

### Зачем нужна

Это источник правды по баллам.

Баланс пользователя можно хранить отдельно для скорости, но юридически и логически главным источником должна быть история операций.

---

## 8. admin_actions

Таблица действий админа.

### Поля

- id
- admin_user_id
- action_type
- entity_type
- entity_id
- comment
- created_at

### Примеры действий

- изменил статус заявки
- подтвердил оплату
- начислил баллы
- списал баллы
- изменил правило начисления
- отключил услугу
- добавил услугу

### Зачем нужна

Чтобы видеть, кто и когда изменил важные данные.

---

## 9. payments

Таблица оплат.

На MVP можно сделать упрощённо, но лучше заложить сразу.

### Поля

- id
- order_id
- user_id
- amount
- currency
- payment_method
- status
- external_payment_id
- created_at
- paid_at
- refunded_at

### Статусы

- pending
- paid
- failed
- refunded
- cancelled

### Зачем нужна

Чтобы отделить заявку от оплаты. Одна заявка может быть создана раньше оплаты.

---

## 10. Минимальный MVP-набор таблиц

Для первого запуска обязательно нужны:

1. users
2. services
3. orders
4. partner_modes
5. reward_rules
6. referrals
7. points_ledger
8. admin_actions

Желательно сразу добавить:

9. payments

---

## 11. Главное правило архитектуры базы

Нельзя просто хранить число “баланс пользователя” без истории.

Правильная логика:

1. Произошло действие.
2. Создалась запись в points_ledger.
3. У пользователя изменился баланс.
4. В истории видно, почему и когда это произошло.

---

## 12. Что не добавляем в MVP

Пока не добавляем:

- providers;
- executors;
- tasks;
- listings;
- payouts;
- wallets;
- token_operations;
- reviews;
- marketplace_categories.

Эти таблицы нужны позже, когда появятся исполнители, каталог, выплаты и токен.
