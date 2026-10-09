# SEO intent ownership / route reconciliation — Family KITAS

| Intent | Authored file | Proposed route | Handling |
|---|---|---|---|
| общий коммерческий Family KITAS для иностранного держателя ITAS/ITAP | 01_FAMILY_KITAS_MAIN | `/bali/visas/family-kitas/` | существующий/planned route, первичное коммерческое ядро |
| супруг иностранного держателя ITAS/ITAP (E31B) | 02_FAMILY_SPOUSE_E31B | `/bali/visas/family-kitas/spouse/` | новый URL только после проверки конфликтов в Codex |
| родной несовершеннолетний ребёнок держателя ITAS/ITAP (E31E) | 03_CHILD_E31E | `/bali/visas/child-kitas/` | сохранить исторически предусмотренный маршрут |
| родитель держателя ITAS/ITAP (E31H) | 04_PARENTS_E31H | `/bali/visas/family-kitas/parents/` | новый URL только после проверки конфликтов |
| список и подготовка брака/рождения/переводов/легализации | 05_DOCUMENTS_KNOWLEDGE | `/bali/knowledge/family-kitas/documents/` | отдельный инфозапрос; не дублировать hub |
| член семьи основного держателя E33G | существующая RU_APPROVED статья | `/bali/knowledge/e33g/family/` | оставить как узкую E33G статью; исправить ошибочные цены 12/14m и caveats |
| супруг гражданина Индонезии (E31A) | отдельный будущий service candidate | undecided | **не смешивать с E31B**, нужен отдельный intent если сервис/объём подтверждены |

Кодекс определяет фактические canonical route IDs (не принуждать новые URL), сохраняет live legacy `/bali/guides/` при их наличии, никогда не удаляет старую индексируемую страницу без проверки duplicate ownership и redirect plan. Не создавать две indexable страницы, отвечающие на один и тот же generic вопрос «что такое семейный KITAS».

Первое тематическое упоминание услуги внутри статьи связано со страницей сервиса; хаб с spouse/child/parents и Knowledge. Не выводить link к unpublished маршрутам в production без соответствующего resolver/статуса публикации.
