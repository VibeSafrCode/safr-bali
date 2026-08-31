from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "downloads" / "all-indonesia-client-guide-safrway-2026.pdf"
OFFICIAL_URL = "https://allindonesia.imigrasi.go.id/"
BRAND = colors.HexColor("#0B2B22")
ACCENT = colors.HexColor("#F37A59")
PAPER = colors.HexColor("#F7F3EA")
MUTED = colors.HexColor("#66756F")
INK = colors.HexColor("#13231E")


def register_fonts() -> None:
    candidates = [
        ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
        ("/Library/Fonts/Arial.ttf", "/Library/Fonts/Arial Bold.ttf"),
    ]
    for regular, bold in candidates:
        if Path(regular).exists() and Path(bold).exists():
            pdfmetrics.registerFont(TTFont("SafrSans", regular))
            pdfmetrics.registerFont(TTFont("SafrSansBold", bold))
            return
    raise RuntimeError("A Cyrillic Arial font is required to generate the guide")


register_fonts()
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideTitle", fontName="SafrSansBold", fontSize=27, leading=30, textColor=BRAND, spaceAfter=6))
styles.add(ParagraphStyle(name="GuideSubtitle", fontName="SafrSans", fontSize=12, leading=17, textColor=MUTED, spaceAfter=12))
styles.add(ParagraphStyle(name="GuideBody", fontName="SafrSans", fontSize=10.4, leading=15.2, textColor=INK, spaceAfter=8))
styles.add(ParagraphStyle(name="GuideBullet", parent=styles["GuideBody"], leftIndent=13, firstLineIndent=-8, bulletIndent=2, spaceAfter=5))
styles.add(ParagraphStyle(name="GuideCalloutTitle", fontName="SafrSansBold", fontSize=10.3, leading=14, textColor=BRAND, spaceAfter=3))
styles.add(ParagraphStyle(name="GuideCalloutBody", fontName="SafrSans", fontSize=9.5, leading=14, textColor=INK))
styles.add(ParagraphStyle(name="CoverEyebrow", fontName="SafrSansBold", fontSize=9, leading=12, textColor=ACCENT, tracking=1.2, spaceAfter=9))
styles.add(ParagraphStyle(name="CoverTitle", fontName="SafrSansBold", fontSize=35, leading=38, textColor=colors.white, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverLead", fontName="SafrSans", fontSize=13, leading=19, textColor=colors.HexColor("#E7EFEA"), spaceAfter=16))
styles.add(ParagraphStyle(name="CoverMeta", fontName="SafrSans", fontSize=9.5, leading=14, textColor=colors.HexColor("#BFD0C8")))


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(BRAND)
    canvas.rect(0, height - 17 * mm, width, 17 * mm, stroke=0, fill=1)
    canvas.setFont("SafrSansBold", 8.5)
    canvas.setFillColor(colors.white)
    canvas.drawString(18 * mm, height - 10.8 * mm, "ALL INDONESIA  •  КЛИЕНТСКИЙ ГАЙД SAFRWAY")
    canvas.setStrokeColor(colors.HexColor("#D9E2DD"))
    canvas.line(18 * mm, 14 * mm, width - 18 * mm, 14 * mm)
    canvas.setFont("SafrSans", 7.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 8.5 * mm, "safrway.online  •  официальный портал: allindonesia.imigrasi.go.id")
    canvas.drawRightString(width - 18 * mm, 8.5 * mm, f"SAFRWAY  •  стр. {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=25 * mm,
    bottomMargin=20 * mm,
    title="All Indonesia — клиентский гайд SAFRWAY 2026 (безопасная публичная версия)",
    author="SAFRWAY",
    subject="Практическая инструкция по официальной декларации прибытия All Indonesia",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="guide")
doc.addPageTemplates(PageTemplate(id="guide", frames=[frame], onPage=header_footer))


def callout(title: str, body: str):
    table = Table(
        [[Paragraph(title, styles["GuideCalloutTitle"]), Paragraph(body, styles["GuideCalloutBody"])]],
        colWidths=[52 * mm, 112 * mm],
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E7EFEA")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#B9CBC3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([Spacer(1, 4), table])


def section(title: str, intro: str, bullets: list[str], note: tuple[str, str] | None = None):
    story = [Paragraph(title, styles["GuideTitle"]), Paragraph(intro, styles["GuideBody"]), Spacer(1, 2)]
    story.extend(Paragraph(f"• {item}", styles["GuideBullet"]) for item in bullets)
    if note:
        story.extend([Spacer(1, 8), callout(*note)])
    story.append(PageBreak())
    return story


story = []
cover = Table(
    [[
        Paragraph(
            "<font color='#F37A59'>SAFRWAY  •  ПУБЛИЧНАЯ ВЕРСИЯ 25.08.2026</font><br/><br/>"
            "<font size='35'><b>ALL INDONESIA</b></font><br/><br/>"
            "Безопасный практический гайд по официальной декларации прибытия в Индонезию<br/><br/>"
            "<font size='10' color='#BFD0C8'>Для иностранных гостей  •  Индонезия / Бали</font>",
            styles["CoverLead"],
        )
    ]],
    colWidths=[164 * mm],
    rowHeights=[92 * mm],
)
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), BRAND),
    ("BOX", (0, 0), (-1, -1), 0, BRAND),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 18 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 18 * mm),
]))
story.extend([
    Spacer(1, 8 * mm),
    cover,
    Spacer(1, 10 * mm),
    callout(
        "Официальная форма бесплатна",
        "Заполняйте декларацию только на официальном портале. Помощь SAFRWAY — отдельная услуга; её текущая цена всегда показывается в опубликованном каталоге сайта, Mini App и бота.",
    ),
    Spacer(1, 8 * mm),
    Paragraph(f"<link href='{OFFICIAL_URL}' color='#0B2B22'><b>Открыть официальный портал All Indonesia →</b></link>", styles["GuideBody"]),
    Paragraph("Сохраните этот PDF на телефон заранее, чтобы инструкция оставалась под рукой при нестабильном интернете.", styles["GuideSubtitle"]),
    PageBreak(),
])

story += section(
    "1. Что такое All Indonesia",
    "All Indonesia — официальный единый цифровой сервис декларации прибытия. Он объединяет сведения для иммиграции, таможни, здоровья и карантина.",
    [
        "Официальный адрес: allindonesia.imigrasi.go.id.",
        "Форму можно заполнить начиная за 3 дня (H-3) до прибытия в Индонезию.",
        "Государственная форма заполняется бесплатно.",
        "После успешной отправки сохраните полученный QR-код.",
    ],
    ("Проверяйте адрес", "Не вводите паспортные или поездочные данные на сайтах-клонах и в неизвестных формах."),
)
story += section(
    "2. Подготовка перед заполнением",
    "Состав полей официальной формы может меняться. Подготовьте документы и сведения, которые портал запрашивает в текущей версии, и вводите только фактические данные путешественника.",
    [
        "Откройте официальный портал и выберите категорию иностранного гостя.",
        "Держите рядом паспорт и актуальные сведения о поездке и проживании.",
        "Используйте доступные телефон и email, если текущая форма их запрашивает.",
        "Не копируйте вымышленные данные из примеров или чужих деклараций.",
    ],
    ("Если термин непонятен", "Сначала прочитайте подсказку текущего портала. Не выбирайте значение наугад."),
)
story += section(
    "3. Личные данные",
    "Переносите данные из паспорта точно и без догадок. Сверяйте написание имени, номер документа и даты с документом и текущей формой.",
    [
        "Проверьте каждую букву и цифру до перехода дальше.",
        "Не исправляйте написание имени «для удобства», если оно отличается от паспорта.",
        "Не используйте данные другого путешественника.",
        "Если документ или поле вызывает сомнение, остановитесь и запросите помощь до отправки.",
    ],
    ("Персональные данные", "Не отправляйте паспорт, визу, билет, адрес, телефон или email в Telegram и другие открытые чаты."),
)
story += section(
    "4. Поездка и разрешение на въезд",
    "Указывайте фактические данные поездки и разрешительных документов так, как они обозначены в текущей официальной форме и в ваших документах.",
    [
        "Сверьте даты поездки с билетами и реальным планом.",
        "Сверьте данные визы или разрешения на пребывание с выданным документом.",
        "Укажите фактическое первое место проживания, если форма его запрашивает.",
        "Не подменяйте реальный маршрут максимальным сроком визы или предположением.",
    ],
    ("Границы гайда", "Этот материал не определяет иммиграционный статус и не заменяет официальные требования или консультацию профильного специалиста."),
)
story += section(
    "5. Таможня, здоровье и карантин",
    "All Indonesia объединяет несколько видов деклараций. Отвечайте на каждый вопрос по факту и ориентируйтесь на формулировки портала в момент заполнения.",
    [
        "Указывайте фактическое содержимое багажа и товары, которые подлежат декларированию.",
        "На вопросы здоровья и карантина отвечайте правдиво.",
        "Не пропускайте предупреждения и обязательные подтверждения формы.",
        "Если правило непонятно, проверьте официальный источник или обратитесь за помощью до отправки.",
    ],
    ("Не угадывайте", "Неверное значение, выбранное «примерно», может сделать декларацию недостоверной. Лучше остановиться и уточнить."),
)
story += section(
    "6. Проверка, отправка и QR-код",
    "Перед отправкой ещё раз просмотрите все введённые сведения. После подтверждения сохраните QR-код так, чтобы он был доступен без интернета.",
    [
        "Проверьте личные данные, документы, даты, поездку, контакты и декларации.",
        "Исправьте обнаруженную ошибку до отправки.",
        "После успешной отправки сохраните QR-код на телефон.",
        "Сделайте резервный скриншот или сохраните подтверждение в файлы устройства.",
    ],
    ("Конфиденциальность", "Не публикуйте QR-код и персональные данные в открытых каналах."),
)
story += section(
    "7. Если форма не работает",
    "Технические сбои не меняют требования к достоверности данных. Не отправляйте несколько разных деклараций, пока не поняли результат предыдущей попытки.",
    [
        "Проверьте интернет-соединение и повторно откройте официальный адрес.",
        "Попробуйте актуальную версию другого браузера или приватное окно.",
        "Если мешает VPN или Private Relay, временно отключите его и повторите попытку.",
        "Если результат отправки неясен, сохраните экран ошибки и запросите помощь без передачи документов в открытый чат.",
    ],
    ("Не торопитесь повторять", "Сначала проверьте, не было ли создано подтверждение или QR-код после первой попытки."),
)
story += section(
    "8. Помощь SAFRWAY",
    "Путешественник может заполнить бесплатную государственную форму самостоятельно. Если нужна помощь человека, SAFRWAY предлагает отдельную услугу заполнения и проверки данных по актуальной опубликованной цене.",
    [
        "Текущая цена одинакова в боте, на сайте, в Admin и Mini App.",
        "Менеджер объяснит порядок работы и предоставит одобренный безопасный способ передачи необходимых данных.",
        "Не отправляйте паспорт, визу, билет, адрес, телефон или email в Telegram.",
        "Клиент проверяет итоговые персональные данные и ответы перед отправкой.",
        "SAFRWAY не является государственным органом и не взимает плату за саму официальную форму.",
    ],
    ("Безопасный способ", "Передавайте документы только способом, который менеджер обозначил как защищённый и доступный для вашего заказа."),
)

story.extend([
    Paragraph("9. Официальные источники и границы гайда", styles["GuideTitle"]),
    Paragraph(f"<link href='{OFFICIAL_URL}' color='#0B2B22'><b>Официальный портал All Indonesia</b></link>", styles["GuideBody"]),
    Paragraph("Главное управление таможни и акцизов Индонезии: All Indonesia", styles["GuideBody"]),
    Paragraph("Официальная страница Electronic Customs Declaration", styles["GuideBody"]),
    Paragraph("Официальное сообщение Иммиграционной службы о запуске All Indonesia", styles["GuideBody"]),
    Spacer(1, 10),
    callout(
        "Актуальность",
        "Источники проверены 25.08.2026. Интерфейс и правила могут обновляться. Всегда ориентируйтесь на текущие подсказки официального портала.",
    ),
    Spacer(1, 12),
    Paragraph("Материал является практической инструкцией и не заменяет официальные требования, юридическую или иммиграционную консультацию.", styles["GuideBody"]),
    Paragraph("SAFRWAY  •  safrway.online  •  @safr_bali_bot — только для несекретных вопросов", styles["GuideSubtitle"]),
])

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc.build(story)
print(OUTPUT)
