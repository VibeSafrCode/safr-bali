# Documents — поисковые интенты, навигация, anti-cannibalization

| pageKey | RU route candidate | Тип | Основной intent | Отдельно от |
|---|---|---|---|---|
| documents_hub | `/bali/documents/` | Hub | подобрать действие над документом | конкретные платные услуги |
| certified_translation | `/bali/documents/certified-translation/` | Commercial | заказать заверенный/присяжный перевод | апостиль и обычный перевод контента |
| apostille | `/bali/documents/apostille/` | Commercial | оформить апостиль на подходящий документ | легализация и Knowledge сравнение |
| legalization | `/bali/documents/legalization/` | Commercial | оформить консульскую/ведомственную легализацию | апостиль |
| corporate_documents | `/bali/documents/corporate/` | Commercial | подготовить/заверить актуальные документы компании | открытие PT PMA / OSS / company-changes |
| apostille_vs_legalization | `/bali/knowledge/documents/apostille-vs-legalization/` | Knowledge | выбрать маршрут и понять различия | коммерческое оформление |

## Интерлинковка

Hub связывает все услуги и Knowledge. Коммерческие страницы дают нужные смежные услуги контекстно; Knowledge отвечает на сравнительный вопрос и ведёт на апостиль, легализацию и перевод. Все URL подсказки, не подтверждённые актуальным registry.

## Отношения с Business Stage 1

`/bali/business/pt-pma/`: открытие компании ≠ выдача копий и переводов.
`/bali/business/oss-licenses/`: NIB/OSS ≠ AHU company act.
`/bali/business/company-changes/`: действительное обновление юр.данных ≠ подготовка существующего комплекта.
`/bali/knowledge/business/pt-pma-capital-2026/`: финансовые нормы PT PMA ≠ пошлины за апостиль.

## SEO / hreflang

Только готовые публичные canonical и выпущенные локали. RU markdown — русская смысловая база; никаких EN/DE/other переводов в текущем этапе. Новые `routeCandidate` сравнивать с existing Astro Registry и сохранёнными base pages. `RU_REVIEW` позволяет ручную пострелизную правку по решению владельца, но не заменяет юридическую критическую проверку перед релизом.
