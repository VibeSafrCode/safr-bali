// Framework-neutral target catalog shared by Astro, React and the
// Next/Vinext parity reference during B4.
import housingContent from "../../bot/app/content/housing.json";
import visaContent from "../../bot/app/content/visas.json";

export type CatalogStatus = "available" | "soon";

export type CatalogItem = {
  id: string;
  name: string;
  icon: string;
  summary: string;
  status?: CatalogStatus;
  note?: string;
  content?: string;
  publiclyHidden?: boolean;
  children?: readonly CatalogItem[];
};

export type Destination = {
  id: "bali" | "thailand" | "russia" | "nepal";
  number: string;
  name: string;
  icon: string;
  color: "coral" | "blue" | "violet" | "orange";
  className: string;
  eyebrow: string;
  description: string;
  services: readonly CatalogItem[];
};

const baliVisas: readonly CatalogItem[] = [
  {
    id: "e33g",
    name: "ITAS E33G",
    icon: "E",
    summary: "Для удалённых работников, сроком на 1 год.",
    note: "От 12 млн IDR под ключ, включая государственные сборы.",
    content: visaContent.E33G.text,
  },
  {
    id: "d12",
    name: "D12",
    icon: "D",
    summary: "Многократная виза на 1 или 2 года.",
    note: "От 7,5 млн IDR под ключ, включая государственные сборы.",
    content: visaContent.D12.text,
  },
  {
    id: "d1-d2",
    name: "D1 / D2",
    icon: "D",
    summary: "Туристические и деловые мультивизы.",
    note: "1 год — от 5,5 млн IDR, 2 года — от 9 млн IDR, под ключ.",
    content: visaContent["D1/D2"].text,
  },
  {
    id: "c1",
    name: "C1",
    icon: "C",
    summary: "Однократная гостевая виза до 60 дней с возможностью продления.",
    note: "2,5 млн IDR под ключ.",
    content: visaContent.C1.text,
  },
  {
    id: "voa",
    name: "eVOA",
    icon: "V",
    summary: "Краткосрочная виза по прибытии.",
    note: "800 тыс. IDR / $50 под ключ, включая государственный сбор.",
    content: visaContent.VOA.text,
  },
  {
    id: "other-visa",
    name: "Другая виза",
    icon: "?",
    summary: "Разберём нестандартную ситуацию и подберём подходящий тип визы.",
    content: visaContent["Другая виза"].text,
  },
];

export const destinations: readonly Destination[] = [
  {
    id: "bali",
    number: "01",
    name: "Бали",
    icon: "◉",
    color: "coral",
    className: "destination-bali",
    eyebrow: "",
    description: "Визы, жильё, обмен валюты и помощь на месте.",
    services: [
      {
        id: "visas",
        name: "Сделать визу",
        icon: "▣",
        summary: "Визы и ITAS в Индонезию: от короткой поездки до длительного проживания.",
        children: baliVisas,
      },
      {
        id: "housing",
        name: "Найти жильё",
        icon: "⌂",
        summary: "Поиск, проверка и честный видеообзор жилья на Бали.",
        note: "Индивидуальный поиск виллы — от $150.",
        children: [
          {
            id: "villa",
            name: "Найти виллу",
            icon: "⌂",
            summary: "Подбор, проверка на месте и переговоры с владельцем.",
            note: "Индивидуальный поиск — от $150.",
            content: housingContent.search_housing.text,
          },
          {
            id: "guesthouse",
            name: "Найти гест",
            icon: "▤",
            summary: "Подберём гестхаус под срок, район и бюджет.",
            status: "soon",
          },
          {
            id: "buy-property",
            name: "Купить недвижимость",
            icon: "◇",
            summary: "Поможем с поиском и первичной проверкой объекта.",
            status: "soon",
          },
          {
            id: "inspect-property",
            name: "Проверить объект",
            icon: "◎",
            summary: "Личный осмотр, видео и честный комментарий о состоянии.",
            status: "soon",
          },
          {
            id: "housing-videos",
            name: "Видео про жильё",
            icon: "▶",
            summary: "Подборка реальных разборов вилл и рисков аренды.",
            content: housingContent.videos.text,
          },
          {
            id: "housing-risks",
            name: "Риски аренды",
            icon: "!",
            summary: "На что обратить внимание при самостоятельном поиске.",
            content: housingContent.risks.text,
          },
        ],
      },
      {
        id: "exchange",
        name: "Обмен валюты",
        icon: "↔",
        summary: "Предварительный расчёт по доступным направлениям.",
        children: [
          {
            id: "usdt-idr",
            name: "Калькулятор обмена",
            icon: "=",
            summary: "Предварительный расчёт по доступным направлениям.",
            note: "Итоговую сумму подтверждает менеджер перед обменом.",
            content:
              "Выберите, что отдаёте и получаете. Можно указать имеющуюся сумму или желаемый результат — калькулятор самостоятельно выполнит предварительный расчёт.",
          },
          {
            id: "other-exchange",
            name: "Другой обмен",
            icon: "↔",
            summary: "Рубли, доллары и другие варианты — по запросу менеджеру.",
            publiclyHidden: true,
            content:
              "Если вам нужно обменять рубли, доллары или другую валюту, опишите направление и сумму. Менеджер уточнит доступность и финальный курс.",
          },
        ],
      },
      {
        id: "assistant",
        name: "Тревел-ассистент",
        icon: "✦",
        summary:
          "Персональное сопровождение: прилёт, трансфер, связь, байк и бытовые задачи.",
        content:
          "Тревел-ассистент — персональное сопровождение по Бали: подготовка к поездке, прилёт, трансфер, жильё, визовые вопросы, связь, байк, обмен и помощь с нестандартными ситуациями.",
      },
    ],
  },
  {
    id: "thailand",
    number: "02",
    name: "Таиланд",
    icon: "⌁",
    color: "blue",
    className: "destination-thailand",
    eyebrow: "Скоро больше услуг",
    description:
      "Обмен, визовые вопросы, недвижимость и яхты — собираем команду проверенных специалистов.",
    services: [
      {
        id: "exchange",
        name: "Обмен",
        icon: "↔",
        summary: "Обмен валюты в Таиланде.",
        status: "soon",
      },
      {
        id: "visas",
        name: "Визы",
        icon: "▣",
        summary: "Помощь с визовыми вопросами в Таиланде.",
        status: "soon",
      },
      {
        id: "property",
        name: "Недвижимость",
        icon: "⌂",
        summary: "Аренда, покупка и проверка недвижимости.",
        status: "soon",
      },
      {
        id: "yachts",
        name: "Яхты",
        icon: "≈",
        summary: "Прогулки и аренда яхт.",
        status: "soon",
      },
    ],
  },
  {
    id: "russia",
    number: "03",
    name: "Россия",
    icon: "◇",
    color: "violet",
    className: "destination-russia",
    eyebrow: "Петербург · Урал · Кавказ",
    description:
      "SUP-туры, прогулки на катере, сплавы, ретриты и живые маршруты с локальными гидами.",
    services: [
      {
        id: "spb",
        name: "Санкт-Петербург",
        icon: "≋",
        summary: "Вода, город и камерные путешествия рядом с Петербургом.",
        children: [
          {
            id: "sup-spb",
            name: "SUP-туры",
            icon: "≈",
            summary: "Маршруты на SUP-досках с локальным гидом.",
            status: "soon",
          },
          {
            id: "boat-spb",
            name: "Прогулка на катере",
            icon: "⌁",
            summary: "Водные прогулки по Петербургу и окрестностям.",
            status: "soon",
          },
          {
            id: "fire-spb",
            name: "Посиделки у костра",
            icon: "△",
            summary: "Тёплая встреча на природе с организацией на месте.",
            status: "soon",
          },
        ],
      },
      {
        id: "ural",
        name: "Урал",
        icon: "△",
        summary: "Активные маршруты и ретриты на Южном Урале.",
        children: [
          {
            id: "sup-ural",
            name: "SUP-тур",
            icon: "≈",
            summary: "Прогулки по уральским озёрам.",
            status: "soon",
          },
          {
            id: "rafting-ural",
            name: "Сплав",
            icon: "⌁",
            summary: "Маршруты по рекам с организацией и сопровождением.",
            status: "soon",
          },
          {
            id: "fire-ural",
            name: "Посиделки у костра",
            icon: "△",
            summary: "Выезд на природу и камерная встреча.",
            status: "soon",
          },
          {
            id: "retreat-ural",
            name: "Организовать ретрит",
            icon: "◎",
            summary: "Подготовка программы, площадки и бытовой части ретрита.",
            status: "soon",
          },
        ],
      },
      {
        id: "caucasus",
        name: "Кавказ",
        icon: "▲",
        summary: "Маршруты и услуги на Кавказе находятся в подготовке.",
        status: "soon",
      },
    ],
  },
  {
    id: "nepal",
    number: "04",
    name: "Непал",
    icon: "△",
    color: "orange",
    className: "destination-nepal",
    eyebrow: "Трекинг и экспедиции",
    description:
      "Кайлас, Эверест и Аннапурна: гиды, трансферы и жильё для серьёзного путешествия.",
    services: [
      {
        id: "kailash",
        name: "Трекинг на Кайлас",
        icon: "△",
        summary: "Подготовка и сопровождение маршрута к Кайласу.",
        status: "soon",
      },
      {
        id: "everest",
        name: "Трекинг к Эвересту",
        icon: "▲",
        summary: "Маршруты в регионе Эвереста.",
        status: "soon",
      },
      {
        id: "annapurna",
        name: "Хребет Аннапурна",
        icon: "⌁",
        summary: "Трекинг по одному из главных маршрутов Непала.",
        status: "soon",
      },
      {
        id: "transfer",
        name: "Трансфер",
        icon: "→",
        summary: "Трансферы между аэропортом, городами и точками маршрута.",
        status: "soon",
      },
      {
        id: "housing",
        name: "Жильё",
        icon: "⌂",
        summary: "Подбор жилья до и после трекинга.",
        status: "soon",
      },
      {
        id: "guide",
        name: "Гид",
        icon: "◎",
        summary: "Локальное сопровождение и помощь по маршруту.",
        status: "soon",
      },
    ],
  },
] as const;

export function destinationById(id: string | null) {
  return destinations.find((destination) => destination.id === id) ?? null;
}

export function serviceById(destinationId: string, serviceId: string) {
  return (
    destinationById(destinationId)?.services.find(
      (service) => service.id === serviceId,
    ) ?? null
  );
}

export function itemById(
  destinationId: string,
  serviceId: string,
  itemId: string,
) {
  return (
    serviceById(destinationId, serviceId)?.children?.find(
      (item) => item.id === itemId,
    ) ?? null
  );
}

export function routeContextFor(
  destination: Destination,
  service: CatalogItem,
  item?: CatalogItem | null,
) {
  return {
    country: destination.name,
    city:
      destination.id === "russia" && service.id === "spb"
        ? "Санкт-Петербург"
        : undefined,
    section:
      destination.id === "bali" && service.id === "visas"
        ? "Визы"
        : service.name,
    service: item?.name,
  };
}
