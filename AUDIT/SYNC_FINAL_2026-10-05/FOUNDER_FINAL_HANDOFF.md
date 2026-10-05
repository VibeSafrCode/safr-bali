# SAFRWAY — FINAL HANDOFF FOR CODEX

**Date:** 2026-10-05  
**Scope:** Final decisions 1–16 + execution instructions  
**Priority:** Finish current C1 / eVOA / E33G release first, then proceed to approved next-stage work.

---

# 0. Что делать Codex сейчас

Прими финальный decision-пакет SAFRWAY по вопросам 1–16.

Сначала прочитай START_HERE.md и DECISIONS_01_16_RU.md.

Важно:
1. Текущий релиз C1/eVOA/E33G сначала доведи до конца: тарифы, публичный Registry/languages/SEO/CTA, browser/VibeDiz QA, финальные проверки и выпуск.
2. Не трать токены на повторный перевод: исправленный пакет переводов уже принят/импортирован. RU остаётся каноном.
3. Тарифы должны использовать существующий каталог и редактируемую админку. Indodax и текущее округление до ближайших $5 не менять.
4. В боте — короткий текст с теми же существенными фактами и ссылками на подробные страницы сайта.
5. По E33G family прочитай FAMILY_APPLICABILITY_NOTE.md и не обещай конкретный E31 индекс без проверки текущей применимости к статусу principal.
6. После завершения текущего релиза вопросы 7–16 считаются продуктово согласованными и могут идти в следующий этап без повторных вопросов:
   - D1/D2 отдельные страницы + общий хаб;
   - D1/D2 extension 2.5m;
   - E33G next-term;
   - консультация готовности документов 2m;
   - Alih Status → E33G;
   - Family KITAS hub;
   - Partners + Referral;
   - anti-duplication Knowledge policy;
   - business/document services via partner network;
   - country selector + Vietnam homepage visual via VibeDiz;
   - first-party analytics policy.

Не задерживай текущий релиз ради next-stage задач.

Верни короткий отчёт:
- что реально опубликовано;
- какие цены подключены к каталогу/админке;
- какие публичные маршруты/языки/SEO/CTA подключены;
- browser/VibeDiz QA;
- версия релиза;
- только конкретные оставшиеся блокеры.


---

# 1. Финальные решения 1–16

# SAFRWAY — FINAL DECISIONS FOR CODEX 01–16

**Date:** 2026-10-05  
**Authority:** founder/user decisions collected in chat  
**Purpose:** close all editorial/product questions from the SYNC-2 / C1 / eVOA / E33G decision list.

## Execution principle

Questions 1–6 belong to the current release and should be completed as part of that release.

Questions 7–16 were originally deferred. They are now resolved. Do not re-ask these product/editorial questions. They may be implemented in the next planned stage after the current release gate, unless an item below is explicitly required for the current release.

Do not let next-stage work delay the current C1/eVOA/E33G production release.

---

# 1. C1 and VOA/eVOA extension prices

Approved public customer prices:

- C1 extension: **2,000,000 IDR**
- VOA/eVOA extension: **850,000 IDR**

Technical requirement:

- add both as distinct tariff variants through the existing service catalog;
- expose them in the existing business admin pricing settings so the owner can edit prices there;
- do not hardcode the price only in content;
- initial C1 pricing remains unchanged;
- existing Indodax/FX logic remains unchanged;
- existing nearest-$5 USD rounding remains unchanged;
- historical orders remain unchanged.

---

# 2. E33G family applicability

Official Indonesian Immigration materials classify:

- E31B — spouse joining an ITAS/ITAP holder;
- E31E — eligible biological child joining an ITAS/ITAP-holding parent;
- E31H — parent joining a child who holds ITAS/ITAP.

E33G is an ITAS / remote-worker / second-home category.

However, because old SAFRWAY bot copy and some Golden Visa / eVisa mechanics have conflicted, **do not infer technical eligibility for every E33G family filing solely from the generic E31 index name**.

Operational rule:

- family scenarios are supported by SAFRWAY and checked against the principal holder's current status and current Immigration/eVisa rules;
- E31B can be described as the spouse family category for an ITAS/ITAP holder;
- E31E can be described as the child family category in the general ITAS/ITAP framework, but E33G-specific technical eligibility must be verified before promising filing;
- E31H is a parent-family category in the general framework, but for an E33G/Golden-Visa-related principal it must be individually verified before promising filing;
- old absolute bot wording should not override current official classification, but the site/bot must preserve the case-check caveat.

Do not publish a universal promise that every E33G holder can always file every E31 dependent index.

See `FAMILY_APPLICABILITY_NOTE.md`.

---

# 3. E33G bank statement: 3 months vs 12 months

Use the same wording everywhere:

- **3 months** = official minimum/reference;
- **12 months** = additional SAFRWAY preparation requirement based on practical experience preparing E33G cases.

Preferred wording:

> Officially, a bank statement for the last 3 months is required. Additionally, SAFRWAY requests a 12-month statement based on our practical experience preparing E33G applications.

Apply consistently to:

- site;
- bot;
- Knowledge;
- document checklists;
- support/admin scripts.

Do not falsely say that Immigration itself requires 12 months.

---

# 4. Site copy vs bot copy

Approved content model:

## Site
- detailed commercial copy;
- full requirements;
- full warnings;
- internal links;
- Knowledge links.

## Bot
- shorter, conversational descriptions;
- exactly the same material facts: prices, requirements, timing, restrictions and warnings;
- add links from the bot to the corresponding detailed site pages.

Knowledge remains the detailed informational layer.

---

# 5. Translations

Do **not** spend Codex tokens retranslating the C1/eVOA/E33G content.

ChatGPT/PRO review already repaired and rechecked the translation package and Codex has accepted/imported the new package.

Rules:

- RU remains canonical;
- non-RU follows semantic parity;
- no claim of native-speaker certification;
- when a translation gap is detected, restore meaning strictly from approved RU;
- do not invent facts;
- preserve localized SEO, direct answers, fact blocks, FAQ and all comparison tables.

Use the already imported revised translation package/revisions. Do not rewrite all translations again.

---

# 6. Visual/browser QA

Approved:

Codex may perform one isolated technical browser check without personal profiles/accounts and without video autoplay.

VibeDiz must participate in visual review.

Minimum QA set:
- RU
- EN
- DE
- ZH-Hans
- JA
- AR

Arabic must be checked visually in RTL.

Check:
- desktop/mobile;
- CTA;
- tables;
- FAQ;
- typography;
- country/language selector;
- pricing;
- links;
- RTL;
- no preview-only artifacts on production.

---

# 7. D1 / D2

Architecture approved:

- create a separate detailed D1 page;
- create a separate detailed D2 page;
- preserve the existing combined D1/D2 page as a comparison / hub;
- preserve the legacy route.

Extension price:

- **D1 extension: 2,500,000 IDR**
- **D2 extension: 2,500,000 IDR**

Use the existing pricing/admin mechanism.

If actual operational timing differs between D1/D2 and is not yet confirmed, do not invent it.

---

# 8. E33G — next term / extension

Do not present one universal next-term mechanism.

Public positioning:

> Rules can change. SAFRWAY reviews the holder's current status and the rules in force at that time and recommends the best lawful route: extension, new application or another available option.

Create a Knowledge/article angle focused specifically on:
- what to do when the current E33G term is ending;
- extension vs new application vs another lawful path;
- why the correct route is checked at the time of service.

Pricing:

## New E33G application
- standard: **12,000,000 IDR**
- expedited: **14,000,000 IDR**

## E33G extension
- **12,000,000 IDR**
- **no expedited extension option**

Do not promise that extension is always technically available.

---

# 9. Standalone E33G document-readiness consultation

Create a separate paid service:

**Price: 2,000,000 IDR**

Purpose:
- review the E33G document/employment package;
- assess readiness for filing;
- identify gaps / risk points;
- provide recommendations on what needs to be corrected or added.

Review scope may include:
- employer information;
- employment agreement;
- income evidence;
- bank history;
- consistency between documents.

This is a readiness/audit consultation. Do not automatically promise legal drafting of a new employment agreement unless separately agreed.

The same document review remains included inside the full 12m/14m E33G filing service.

---

# 10. Alih Status / Conversion to E33G

SAFRWAY may assess and process in-country conversion where current rules permit it.

Approved customer prices:

- **VOA → E33G: 17,000,000 IDR**, Bridging included
- **KITAS → E33G: 17,500,000 IDR**, Bridging included
- **C1 → E33G: 15,000,000 IDR**
- **D12 → E33G: 17,000,000 IDR**

Operational minimum lead time before current status expires:

- VOA: **7 days**
- KITAS: **7 days**
- C1: **30 days**
- D12: **30 days**

Required public message:

> Проверим ваш текущий иммиграционный статус и определим, можно ли перейти на нужную категорию внутри Индонезии или потребуется выезд и новая подача.

Rules change, so:
- do not guarantee conversion without exit;
- first validate the current status, remaining validity and current Immigration rules;
- if conversion is unavailable, offer the best lawful alternative.

---

# 11. General Family KITAS

Create a strong Family KITAS hub.

SAFRWAY handles standard family/dependent KITAS scenarios based on a principal KITAS/ITAS holder.

Cover:
- spouse;
- child;
- parent.

The exact index and filing mechanics depend on:
- principal holder's status;
- legal family relationship;
- current Immigration/eVisa rules.

Do not lock the page to E33G only.

No fixed Family KITAS price was confirmed in this decision set. Until confirmed:
- use manager / individual quote;
- do not invent a public fixed price.

Family-specific child/spouse/parent pages may be added where they serve a distinct user/search intent.

---

# 12. Partners and Referral are separate

Create two separate pages/concepts.

## `/partners/`
Audience:
- agencies;
- companies;
- relocation firms;
- concierges;
- travel businesses;
- professional partners.

Positioning:
- SAFRWAY is open to broad, mutually beneficial cooperation;
- we can cooperate across services and client flows;
- terms are agreed individually.

Do not invent commissions or payout terms yet.

## Referral
Separate page/system for private recommendations/referrals.

The founder has specific referral conditions but will provide them later.

Do not merge Partners and Referral into one page.

---

# 13. Knowledge overlap / SEO cannibalization

Approved permanent editorial policy.

ChatGPT / high-intelligence / PRO is responsible for continuously detecting overlapping intents, especially before release.

Rules:

- one strong indexable page per primary intent;
- do not create a duplicate simply because an old SEO plan lists another route;
- create a separate page only when the user/search task is genuinely distinct;
- preserve working legacy URLs technically;
- consolidate overlapping editorial scope;
- avoid thin pages and SEO cannibalization.

Examples:
- do not create a second generic E33G requirements article if `remote-worker-kitas` already fully owns that intent;
- separate E33G income / employment contract / bank statement pages are valid when they solve distinct queries;
- Guides and Knowledge should not become duplicate indexable copies.

Codex handles stable routing/technical mapping; editorial intent decisions follow this policy.

---

# 14. Business and document services

Approved broad expansion model.

SAFRWAY can organize a broad range of Indonesian business/document services because fulfillment may be handled through SAFRWAY's partner network.

Potential topics include:
- business structure / company setup and closure;
- land/environment permits;
- hotel/restaurant permits;
- distribution/warehousing/franchise;
- product certification;
- medical/sector permits;
- tax review/disputes;
- WLKP;
- tenders;
- passport/address data updates;
- certified translation;
- apostille/legalization;
- related business/document tasks.

Content workflow:

1. research current official rules;
2. research competitors as product/content references;
3. write original SAFRWAY copy — do not copy competitor wording or design;
4. user approves RU where needed;
5. localize into production languages;
6. semantic QA;
7. publish useful pages, not empty/thin SEO shells.

Operational rule:
- if price/process/timing is not yet confirmed, do not invent it;
- CTA goes to manager / individual assessment;
- service may be fulfilled by SAFRWAY or a verified partner.

---

# 15. International country architecture

International expansion is approved.

## Header
Add a country button/selector with a dropdown containing the full country list.

Countries do not have to be featured on the homepage to exist in the country selector.

Do not create thin indexable empty country pages. A country can remain selector-only / preview until useful content exists.

## Homepage
Only founder-approved priority countries are shown as visual photo/icon cards.

Immediate approved homepage country:
- **Vietnam**

Vietnam requirements:
- add Vietnam to the homepage as a visual country card with a photo;
- VibeDiz must review/approve composition and styling;
- preserve SAFRWAY brand;
- do not mechanically clone competitors.

Other homepage country cards require explicit founder approval.

For countries with a strong content/service framework:
- build richer country landing/service architecture.

For less-developed countries:
- keep them available in the country selector;
- use individual assessment or non-indexed preview until content is ready.

International visa/service content must use current verified rules.
Competitor pages may be research inputs; final copy must be original SAFRWAY copy.

---

# 16. SAFRWAY first-party analytics policy

Approved.

## Events that may be stored

Examples:
- page views;
- source/referrer;
- UTM;
- selected country;
- selected service;
- language;
- CTA click;
- form start;
- form submit;
- click to Telegram / WhatsApp / bot;
- funnel stage;
- lead created;
- order created;
- payment/order success;
- contentId;
- serviceId;
- order amount and currency;
- pseudonymous session/user ID;
- browser/device;
- coarse geography such as country/city;
- SEO/Search Console metrics in the dashboard where available.

## Data that must NOT be placed in analytics events

- name;
- phone;
- email;
- passport number or passport fields;
- passport scans;
- bank documents;
- client files;
- medical data;
- full free-text messages;
- full form text;
- document contents;
- other sensitive client information.

Those belong in the proper CRM/client record, not analytics.

Avoid storing raw IP as an analytics field unless strictly required for security/operations. Prefer pseudonymous IDs and coarse geography.

## Retention

- raw analytics event data: **13 months**
- aggregated anonymized metrics: **3 years**

Financial/order history follows its own business/accounting retention and does not justify putting PII into analytics events.

## Access

### Super Admin / owner
- full analytics dashboard;
- raw event history without prohibited PII.

### Normal staff
- role-appropriate aggregated metrics;
- leads/revenue/funnel views needed for work.

### Technical admins
- raw technical event history where needed;
- still no prohibited client content in analytics.

Managers do not need unrestricted raw event streams.

## Implementation

Build first-party analytics as the primary analytics layer, with Google Search Console as an external search-data source where useful.

If production deployment creates a privacy/consent requirement that is not already satisfied, report the exact blocker rather than silently weakening the policy.

---

# CURRENT / NEXT STAGE SEQUENCING

## Finish current release first
Complete C1/eVOA/E33G release items:
- tariff publication;
- Registry/language/SEO/CTA public hookup;
- browser/VibeDiz QA;
- final release checks;
- production release / verification.

Do not delay this release for 7–16.

## Then proceed without re-asking product questions
The following are authorized next-stage work:
- D1 and D2 separate pages + hub;
- D1/D2 extension tariff 2.5m;
- E33G next-term Knowledge/service positioning;
- E33G document-readiness consultation 2m;
- Alih Status / conversion-to-E33G products;
- general Family KITAS hub;
- Partners page;
- Referral page shell awaiting exact terms;
- Knowledge anti-duplication cleanup;
- business/document content expansion;
- international country selector;
- Vietnam homepage card with VibeDiz;
- first-party analytics under the approved policy.

Return exact blockers only when a missing factual/price/process detail is genuinely required for implementation.


---

# 2. Примечание по E33G Family Applicability

# E33G FAMILY APPLICABILITY NOTE

This note exists to prevent Codex from overgeneralizing generic family visa index names to every E33G/Golden-Visa-related filing.

## Official Indonesian Immigration classification

Current official Immigration materials list:
- E31B — spouse joining a holder of ITAS/ITAP
- E31E — biological child under 18, unmarried, joining a parent who holds ITAS/ITAP
- E31H — parent joining a child who holds ITAS/ITAP
- E33G — remote-worker / second-home limited stay visa category

Official references reviewed:
- https://jakartapusat.imigrasi.go.id/layanan/warga-negara-asing-wna/izin-tinggal-keimigrasian/perpanjangan-itas
- https://bontang.imigrasi.go.id/layanan-publik/kategori/wna/sub/daftar-visa-indonesia

## Implementation rule

Do not infer from the generic E31 labels alone that every E31 index is always technically available for every E33G principal.

For public SAFRWAY copy:
- explain the general family framework;
- route the user to manager/document review;
- verify live eVisa/Immigration applicability before promising a specific dependent filing;
- preserve any current Golden Visa/E33G-specific technical restriction discovered during live validation.

If the current eVisa flow rejects or excludes an index for an E33G principal, the live rule wins and the content must be corrected before publication.


---

# 3. Политика собственной аналитики SAFRWAY

# SAFRWAY FIRST-PARTY ANALYTICS POLICY

Approved 2026-10-05.

## Store
- page views
- UTM/referrer
- country/service/language selection
- CTA/form/funnel events
- external-channel clicks
- lead/order/payment success events
- contentId/serviceId
- order amount/currency
- pseudonymous session/user identifiers
- device/browser
- coarse geography
- aggregated Search Console data

## Never put in analytics event payloads
- names
- phone numbers
- emails
- passport data
- document scans/files
- banking documents
- medical data
- message bodies
- free-form client form text
- other sensitive client documents

## Retention
- raw events: 13 months
- anonymized aggregates: 3 years

## Access
- owner/Super Admin: full dashboard + raw non-PII events
- staff: role-based aggregates
- technical admins: raw technical non-PII events as needed

CRM/client records remain the system for personal/client data.


---

# 4. Короткий чек-лист перед ответом Codex

Перед возвратом отчёта убедиться, что:

- текущий C1/eVOA/E33G релиз не задержан задачами 7–16;
- тарифы C1 extension 2,000,000 IDR и VOA/eVOA extension 850,000 IDR подключены через действующий каталог и редактируемую админку;
- Indodax и текущее округление USD до ближайших $5 не изменены;
- бот использует короткий текст, но те же факты, цены, сроки и ограничения, и содержит ссылки на подробные страницы сайта;
- переводы не пересоздаются заново;
- VibeDiz/browser QA завершены для обязательных локалей;
- Arabic проверен визуально в RTL;
- публичные Registry/language/SEO/CTA подключения завершены;
- family categories не обещаются универсально без live-case проверки;
- после текущего релиза решения 7–16 можно брать в работу без повторного продуктового согласования.

Вернуть владельцу краткий отчёт:
1. Что реально опубликовано.
2. Какие цены подключены к каталогу и админке.
3. Какие публичные маршруты/языки/SEO/CTA подключены.
4. Результат browser/VibeDiz QA.
5. Версия релиза.
6. Только конкретные оставшиеся блокеры.
