import type { ClientUiLocale10 } from "./client-ui-bindings";

export const rentalUtilityCopy: Record<ClientUiLocale10, { utilities: string; electricity: string }> = {
  ru: { utilities: "Коммуналка", electricity: "Электричество · номер счётчика или лицевого счёта" },
  en: { utilities: "Utilities", electricity: "Electricity meter or account number" },
  "zh-Hans": { utilities: "公用事业", electricity: "电表号或用电账户号码" },
  ko: { utilities: "공과금", electricity: "전기 계량기 또는 고객 번호" },
  fr: { utilities: "Charges", electricity: "Numéro de compteur ou de compte d’électricité" },
  de: { utilities: "Nebenkosten", electricity: "Stromzähler- oder Vertragskontonummer" },
  ja: { utilities: "光熱費", electricity: "電気メーター番号または契約番号" },
  hi: { utilities: "उपयोगिता सेवाएँ", electricity: "बिजली मीटर या खाता नंबर" },
  es: { utilities: "Suministros", electricity: "Número de contador o cuenta de electricidad" },
  ar: { utilities: "المرافق", electricity: "رقم عداد الكهرباء أو الحساب" },
};

type RentalCopy = {
  add: string; kind: string; term: string; villa: string; bike: string; title: string; monthly: string; fixed: string;
  start: string; end: string; paymentStart: string; paymentEnd: string; amount: string; currency: string; pay: string; payCurrency: string;
  other: string; currencyCode: string; help: string; send: string; sent: string; save: string;
  saved: string; busy: string; retry: string; invalid: string;
};

export const clientRentalCopy: Record<ClientUiLocale10, RentalCopy> = {
  ru: {
    add: "Добавить аренду", kind: "Что арендуете", term: "Тип аренды", paymentStart: "Оплатить с", paymentEnd: "Оплатить по", villa: "Вилла", bike: "Байк", title: "Название", monthly: "Помесячно", fixed: "На срок",
    start: "Начало аренды", end: "Окончание аренды", amount: "Сумма аренды", currency: "Валюта аренды",
    pay: "Оплатить", payCurrency: "В какой валюте вам удобно перевести?", other: "Другая валюта", currencyCode: "Код валюты",
    help: "Менеджер подтвердит курс, итоговую сумму и реквизиты для перевода. SAFRWAY оплатит аренду арендодателю после получения перевода.",
    send: "Отправить заявку", sent: "Заявка отправлена. Ответ менеджера появится в чате.", save: "Сохранить аренду",
    saved: "Аренда добавлена.", busy: "Подождите…", retry: "Не удалось подтвердить результат. Повторите отправку.", invalid: "Проверьте введённые данные.",
  },
  en: {
    add: "Add rental", kind: "Rental item", term: "Rental term", paymentStart: "Pay from", paymentEnd: "Pay through", villa: "Villa", bike: "Motorbike", title: "Name", monthly: "Monthly", fixed: "Fixed term",
    start: "Rental starts", end: "Rental ends", amount: "Rent amount", currency: "Rent currency",
    pay: "Pay", payCurrency: "Which currency would you like to send?", other: "Other currency", currencyCode: "Currency code",
    help: "Your manager will confirm the rate, total and transfer details. SAFRWAY will pay your rental provider after receiving your transfer.",
    send: "Send request", sent: "Request sent. Your manager will reply in chat.", save: "Save rental",
    saved: "Rental added.", busy: "Please wait…", retry: "We could not confirm the result. Please retry.", invalid: "Check the information you entered.",
  },
  "zh-Hans": {
    add: "添加租赁", kind: "租赁项目", term: "租赁期限", paymentStart: "付款起始日", paymentEnd: "付款截止日", villa: "别墅", bike: "摩托车", title: "名称", monthly: "按月", fixed: "固定租期",
    start: "租赁开始", end: "租赁结束", amount: "租金金额", currency: "租金币种",
    pay: "付款", payCurrency: "您希望用哪种货币转账？", other: "其他货币", currencyCode: "货币代码",
    help: "经理会确认汇率、总金额和转账信息。收到款项后，SAFRWAY 将向出租方支付租金。",
    send: "发送申请", sent: "申请已发送。经理会在聊天中回复。", save: "保存租赁",
    saved: "已添加租赁。", busy: "请稍候…", retry: "无法确认结果，请重试。", invalid: "请检查输入的信息。",
  },
  ko: {
    add: "대여 추가", kind: "대여 항목", term: "대여 방식", paymentStart: "결제 대상 시작일", paymentEnd: "결제 대상 종료일", villa: "빌라", bike: "오토바이", title: "이름", monthly: "월 단위", fixed: "기간 지정",
    start: "대여 시작일", end: "대여 종료일", amount: "대여 금액", currency: "대여 통화",
    pay: "결제", payCurrency: "어떤 통화로 송금하시겠어요?", other: "다른 통화", currencyCode: "통화 코드",
    help: "담당자가 환율, 총액 및 송금 정보를 확인해 드립니다. SAFRWAY는 송금을 받은 후 임대인에게 대여료를 지급합니다.",
    send: "요청 보내기", sent: "요청을 보냈습니다. 담당자가 채팅으로 답변합니다.", save: "대여 저장",
    saved: "대여를 추가했습니다.", busy: "잠시만 기다려 주세요…", retry: "결과를 확인하지 못했습니다. 다시 시도해 주세요.", invalid: "입력한 정보를 확인해 주세요.",
  },
  fr: {
    add: "Ajouter une location", kind: "Bien loué", term: "Durée de location", paymentStart: "Payer à partir du", paymentEnd: "Payer jusqu’au", villa: "Villa", bike: "Moto", title: "Nom", monthly: "Au mois", fixed: "Durée fixe",
    start: "Début de location", end: "Fin de location", amount: "Montant du loyer", currency: "Devise du loyer",
    pay: "Payer", payCurrency: "Dans quelle devise souhaitez-vous faire le virement ?", other: "Autre devise", currencyCode: "Code de devise",
    help: "Votre gestionnaire confirmera le taux, le total et les coordonnées de virement. SAFRWAY paiera le loueur après réception du virement.",
    send: "Envoyer la demande", sent: "Demande envoyée. Votre gestionnaire répondra dans le chat.", save: "Enregistrer la location",
    saved: "Location ajoutée.", busy: "Veuillez patienter…", retry: "Le résultat n’a pas pu être confirmé. Réessayez.", invalid: "Vérifiez les informations saisies.",
  },
  de: {
    add: "Miete hinzufügen", kind: "Mietobjekt", term: "Mietdauer", paymentStart: "Zahlen ab", paymentEnd: "Zahlen bis", villa: "Villa", bike: "Motorrad", title: "Name", monthly: "Monatlich", fixed: "Feste Laufzeit",
    start: "Mietbeginn", end: "Mietende", amount: "Mietbetrag", currency: "Währung der Miete",
    pay: "Bezahlen", payCurrency: "In welcher Währung möchten Sie überweisen?", other: "Andere Währung", currencyCode: "Währungscode",
    help: "Ihr Ansprechpartner bestätigt Wechselkurs, Gesamtbetrag und Überweisungsdaten. Nach Eingang der Überweisung zahlt SAFRWAY an den Vermieter.",
    send: "Anfrage senden", sent: "Anfrage gesendet. Ihr Ansprechpartner antwortet im Chat.", save: "Miete speichern",
    saved: "Miete hinzugefügt.", busy: "Bitte warten…", retry: "Das Ergebnis konnte nicht bestätigt werden. Bitte versuchen Sie es erneut.", invalid: "Prüfen Sie Ihre Eingaben.",
  },
  ja: {
    add: "レンタルを追加", kind: "レンタル対象", term: "契約期間", paymentStart: "支払い対象の開始日", paymentEnd: "支払い対象の終了日", villa: "ヴィラ", bike: "バイク", title: "名称", monthly: "月単位", fixed: "期間指定",
    start: "レンタル開始日", end: "レンタル終了日", amount: "レンタル料金", currency: "レンタル料金の通貨",
    pay: "支払う", payCurrency: "どの通貨で送金しますか？", other: "その他の通貨", currencyCode: "通貨コード",
    help: "担当者が為替レート、合計金額、送金先を確認します。入金後、SAFRWAY が貸主にレンタル料金を支払います。",
    send: "リクエストを送信", sent: "送信しました。担当者がチャットで返信します。", save: "レンタルを保存",
    saved: "レンタルを追加しました。", busy: "お待ちください…", retry: "結果を確認できませんでした。もう一度お試しください。", invalid: "入力内容を確認してください。",
  },
  hi: {
    add: "किराया जोड़ें", kind: "किराये की चीज़", term: "किराये की अवधि", paymentStart: "इस तारीख से भुगतान", paymentEnd: "इस तारीख तक भुगतान", villa: "विला", bike: "मोटरबाइक", title: "नाम", monthly: "मासिक", fixed: "तय अवधि",
    start: "किराये की शुरुआत", end: "किराये की समाप्ति", amount: "किराये की राशि", currency: "किराये की मुद्रा",
    pay: "भुगतान करें", payCurrency: "आप किस मुद्रा में पैसे भेजना चाहते हैं?", other: "दूसरी मुद्रा", currencyCode: "मुद्रा कोड",
    help: "आपके प्रबंधक विनिमय दर, कुल राशि और ट्रांसफ़र का विवरण बताएँगे। पैसे मिलने के बाद SAFRWAY किराया देने वाले को भुगतान करेगा।",
    send: "अनुरोध भेजें", sent: "अनुरोध भेज दिया गया। आपके प्रबंधक चैट में जवाब देंगे।", save: "किराया सहेजें",
    saved: "किराया जोड़ दिया गया।", busy: "कृपया प्रतीक्षा करें…", retry: "नतीजे की पुष्टि नहीं हो सकी। फिर कोशिश करें।", invalid: "दर्ज की गई जानकारी जाँचें।",
  },
  es: {
    add: "Añadir alquiler", kind: "Bien alquilado", term: "Plazo del alquiler", paymentStart: "Pagar desde", paymentEnd: "Pagar hasta", villa: "Villa", bike: "Moto", title: "Nombre", monthly: "Mensual", fixed: "Plazo fijo",
    start: "Inicio del alquiler", end: "Fin del alquiler", amount: "Importe del alquiler", currency: "Moneda del alquiler",
    pay: "Pagar", payCurrency: "¿En qué moneda quieres hacer la transferencia?", other: "Otra moneda", currencyCode: "Código de moneda",
    help: "Tu gestor confirmará el tipo de cambio, el total y los datos para la transferencia. SAFRWAY pagará al arrendador cuando reciba el dinero.",
    send: "Enviar solicitud", sent: "Solicitud enviada. Tu gestor responderá en el chat.", save: "Guardar alquiler",
    saved: "Alquiler añadido.", busy: "Espera un momento…", retry: "No se pudo confirmar el resultado. Vuelve a intentarlo.", invalid: "Revisa los datos introducidos.",
  },
  ar: {
    add: "إضافة إيجار", kind: "العنصر المؤجّر", term: "مدة الإيجار", paymentStart: "الدفع من تاريخ", paymentEnd: "الدفع حتى تاريخ", villa: "فيلا", bike: "دراجة نارية", title: "الاسم", monthly: "شهري", fixed: "مدة محددة",
    start: "بداية الإيجار", end: "نهاية الإيجار", amount: "قيمة الإيجار", currency: "عملة الإيجار",
    pay: "ادفع", payCurrency: "بأي عملة تفضّل التحويل؟", other: "عملة أخرى", currencyCode: "رمز العملة",
    help: "سيؤكد المسؤول سعر الصرف والمبلغ الإجمالي وبيانات التحويل. بعد استلام الحوالة، ستدفع SAFRWAY قيمة الإيجار للمؤجّر.",
    send: "إرسال الطلب", sent: "تم إرسال الطلب. سيردّ المسؤول في المحادثة.", save: "حفظ الإيجار",
    saved: "تمت إضافة الإيجار.", busy: "يرجى الانتظار…", retry: "تعذّر تأكيد النتيجة. حاول مجددًا.", invalid: "تحقّق من البيانات التي أدخلتها.",
  },
};
