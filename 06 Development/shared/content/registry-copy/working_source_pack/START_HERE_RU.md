# SAFRWAY G01 — Working KITAS E23 / RPTKA / WLKP / Status Change

**Сводный пакет:** 11 октября 2026 года, 10 локалей (RU + 9).
**Область:** шесть страниц G01, без внесения изменений в live-сайт.
**Статус:** RU_REVIEW → MODEL_TRANSLATED_PENDING_RENDER_QA. Не считать одобренным/опубликованным.

## Что готово

- Полные 6 оригинальных RU страниц из неизменённого v83: 4 commercial + 2 Knowledge.
- Полные 54 переводные версии на EN, DE, ZH-Hans, KO, FR, JA, HI, ES и AR, включая SEO Title/Description, H1, основной текст, FAQ, CTA.
- 60 полнотекстовых записей с исходными и локализованными SEO-метаданными в `DATA/CONTENT_IMPORT_STAGING_ALL_10.json` — только staging, не runtime-схема.
- `CONTENT/RU`, `CONTENT/EN`, `CONTENT/DE`, `CONTENT/ZH-HANS`, `CONTENT/KO`, `CONTENT/FR`, `CONTENT/JA`, `CONTENT/HI`, `CONTENT/ES`, `CONTENT/AR`.
- Все 60 языковых версий объединены в `SAFRWAY_G01_ALL_10_LOCALES_COMPLETE.md`.
- `RESEARCH/` — исходные юридические источники v83, без ложного заявления о новой государственной проверке.
- `QA/validate_bundle.py` и `QA/build_manifest.py` — воспроизводимые проверки.
- `SHA256SUMS.txt` и обновлённый контекст v84.

## Как проверять

Из папки `SAFRWAY_G01_WORKING_ALL_10_LOCALES_2026-10-11`:

```bash
python3 QA/validate_bundle.py --self-test
```

При необходимости пересоздать staging-манифест (не менять runtime):

```bash
python3 QA/build_manifest.py
python3 QA/validate_bundle.py --self-test
sha256sum -c SHA256SUMS.txt
```

Запуск `build_manifest.py` перезапишет одноимённый файл и не должен влиять на код SAFRWAY. Перед запуском checksum-сверки после перегенерации проверь, не изменился ли формат сериализации.

## Оговорки по выпуску

- Кодекс уже получил v82. Этот архив — последующий **редакционный G01** и не отменяет его текущую техническую задачу.
- Использовать существующие `contentId` working, rptka, wlkp, working_conversion; две Knowledge identity создать лишь после проверки на дубль.
- В исходном RU статус `RU_REVIEW`, line-by-line approval владельца не подтверждён. Переводы выполнены моделью и требуют итогового смыслового и browser QA.
- Ни одна услуга не имеет утверждённой цены или подтверждённого срока; не выставлять 0 IDR, не копировать прайс конкурентов, не обещать доступного подрядчика и автоматический onshore conversion.
- Переводные ссылки внутри Markdown хранят исходные смысловые маршруты. Codex должен разрешить их через Registry/locale availability, а не механически публиковать ссылки на несуществующие `/ar/` и другие цели.
- Арабская локаль — `dir=rtl`; смешанные латинские коды E23/RPTKA/ITAS, таблицы, кнопки и формы должны быть проверены в браузере.
- Не переписывать Indodax, USD rounding, существующие цены, CRM, referral и исторические заказы.

**Один архив для Codex:** `SAFRWAY_G01_WORKING_ALL_10_LOCALES_CODEX_2026-10-11.zip`.
