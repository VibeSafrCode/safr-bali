# Yoga Ganster within SAFRWAY

Yoga Ganster — часть SAFRWAY с отдельной RU/EN оболочкой. Услуги, утверждённые
визовые тексты и гайды читаются из общего каталога и Registry. Отдельного прайса,
формулы FX или копии бизнес-услуг у бренда нет.

Yoga Ganster is part of SAFRWAY, with its own RU/EN presentation. It shares the
service catalog, approved Registry content and pricing bindings. It does not
maintain a separate price list, FX formula or duplicate business services.

Отдельный приватный репозиторий:
[VibeSafrCode/yoga-ganster](https://github.com/VibeSafrCode/yoga-ganster).
Он содержит brand contract, build adapter и Git submodule с точным source pin,
а не независимую копию каталога. Общий код RU/EN страниц опубликован в
integration-ветке SAFRWAY на `c22f68e`; основной `main` и production не заменены.

The private companion repository contains the brand contract, build adapter
and an exact Git submodule pin. Common RU/EN source is published at `c22f68e`
in the SAFRWAY integration branch. This does not merge or deploy the main site.

## Preview and live services

Видимое имя — `Yoga Ganster`; стабильный внутренний ID — `york-gangster`.
Принадлежность SAFRWAY указана в общем brand contract и footer всех страниц.
По умолчанию проект продолжает собирать обычный SAFRWAY; preview включается явно.

The display name is `Yoga Ganster`; the stable internal ID is `york-gangster`.
SAFRWAY remains the default build. The preview is selected explicitly and uses
separate source and output directories.

RU/EN страницы «Услуги», «О проекте», «Материалы» и «Контакты» содержат статический
HTML. Услуги ссылаются только на действительно собираемые страницы. Материалы —
существующие статьи SAFRWAY, а не вымышленные авторские истории или отзывы.
Демонстрационная форма работает только в памяти открытой страницы.

The RU/EN Services, About, Guides and Contact pages render static HTML. Service
links point only to pages included in the actual build. Guides reuse existing
SAFRWAY articles rather than fabricated personal stories or reviews. The enquiry
demo changes only the in-memory state of the open page.

Реальные аккаунты, партнёрская атрибуция, Telegram transport, Points и выплаты
не подключены. Live FX projection в автономном preview не загружается: цена
не выдумывается. Постоянный домен пока не выбран; `siteOrigin` остаётся `null`.
Noindex защищает индексацию, но не заменяет контроль доступа.

Live accounts, referral attribution, Telegram transport, Points and payouts are
not connected. Offline preview does not load a live FX projection or invent a
price. No permanent domain is selected; `siteOrigin` remains `null`. Noindex is
not an access-control mechanism.

## Source directories

| Purpose | Path under `06 Development` |
| --- | --- |
| Brand contract and platform relationship | `shared/brands/preview-brands.v1.json` |
| Shared routes and opt-in safeguards | `shared/src/preview-brand.mjs` |
| Public RU/EN pages | `astro-site/src-york/` |
| Static information-page projection | `astro-site/src-york/lib/information.ts` |
| Synthetic accounts and bot | `react-app/src/york-preview/` |
| Build, package and read-only local server | `astro-site/scripts/*york-preview*.mjs` |
| Critical preview contracts | `astro-site/tests/york-preview/` |

## Build and critical checks

From `06 Development/astro-site`, using the configured Node runtime:

```sh
node scripts/build-york-preview.mjs
node scripts/check-york-preview.mjs
node scripts/serve-york-preview.mjs 4380
```

Не запускать новый сервер, если существующий уже обслуживает порт 4380.
Сборка обновляет отдельный `dist-york-preview`; не нужно запускать дополнительный
браузер или профиль. Посторонний native WIP не включается в preview.

Do not start another server when the existing one already serves port 4380.
The build updates the separate `dist-york-preview`. Do not launch another browser
or profile. Unrelated native work is excluded.

## Release boundaries

Git publication, private HTTPS preview and a live production site are separate
gates. A new domain does not automatically enable real accounts, messages,
commercial calculations or public indexing. Domain setup must preserve the
existing main SAFRWAY runtime and its rollback artifacts.

Exact previous HTTPS evidence: [YG2 release](../../AUDIT/YORK_YG2_LOCAL_2026-10-08/README.md).
That release does not include subsequent local content changes automatically.
