# SAFR Bali — Architecture

## Назначение документа

Этот файл описывает техническую архитектуру проекта SAFR Bali / Na Bali Team.

Проект строится как Telegram-first экосистема: сначала Telegram-бот и заявки, затем SAFR Club, Mini App, сайт, партнёры, исполнители, выплаты и токенизация.

## Основной принцип

Бот, Mini App и сайт должны работать с одной базой данных и одним backend.

Нельзя делать отдельную логику для бота, отдельную для сайта и отдельную для Mini App. Иначе проект быстро станет сложным для поддержки.

## Главные части системы

### 1. Telegram Bot

Основной интерфейс первого запуска.

Задачи:
- регистрировать пользователя;
- принимать заявки;
- фиксировать рефералов;
- показывать баланс SAFR Points;
- показывать реферальную ссылку;
- показывать QR-код;
- отправлять заявки админу;
- позволять админу менять статусы;
- позволять админу начислять Points.

### 2. Backend

Центральная логика проекта.

Рекомендуемый стек:
- Python;
- FastAPI;
- REST API;
- PostgreSQL.

Backend отвечает за:
- пользователей;
- услуги;
- заявки;
- рефералов;
- SAFR Points;
- правила начислений;
- историю операций;
- админские действия.

### 3. Database

Главное хранилище данных.

Минимальные таблицы:
- users;
- services;
- orders;
- partner_modes;
- referrals;
- reward_rules;
- points_ledger;
- admin_actions.

Главное правило:
points_ledger является источником правды по баллам.

### 4. Telegram Mini App

Будущий красивый кабинет внутри Telegram.

Функции:
- профиль;
- баланс;
- история начислений;
- QR-код;
- реферальная ссылка;
- услуги;
- заявки;
- статусы.

### 5. Website

Сайт нужен для доверия, SEO и внешнего трафика.

Страницы первой версии:
- главная;
- визы;
- продление визы;
- консультация;
- soft landing;
- партнёрская программа;
- контакты.

Главная кнопка сайта:
Открыть SAFR в Telegram.

## Приоритет разработки

1. Backend + Database.
2. Telegram Bot.
3. Admin Bot внутри Telegram.
4. SAFR Club.
5. Mini App.
6. Website.
7. Marketplace Lite.
8. Executors / Tasks.
9. TON integration.
10. SAFR Token.

## MVP-фокус

Первый запуск должен решить 5 задач:

1. Пользователь заходит в бота.
2. Пользователь оставляет заявку.
3. Админ видит заявку.
4. Реферал фиксируется.
5. SAFR Points начисляются вручную после подтверждения админом.

## Что пока не делаем

В первый MVP не входит:
- полноценный marketplace;
- автоматические выплаты;
- токен;
- DEX;
- сложная CRM;
- веб-админка;
- SEO-блог;
- мультиязычность.

Эти элементы заложены в Roadmap, но не блокируют первый запуск.

---

## Future Channel Expansion: VK

MVP starts with Telegram as the main interface.

However, the project should be designed with future multi-channel expansion in mind.

Planned future channels:
- Telegram Bot;
- VK Bot / VK Community messages;
- Website forms;
- possibly WhatsApp / Instagram / email later.

Important architectural principle:

A user is not equal to a Telegram account.

A user is a person/client in the SAFR system. Telegram, VK and other messengers are only communication channels connected to that user.

For MVP, users can be created from Telegram only. Later, additional channel identity tables may be added, for example:

- user_channel_accounts;
- channel_type: telegram / vk / website / whatsapp;
- external_user_id;
- username;
- linked_user_id.

Do not hardcode business logic only around Telegram if it can be avoided.

