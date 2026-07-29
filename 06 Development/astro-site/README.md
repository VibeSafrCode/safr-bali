# SAFRWAY Astro public website

Локальный B4-кандидат публичного сайта. Он создаёт все 45 публичных
SEO-маршрутов как отдельные HTML-страницы. Next/Vinext сохраняется как
reference до отдельного production cutover.

Контракт:

- Astro public routes: `45/45`;
- React application routes: `2/2`;
- ecosystem: `47/47`;
- `/account/` в Astro не создаётся и относится к one-hop redirect contract.

Astro и React читают один content-addressed runtime catalog snapshot из
`../shared/content/generated/catalog-runtime.v1.json`.

Все семь визовых страниц имеют независимый source-aware status. D12, D1/D2,
C1, eVOA и «Другая виза» проверены; E33G и общий каталог остаются
`needs_review`. Весь визовый раздел сохраняет `noindex` и не входит в sitemap
до отдельного SEO/cutover-решения.

Сайт имеет минимальный клиентский JavaScript только для формы связи с
менеджером. Каталог, тексты и ссылки остаются полностью доступными без
JavaScript. Скрипт не меняет overflow страницы и не блокирует прокрутку.

Команды:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run test:browser
pnpm run test:lighthouse
```

`catalog:generate` читает framework-neutral source и legacy content-файлы
репозитория, сохраняет смысл и создаёт детерминированный snapshot. Production
API и database при сборке не используются.
