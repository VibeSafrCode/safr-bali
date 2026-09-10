// Source checks are editorial checks, not legal advice or human expert approval.
// Reviewed hashes are filled only after the final copy receives independent review.
const checked = {
  lastModified: "2026-09-09",
  reviewedAt: "2026-09-09",
  reviewExpiresAt: "2026-10-09",
  reviewStatus: "verified",
  publicationStatus: "published",
  requiresSources: true,
  hasSubstantialContent: true,
  reviewedVersion: { ru: "PENDING", en: "PENDING" },
};

const c1Source = {
  id: "jakarta-pusat-c1",
  title: "C1 Visa Wisata",
  publisher: "Kantor Imigrasi Kelas I Non TPI Jakarta Pusat",
  url: "https://jakartapusat.imigrasi.go.id/layanan/warga-negara-asing-wna/visa-republik-indonesia/c1-visa-wisata",
  section: "Jenis visa; Masa tinggal; Pengajuan visa; Ketentuan lain",
  updatedAt: null,
};
const e33gSource = {
  id: "bontang-e33g",
  title: "Informasi Visa Republik Indonesia — E33G Visa Pekerjaan Jarak Jauh",
  publisher: "Kantor Imigrasi Kelas III Non TPI Bontang",
  url: "https://bontang.imigrasi.go.id/public/layanan-publik/kategori/wna/sub/informasi-visa-republik-indonesia",
  section: "E33G — Dengan Visa Ini; Pengajuan Visa; Persyaratan Khusus; Ketentuan Lain",
  updatedAt: null,
};
const staySource = {
  id: "bengkalis-stay",
  title: "Izin Tinggal Keimigrasian",
  publisher: "Kantor Imigrasi Kelas II TPI Bengkalis",
  url: "https://bengkalis.imigrasi.go.id/layanan/wna/izin-tinggal-keimigrasian/",
  section: "Perpanjangan ITK: Indeks Visa C; Perpanjangan ITAS: E33G",
  updatedAt: null,
};

const generalLimitations = {
  ru: [
    "Сверка официальных источников не является юридической экспертизой или гарантией выдачи визы.",
    "Проверьте применимость условий к вашему паспорту и цели поездки до оплаты. Даты в выданных документах имеют значение для вашей поездки.",
    "На странице нет обещания сроков обработки или государственного тарифа. Стоимость услуг проверяется отдельно в опубликованном каталоге SAFRWAY.",
  ],
  en: [
    "Checking official sources is not legal expert approval or a guarantee that a visa will be issued.",
    "Check the conditions for your passport and travel purpose before paying. Refer to your issued documents for your own travel dates.",
    "This page promises no processing time or government fee. Service prices are checked separately in SAFRWAY’s published catalog.",
  ],
};

const item = (text, ...sourceIds) => ({ text, sourceIds });
const block = (id, kind, heading, items) => ({ id, kind, heading, items });

export const visaEditorial = {
  "/bali/visas/c1/": {
    ...checked,
    reviewedVersion: { ru: "6d31371acf89a78c3476f28b9e16791eb4d84fc38390e769ad5b1ad20a5d8137", en: "2637a09e8a33413e1fdebd3bd6e2e4720cdda574d69de2c09044a0967b7e9971" },
    sources: [c1Source, staySource],
    priceReference: { type: "VISA", key: "C1" },
    locales: {
      ru: {
        title: "Виза C1 в Индонезию",
        description: "C1: цель поездки, документы, сроки въезда и пребывания. Краткая справка со ссылками на официальные источники.",
        lead: "Проверьте, соответствует ли этот вариант вашей поездке, и не путайте две разные даты в документах.",
        blocks: [
          block("purpose-stay", "facts", "Назначение и пребывание", [
            item("C1 — однократная туристическая виза. Первоначальное пребывание — до 60 дней с прибытия.", "jakarta-pusat-c1"),
            item("Возможны продления до 180 дней суммарно; продление требует отдельного оформления.", "bengkalis-stay"),
          ]),
          block("documents", "requirements", "Основные документы", [
            item("Паспорт со сроком действия от 6 месяцев, свежая фотография, выписка за 3 месяца с минимумом USD 2 000.", "jakarta-pusat-c1"),
          ]),
          block("limits", "restrictions", "Ограничения", [
            item("Продажа товаров или услуг и вознаграждение от индонезийских лиц или компаний запрещены.", "jakarta-pusat-c1"),
          ]),
          block("entry-deadline", "notice", "Срок въезда — не срок пребывания", [
            item("Въезд — в течение 90 дней после выдачи. Это не разрешение находиться в стране 90 дней.", "jakarta-pusat-c1"),
          ]),
        ],
        limitations: [
          ...generalLimitations.ru,
          "Требование к спонсору и комплект документов нужно подтвердить для вашей подачи. Эта справка не обещает подачу без спонсора.",
        ],
      },
      en: {
        title: "Indonesia C1 visa",
        description: "C1 travel purpose, documents, entry deadline and permitted stay, with links to official sources.",
        lead: "Check whether this option fits your trip, and distinguish the two different dates in your documents.",
        blocks: [
          block("purpose-stay", "facts", "Purpose and stay", [
            item("C1 is a single-entry tourist visa. Initial stay: up to 60 days from arrival.", "jakarta-pusat-c1"),
            item("Extensions may allow up to 180 days in total; a separate extension application is required.", "bengkalis-stay"),
          ]),
          block("documents", "requirements", "Main documents", [
            item("Passport valid at least six months, recent photograph, three-month bank statement showing at least USD 2,000.", "jakarta-pusat-c1"),
          ]),
          block("limits", "restrictions", "Restrictions", [
            item("Selling goods or services and receiving remuneration from Indonesian individuals or companies are prohibited.", "jakarta-pusat-c1"),
          ]),
          block("entry-deadline", "notice", "Entry deadline is not permitted stay", [
            item("Use the visa within 90 days of issuance. This does not authorize a 90-day stay.", "jakarta-pusat-c1"),
          ]),
        ],
        limitations: [
          ...generalLimitations.en,
          "Confirm sponsorship and the document checklist for your application. This page does not promise sponsor-free applications.",
        ],
      },
    },
  },
  "/bali/visas/e33g/": {
    ...checked,
    reviewedVersion: { ru: "444105a0ea7cba366f39864f6cfd2274918ecb5499d5a34df38f29cf8aaee4f4", en: "79ea1d030055ed305dbce96e6b8f371d7871bf3ab09e5882ee1c7e48010380a4" },
    sources: [e33gSource, staySource],
    priceReference: { type: "VISA", key: "E33G" },
    locales: {
      ru: {
        title: "E33G: удалённая работа из Индонезии",
        description: "Условия E33G, подтверждение дохода и документов, срок въезда и первоначального пребывания: официальные источники и границы справки.",
        lead: "Работа через интернет сама по себе не подтверждает соответствие условиям. Сначала сопоставьте документы с требованиями.",
        blocks: [
          block("purpose-stay", "facts", "Назначение и пребывание", [
            item("Для выполнения работы зарубежной компании из Индонезии.", "bontang-e33g"),
            item("Первоначальное разрешение на пребывание — один год.", "bengkalis-stay"),
          ]),
          block("documents", "requirements", "Что подтвердить", [
            item("Трудовой договор с компанией вне Индонезии; годовой доход от USD 60 000.", "bontang-e33g"),
            item("Паспорт, действительный не менее 6 месяцев, выписка за 3 месяца от USD 2 000, фотография, CV, маршрут.", "bontang-e33g"),
          ]),
          block("limits", "restrictions", "Ограничения", [
            item("Работа вне условий разрешения и превышение срока пребывания запрещены.", "bontang-e33g"),
          ]),
          block("entry-deadline", "notice", "Две разные даты", [
            item("Въезд — в течение 90 дней после выдачи, отдельно от срока пребывания.", "bontang-e33g"),
          ]),
        ],
        limitations: [
          ...generalLimitations.ru,
          "Для фриланса, местных заказчиков, семьи и налогов нужна отдельная проверка. Эти вопросы не подтверждены данной справкой.",
          "Продление не происходит автоматически. Перед планированием следующего периода нужно проверить доступность оформления и условия конкретного разрешения.",
        ],
      },
      en: {
        title: "E33G: remote work from Indonesia",
        description: "E33G conditions, income and documents, entry deadline and initial stay: official sources and the limits of this overview.",
        lead: "Working online alone does not establish eligibility. First match your documents against the requirements.",
        blocks: [
          block("purpose-stay", "facts", "Purpose and stay", [
            item("For carrying out an overseas company’s assignments from Indonesia.", "bontang-e33g"),
            item("Initial limited stay: one year.", "bengkalis-stay"),
          ]),
          block("documents", "requirements", "Evidence to prepare", [
            item("Overseas employment agreement; documented annual income of at least USD 60,000.", "bontang-e33g"),
            item("Six-month-valid passport, three-month statement showing at least USD 2,000 or equivalent, photograph, CV and itinerary.", "bontang-e33g"),
          ]),
          block("limits", "restrictions", "Restrictions", [
            item("Work outside the permit’s conditions and overstaying are prohibited.", "bontang-e33g"),
          ]),
          block("entry-deadline", "notice", "Two different dates", [
            item("Entry-use deadline: 90 days after issuance, separate from permitted stay.", "bontang-e33g"),
          ]),
        ],
        limitations: [
          ...generalLimitations.en,
          "Freelancing, local clients, family applications and tax need separate checks. This overview does not establish eligibility for those situations.",
          "Renewal is not automatic. Check application availability and the conditions of your particular permit before planning another period.",
        ],
      },
    },
  },
  "/bali/visas/": {
    ...checked,
    reviewedVersion: { ru: "49e3150d85ec884a8821e0141839c3e6f19ec14e82def914803871698c69c31b", en: "4565b2143789198f358b9c0e87ccbc122b58fcb71f4151a44cd39faa7986049d" },
    sources: [staySource],
    locales: {
      ru: {
        title: "Визы в Индонезию: C1 и E33G",
        description: "Две проверенные справки для планирования поездки: C1 и E33G. Сравните сроки и откройте документы, ограничения и официальные источники.",
        lead: "Начните с цели поездки, затем откройте подробную справку. Каталог не заменяет проверку вашей ситуации.",
        blocks: [
          block("comparison", "facts", "Сравните первоначальное пребывание", [
            item("C1: до 60 дней; E33G: один год. Срок въезда проверяется отдельно.", "bengkalis-stay"),
          ]),
          block("scope", "notice", "Что проверено", [
            item("Здесь сверены сведения о C1 и E33G. На их страницах указаны источники, документы и ограничения справки."),
            item("Другие категории ожидают проверки. Их наличие в каталоге не подтверждает условия, цену или доступность оформления."),
          ]),
        ],
        limitations: generalLimitations.ru,
      },
      en: {
        title: "Indonesia visas: C1 and E33G",
        description: "Two source-checked overviews for planning: C1 and E33G. Compare stays, then read the documents, restrictions and official sources.",
        lead: "Start with your travel purpose, then open the detailed overview. This catalog does not replace a check of your circumstances.",
        blocks: [
          block("comparison", "facts", "Compare initial stays", [
            item("C1: up to 60 days; E33G: one year. Check the entry deadline separately.", "bengkalis-stay"),
          ]),
          block("scope", "notice", "Scope of this check", [
            item("This source check covers C1 and E33G. Their pages identify sources, documents and the limits of the overview."),
            item("Other categories await review. A catalog listing does not confirm conditions, prices or application availability."),
          ]),
        ],
        limitations: generalLimitations.en,
      },
    },
  },
};

for (const [slug, code, key] of [
  ["d12", "D12", "D12"],
  ["d1-d2", "D1/D2", "D1/D2"],
  ["voa", "VOA", "VOA"],
]) {
  visaEditorial[`/bali/visas/${slug}/`] = {
    ...checked,
    reviewedAt: null,
    reviewExpiresAt: null,
    reviewStatus: "needs_review",
    hasSubstantialContent: false,
    sources: [],
    priceReference: { type: "VISA", key },
    locales: {
      ru: {
        title: `${code}: справка готовится`,
        description: `Раздел ${code} ожидает проверки официальных источников.`,
        lead: "Мы обновляем справку и пока не публикуем непроверенные условия.",
        blocks: [block("pending-review", "notice", "Источники ещё не проверены", [
          item("Перед выбором этой категории запросите проверку вашей ситуации. Визовые условия ещё не подтверждены; стоимость сопровождения уточняется отдельно."),
        ])],
        limitations: ["Название раздела не подтверждает доступность оформления."],
      },
      en: {
        title: `${code}: overview in preparation`,
        description: `The ${code} overview awaits an official-source check. Ask the team to confirm the conditions for your trip.`,
        lead: "We are updating this overview and are not publishing unverified conditions.",
        blocks: [block("pending-review", "notice", "Sources not yet checked", [
          item("Request a check of your circumstances before choosing this category. Visa conditions are not yet verified; service pricing is confirmed separately."),
        ])],
        limitations: ["The section name does not confirm application availability."],
      },
    },
  };
}
