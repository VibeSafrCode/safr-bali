# Задание GPT — независимый аудит без implementation/release authority

Ты проверяешь существующий SAFRWAY для синхронизации с Codex. Сначала прочитай START_HERE_RU.md, CURRENT_IMPLEMENTATION_AUDIT_RU.md, ROUTE_ID_MAPPING.json и CURRENT_ROUTE_INVENTORY.json. HTTP/SEO факты находятся в LIVE_HTTP_SEO_QA.json/CSV. При чтении отдельного архива: BASELINE_SOURCES — разрешённые исходники baseline3659, LOCAL_CANDIDATE — НЕ внедрённый черновик. На GitHub только отчёты; исходники читай по допустимому AUDIT/MANIFEST.md, не ищи там archive-only candidate.

Не смешивай:

- product source baseline `3659ba7…` и последующий documentation-only Git commit (текущий main записать при начале review);
- public Astro `67e2939…`;
- Mini App `36fe5f9…`;
- локальный optional routingPlan, который ещё не в main и не в production;
- indexable markup и фактическую поисковую индексацию.

Проверь минимально-инвазивный путь следующих задач:

1. Дедупликация 94 Bali intents → 76 existing IDs + два unresolved, без создания второй business service.
2. Country entity, visa intent, jurisdiction, application origin, passport/residence/KITAS и UI language как разные понятия. Schengen — регион, не страна.
3. Current/public/preview route ownership; пять canonical conflicts; не генерировать redirects для never-live URL.
4. Existing publication manifests и ten-language payload integrity; не понижать уже опубликованные тексты по старым planning statuses.
5. Business60 и отсутствующий Documents pack: конкретные editorial/operational blockers, без invented laws/quotes/prices.
6. Existing form/source/CRM/analytics flow, hardcoded Bali/visa assumptions, chrome RU/EN против ten-language article bodies.
7. Optional routingPlan draft, structural vs semantic associations, protected preview/raw source boundary, preservation of historical fixture pins.
8. Existing pricing/Indodax nearest-$5 projection и immutable orders: ничего не перепроектировать без отдельной необходимости.

Верни краткий triage: P0/P1/P2, конкретный файл/реализация/доказательство, what is already done, what needs Founder decision, минимальные проверяемые следующие изменения. Если данных нет — обозначь UNKNOWN/NOT_RUN; не придумывай результаты браузера, юридическую применимость, доступность исполнителей или Google ranking.

Не переписывай предоставленные переводы, не выдавай рекомендации за authority на mutation/deploy. Никаких production credentials/customer data у тебя нет и не должно быть. Codex сведёт замечания и задаст Founder только материальные вопросы.
