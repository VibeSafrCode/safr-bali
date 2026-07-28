# SAFRWAY Astro pilot

Локальный B2-пилот публичного сайта. Он не заменяет текущий Next/Vinext и не
предназначен для production cutover.

Пилотные маршруты:

- `/`;
- `/directions/`;
- `/directions/bali/`;
- `/directions/bali/visas/`;
- `/directions/bali/visas/e33g/`;
- `/directions/bali/visas/d12/`;
- `/directions/bali/visas/voa/`.

Визовые страницы используют immutable preview snapshot со статусом
`legacy_needs_sources`. Они имеют `noindex` и не входят в sitemap до проверки
официальных источников.

Команды:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run test:browser
pnpm run test:lighthouse
```

`content:export` читает только legacy-файлы репозитория, сохраняет исходный
смысл и создаёт детерминированный preview snapshot. Production API и database
не используются.
