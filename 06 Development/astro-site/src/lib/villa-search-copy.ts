import type {PublicRouteLocale} from "./public-locale";

interface VillaSearchCopy {
  title: string;
  description: string;
  place: string;
  lead: string;
  processHeading: string;
  steps: readonly [
    {title: string; text: string},
    {title: string; text: string},
    {title: string; text: string},
  ];
  messageHeading: string;
  message: string;
  supportButton: string;
  telegramLink: string;
}

export const villaSearchCopy = {
  ru: {
    title: "Поиск виллы на Бали",
    description: "Подбор вилл для помесячной аренды на Бали. Уточняем требования, проверяем объявления и собираем варианты на карте.",
    place: "Бали",
    lead: "Подбираем виллы для помесячной аренды на Бали. Расскажите, когда хотите заехать, на какой срок, в каком районе и с каким бюджетом. Уточним, что для вас важно: тишина, частный бассейн, количество спален или закрытая кухня.",
    processHeading: "Как проходит поиск",
    steps: [
      {title: "Уточняем запрос.", text: "Согласуем районы, бюджет, даты и обязательные условия."},
      {title: "Собираем варианты.", text: "Сверяем описание и фотографии, проверяем цену и минимальный срок аренды. Если в объявлении не хватает информации, уточняем её у владельца или управляющего."},
      {title: "Открываем подборку.", text: "Вы получаете ссылку на карту с примерными районами и карточками вилл. В каждой карточке указаны цена, основные условия и этап проверки. По той же ссылке видно, какие даты уже подтверждены и где мы ещё ждём ответа."},
    ],
    messageHeading: "Что указать в первом сообщении",
    message: "Даты заезда, срок, бюджет в месяц, желаемые районы, количество спален и условия, без которых вариант вам не подойдёт.",
    supportButton: "Обсудить поиск виллы",
    telegramLink: "Написать в поддержку SAFRWAY в Telegram",
  },
  en: {
    title: "Find a villa in Bali",
    description: "Find villas for monthly rent in Bali. We clarify your requirements, check listings and put the options on a map.",
    place: "Bali",
    lead: "We find villas for monthly rent in Bali. Tell us when you want to move in, how long you plan to stay, which area you prefer and your budget. We'll ask what matters to you, such as a quiet location, a private pool, the number of bedrooms or an enclosed kitchen.",
    processHeading: "How the search works",
    steps: [
      {title: "We clarify your request.", text: "We agree on the areas, budget, dates and requirements that matter most."},
      {title: "We collect options.", text: "We compare descriptions and photos and check the price and minimum rental period. If details are missing from a listing, we ask the owner or property manager."},
      {title: "We share the shortlist.", text: "You receive a map link with approximate areas and villa cards. Each card shows the price, key terms and what stage the checks have reached. The same link shows which dates are confirmed and where we're still waiting for a reply."},
    ],
    messageHeading: "What to include in your first message",
    message: "Your move-in dates, length of stay, monthly budget, preferred areas, number of bedrooms and any requirements a villa needs to meet.",
    supportButton: "Discuss your villa search",
    telegramLink: "Message SAFRWAY support on Telegram",
  },
  de: {
    title: "Villasuche auf Bali",
    description: "Wir finden Villen zur Monatsmiete auf Bali, klären Ihre Wünsche, prüfen Anzeigen und sammeln passende Optionen auf einer Karte.",
    place: "Bali",
    lead: "Wir suchen Villen zur Monatsmiete auf Bali. Teilen Sie uns mit, wann Sie einziehen möchten, wie lange Sie bleiben, welche Gegend Sie bevorzugen und welches Budget Sie haben. Wir klären, was Ihnen wichtig ist, etwa eine ruhige Lage, ein privater Pool, die Anzahl der Schlafzimmer oder eine geschlossene Küche.",
    processHeading: "So läuft die Suche ab",
    steps: [
      {title: "Wir klären Ihre Anfrage.", text: "Wir stimmen Gegenden, Budget, Termine und unverzichtbare Bedingungen mit Ihnen ab."},
      {title: "Wir sammeln passende Angebote.", text: "Wir gleichen Beschreibungen und Fotos ab und prüfen den Preis und die Mindestmietdauer. Fehlen Angaben in einer Anzeige, fragen wir beim Eigentümer oder der Hausverwaltung nach."},
      {title: "Wir teilen die Auswahl.", text: "Sie erhalten einen Kartenlink mit ungefähren Gegenden und Karten zu den Villen. Jede Karte enthält den Preis, die wichtigsten Bedingungen und den Stand der Prüfung. Über denselben Link sehen Sie, welche Termine bestätigt sind und wo noch eine Antwort aussteht."},
    ],
    messageHeading: "Was in Ihre erste Nachricht gehört",
    message: "Einzugstermine, Mietdauer, Monatsbudget, bevorzugte Gegenden, Anzahl der Schlafzimmer und Bedingungen, die eine Villa unbedingt erfüllen muss.",
    supportButton: "Villasuche besprechen",
    telegramLink: "Den SAFRWAY-Support auf Telegram anschreiben",
  },
  fr: {
    title: "Trouver une villa à Bali",
    description: "Recherche de villas à louer au mois à Bali. Nous précisons vos besoins, vérifions les annonces et regroupons les options sur une carte.",
    place: "Bali",
    lead: "Nous recherchons des villas à louer au mois à Bali. Indiquez votre date d’arrivée, la durée du séjour, la zone souhaitée et votre budget. Nous préciserons vos priorités, par exemple le calme, une piscine privée, le nombre de chambres ou une cuisine fermée.",
    processHeading: "Comment se déroule la recherche",
    steps: [
      {title: "Nous précisons votre demande.", text: "Nous convenons avec vous des zones, du budget, des dates et des critères indispensables."},
      {title: "Nous recueillons les options.", text: "Nous comparons les descriptions et les photos, puis vérifions le prix et la durée minimale de location. Si une annonce est incomplète, nous demandons les précisions au propriétaire ou au gestionnaire."},
      {title: "Nous partageons la sélection.", text: "Vous recevez un lien vers une carte qui indique les zones approximatives et présente les fiches des villas. Chaque fiche indique le prix, les principales conditions et l’état des vérifications. Le même lien montre les dates confirmées et les réponses encore attendues."},
    ],
    messageHeading: "Que préciser dans votre premier message",
    message: "Indiquez les dates d’arrivée, la durée, le budget mensuel, les zones souhaitées, le nombre de chambres et les critères indispensables.",
    supportButton: "Discuter de votre recherche de villa",
    telegramLink: "Écrire à l’assistance SAFRWAY sur Telegram",
  },
  es: {
    title: "Encuentra una villa en Bali",
    description: "Búsqueda de villas de alquiler mensual en Bali. Aclaramos tus requisitos, comprobamos los anuncios y reunimos las opciones en un mapa.",
    place: "Bali",
    lead: "Buscamos villas de alquiler mensual en Bali. Cuéntanos cuándo quieres instalarte, cuánto tiempo te quedarás, en qué zona y con qué presupuesto. Aclararemos qué es importante para ti, como la tranquilidad, una piscina privada, el número de dormitorios o una cocina cerrada.",
    processHeading: "Cómo funciona la búsqueda",
    steps: [
      {title: "Aclaramos tu solicitud.", text: "Acordamos contigo las zonas, el presupuesto, las fechas y los requisitos imprescindibles."},
      {title: "Reunimos opciones.", text: "Contrastamos las descripciones y las fotos, y comprobamos el precio y el plazo mínimo de alquiler. Si faltan datos en un anuncio, se los pedimos a la persona propietaria o gestora."},
      {title: "Compartimos la selección.", text: "Recibes un enlace a un mapa con zonas aproximadas y fichas de las villas. Cada ficha indica el precio, las condiciones principales y el estado de la comprobación. En el mismo enlace puedes ver qué fechas están confirmadas y dónde seguimos esperando respuesta."},
    ],
    messageHeading: "Qué indicar en el primer mensaje",
    message: "Fechas de entrada, duración, presupuesto mensual, zonas preferidas, número de dormitorios y los requisitos que la villa debe cumplir.",
    supportButton: "Hablar sobre tu búsqueda de villa",
    telegramLink: "Escribir al equipo de asistencia de SAFRWAY en Telegram",
  },
  "zh-Hans": {
    title: "在巴厘岛找别墅",
    description: "帮您在巴厘岛寻找可按月租住的别墅。我们会确认需求、核对房源信息，并在地图上整理备选房源。",
    place: "巴厘岛",
    lead: "我们帮您在巴厘岛寻找可按月租住的别墅。请告诉我们您计划何时入住、住多久、希望住在哪个区域，以及您的预算。我们会进一步确认您看重的条件，例如环境安静、私人泳池、卧室数量或封闭式厨房。",
    processHeading: "找房流程",
    steps: [
      {title: "确认需求。", text: "和您确认区域、预算、日期与必须满足的条件。"},
      {title: "收集备选房源。", text: "我们核对描述和照片，并确认价格和最短租期。如果房源信息不完整，我们会向房东或管理人员核实。"},
      {title: "分享筛选结果。", text: "您会收到一个地图链接，其中标出大致区域并列出别墅卡片。每张卡片都注明价格、主要条件和核实进度。您也可以通过同一链接查看哪些日期已确认，哪些房源还在等待回复。"},
    ],
    messageHeading: "第一条消息请说明哪些信息",
    message: "请提供入住日期、租期、每月预算、意向区域、卧室数量，以及必须满足的条件。",
    supportButton: "和我们聊聊找别墅的需求",
    telegramLink: "在 Telegram 联系 SAFRWAY 客服",
  },
  hi: {
    title: "बाली में विला की तलाश",
    description: "बाली में मासिक किराये के विला खोजें। हम आपकी ज़रूरतें समझते हैं, विज्ञापनों की जाँच करते हैं और विकल्पों को नक्शे पर दिखाते हैं।",
    place: "बाली",
    lead: "हम बाली में मासिक किराये के विला ढूँढते हैं। बताइए कि आप कब पहुँचना चाहते हैं, कितने समय के लिए, किस इलाके में और किस बजट में। हम आपकी प्राथमिकताएँ समझेंगे, जैसे शांत जगह, निजी पूल, बेडरूम की संख्या या बंद रसोई।",
    processHeading: "तलाश कैसे होती है",
    steps: [
      {title: "हम आपकी ज़रूरतें समझते हैं।", text: "हम आपके साथ इलाके, बजट, तारीखें और ज़रूरी शर्तें तय करते हैं।"},
      {title: "हम विकल्प जुटाते हैं।", text: "हम विवरण और तस्वीरों का मिलान करते हैं और किराये व न्यूनतम किराया अवधि की जाँच करते हैं। अगर विज्ञापन में कोई जानकारी कम है, तो हम मालिक या प्रबंधक से पूछते हैं।"},
      {title: "हम चुने हुए विकल्प साझा करते हैं।", text: "आपको नक्शे का लिंक मिलता है, जिसमें अनुमानित इलाके और विला की जानकारी वाले कार्ड होते हैं। हर कार्ड में कीमत, मुख्य शर्तें और जाँच की स्थिति होती है। उसी लिंक पर दिखता है कि कौन-सी तारीखें पक्की हैं और किन विकल्पों के लिए अभी जवाब आना बाकी है।"},
    ],
    messageHeading: "पहले संदेश में क्या लिखें",
    message: "आने की तारीखें, ठहरने की अवधि, मासिक बजट, पसंदीदा इलाके, बेडरूम की संख्या और आपकी अनिवार्य शर्तें।",
    supportButton: "विला की तलाश पर बात करें",
    telegramLink: "Telegram पर SAFRWAY सहायता टीम को लिखें",
  },
  ar: {
    title: "البحث عن فيلا في بالي",
    description: "نبحث عن فلل للإيجار الشهري في بالي. نحدد متطلباتك، ونتحقق من الإعلانات، ونجمع الخيارات على خريطة.",
    place: "بالي",
    lead: "نبحث عن فلل للإيجار الشهري في بالي. أخبرنا بموعد وصولك، والمدة، والمنطقة التي تفضلها، وميزانيتك. نحدد معك ما يهمك، مثل الهدوء أو وجود مسبح خاص أو عدد غرف النوم أو مطبخ مغلق.",
    processHeading: "كيف تجري عملية البحث",
    steps: [
      {title: "نحدد تفاصيل طلبك.", text: "نتفق معك على المناطق والميزانية والتواريخ والشروط الأساسية."},
      {title: "نجمع الخيارات.", text: "نطابق الأوصاف مع الصور ونتحقق من السعر والحد الأدنى لمدة الإيجار. عند نقص المعلومات في الإعلان، نستوضحها من المالك أو المسؤول عن العقار."},
      {title: "نشاركك الخيارات المختارة.", text: "تتلقى رابطًا لخريطة تعرض المناطق التقريبية وبطاقات الفلل. تتضمن كل بطاقة السعر والشروط الرئيسية ومرحلة التحقق. ومن الرابط نفسه يمكنك معرفة التواريخ المؤكدة والخيارات التي ما زلنا ننتظر ردًا بشأنها."},
    ],
    messageHeading: "ما الذي تذكره في رسالتك الأولى",
    message: "تواريخ الوصول، ومدة الإقامة، والميزانية الشهرية، والمناطق المفضلة، وعدد غرف النوم، والشروط الأساسية لاختيار الفيلا.",
    supportButton: "ناقش معنا البحث عن فيلا",
    telegramLink: "راسل فريق دعم SAFRWAY على Telegram",
  },
  ko: {
    title: "발리 빌라 찾기",
    description: "발리에서 월 단위로 임대할 수 있는 빌라를 찾습니다. 요청 사항을 확인하고 매물 정보를 검토해 지도에 후보를 정리합니다.",
    place: "발리",
    lead: "발리에서 월 단위로 임대할 수 있는 빌라를 찾아 드립니다. 입주 시기와 기간, 원하는 지역과 예산을 알려 주세요. 조용한 환경, 전용 수영장, 침실 수, 분리된 실내 주방처럼 중요하게 생각하는 조건을 확인합니다.",
    processHeading: "빌라를 찾는 과정",
    steps: [
      {title: "요청을 확인합니다.", text: "원하는 지역, 예산, 날짜, 필수 조건을 함께 정합니다."},
      {title: "후보를 모읍니다.", text: "설명과 사진을 대조하고 가격과 최소 임대 기간을 확인합니다. 매물에 빠진 정보가 있으면 소유주나 관리자에게 문의합니다."},
      {title: "후보 목록을 공유합니다.", text: "대략적인 지역과 빌라 정보 카드가 표시된 지도 링크를 보내 드립니다. 각 카드에는 가격, 주요 조건, 확인 진행 상황이 나옵니다. 같은 링크에서 확정된 날짜와 아직 답변을 기다리는 후보를 확인할 수 있습니다."},
    ],
    messageHeading: "첫 메시지에 적을 내용",
    message: "입주 날짜, 기간, 월 예산, 선호 지역, 침실 수, 반드시 충족해야 하는 조건을 알려 주세요.",
    supportButton: "빌라 찾기 상담하기",
    telegramLink: "Telegram에서 SAFRWAY 지원팀에 메시지 보내기",
  },
  ja: {
    title: "バリ島のヴィラ探し",
    description: "バリ島で月単位で借りられるヴィラを探します。ご希望を確認し、物件情報を照合して、候補を地図にまとめます。",
    place: "バリ島",
    lead: "バリ島で月単位で借りられるヴィラをお探しします。入居希望日、滞在期間、希望エリア、ご予算をお知らせください。静かな環境、専用プール、寝室数、独立した屋内キッチンなど、重視する点も確認します。",
    processHeading: "ヴィラ探しの流れ",
    steps: [
      {title: "ご希望を確認します。", text: "エリア、ご予算、日程、必須条件をすり合わせます。"},
      {title: "候補を集めます。", text: "物件の説明と写真を照らし合わせ、料金と最低賃貸期間を確認します。掲載情報に不足があれば、オーナーや管理者に確認します。"},
      {title: "候補リストを共有します。", text: "おおよそのエリアとヴィラ情報のカードを載せた地図のリンクをお送りします。カードには料金、主な条件、確認の進捗が表示されます。同じリンクから、確定した日程と返答待ちの候補を確認できます。"},
    ],
    messageHeading: "最初のメッセージに記載すること",
    message: "入居日、期間、月々のご予算、希望エリア、寝室数、必須条件をお知らせください。",
    supportButton: "ヴィラ探しについて相談する",
    telegramLink: "TelegramでSAFRWAYサポートに連絡する",
  },
} satisfies Record<PublicRouteLocale, VillaSearchCopy>;
