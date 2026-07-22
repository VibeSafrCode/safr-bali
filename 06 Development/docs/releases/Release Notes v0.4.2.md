# SAFR v0.4.2 — Compact Visa Prices

Дата: 2026-07-22
Статус: production deploy завершён.

## Изменения

- визовые кнопки показывают компактные цены в IDR и цену в USD;
- суммы от 10 миллионов сокращаются до формата `12,5kk`;
- остальные суммы отображаются как `7500k`, `5000k`, `800k` и т. п.;
- eVOA отображается как `800k / $50` и в меню, и в карточке.

## QA и deploy

- 35 regression-тестов Telegram-бота пройдены;
- commit `eb2e8be` установлен на VPS через fast-forward;
- перед обновлением создан и проверен production-backup;
- production price smoke-test пройден;
- bot и backend active/running, ошибок в логах нет.
