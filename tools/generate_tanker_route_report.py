from __future__ import annotations

import math
import os
from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Drawing, Line, Circle, String, Rect, Polygon
from reportlab.graphics import renderPDF
from reportlab.graphics.charts.textlabels import Label


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "turkey_to_russia_tanker_route_reference_report.pdf"
ATTACH = ROOT / "output" / "reference_attachments"

PAGE_W, PAGE_H = A4


try:
    pdfmetrics.registerFont(TTFont("MicrosoftYaHei", r"C:\Windows\Fonts\msyh.ttc"))
    pdfmetrics.registerFont(TTFont("MicrosoftYaHei-Bold", r"C:\Windows\Fonts\msyhbd.ttc"))
    FONT = "MicrosoftYaHei"
    FONT_BOLD = "MicrosoftYaHei-Bold"
except Exception:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    FONT = "STSong-Light"
    FONT_BOLD = "STSong-Light"


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def make_styles():
    styles = getSampleStyleSheet()
    base = ParagraphStyle(
        "BaseCN",
        parent=styles["Normal"],
        fontName=FONT,
        fontSize=9.2,
        leading=14.2,
        textColor=colors.HexColor("#1f2933"),
        wordWrap="CJK",
        spaceAfter=4,
    )
    return {
        "base": base,
        "small": ParagraphStyle("SmallCN", parent=base, fontSize=7.7, leading=10.5, textColor=colors.HexColor("#52616b")),
        "tiny": ParagraphStyle("TinyCN", parent=base, fontSize=6.8, leading=8.5, textColor=colors.HexColor("#52616b")),
        "title": ParagraphStyle(
            "TitleCN",
            parent=base,
            fontName=FONT_BOLD,
            fontSize=25,
            leading=31,
            alignment=TA_LEFT,
            textColor=colors.HexColor("#0b1f2a"),
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "SubtitleCN",
            parent=base,
            fontSize=11,
            leading=17,
            textColor=colors.HexColor("#425466"),
            spaceAfter=12,
        ),
        "h1": ParagraphStyle(
            "H1CN",
            parent=base,
            fontName=FONT_BOLD,
            fontSize=15,
            leading=20,
            textColor=colors.HexColor("#10384f"),
            spaceBefore=12,
            spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "H2CN",
            parent=base,
            fontName=FONT_BOLD,
            fontSize=11.2,
            leading=15,
            textColor=colors.HexColor("#165a72"),
            spaceBefore=8,
            spaceAfter=5,
        ),
        "box": ParagraphStyle(
            "BoxCN",
            parent=base,
            fontSize=8.6,
            leading=12.6,
            textColor=colors.HexColor("#1f2933"),
        ),
        "link": ParagraphStyle(
            "LinkCN",
            parent=base,
            fontSize=8.1,
            leading=11.5,
            textColor=colors.HexColor("#124f7a"),
        ),
        "center": ParagraphStyle("CenterCN", parent=base, alignment=TA_CENTER),
        "right": ParagraphStyle("RightCN", parent=base, alignment=TA_RIGHT),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base,
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor("#5b6770"),
        ),
    }


SOURCES = [
    ("土耳其外交部 - Turkish Straits", "土耳其海峽法律與交通安全背景", "https://www.mfa.gov.tr/the-turkish-straits.en.mfa"),
    ("土耳其外交部 - Montreux Convention", "商船通行自由與軍艦限制的區分", "https://www.mfa.gov.tr/implementation-of-the-montreux-convention.en.mfa"),
    ("Turkish Straits VTS User Guide", "VTS、TUBRAP、報告點、VHF、AIS、空高限制", "https://www.american-club.com/files/files/Turkish_Straits_Vessel_Traffic_Service_User_Guide.pdf"),
    ("Turkish Straits 2024 Implementation Directive", "土耳其海峽交通規則執行細節", "https://www.vda.org.tr/upload/duyuru/T%C3%BCrk%20Bo%C4%9Fazlar%C4%B1%20Deniz%20Trafik%20D%C3%BCzeni%20Y%C3%B6netmeli%C4%9Fi%20Uygulama%20Y%C3%B6nergesi%20%C4%B0ngilizce%20cevirisi%2001012024.pdf"),
    ("OCIMF Guidelines for Transiting the Turkish Straits", "油輪通航風險、等待、能見度、實務注意事項", "https://www.maritimecyprus.com/wp-content/uploads/2021/03/OCIMFguidelines-for-transiting-the-turkish-straits.pdf"),
    ("IMO MARPOL Special Areas", "地中海、黑海、波羅的海等特殊區域", "https://www.imo.org/en/ourwork/environment/pages/special-areas-marpol.aspx"),
    ("IMO Mediterranean SOx ECA notice", "2025-05-01 起地中海 SOx ECA 0.10% 硫限值", "https://www.imo.org/en/mediacentre/pages/whatsnew-2254.aspx"),
    ("IMO Ships' Routeing", "TSS、推薦航路等航路制官方背景", "https://www.imo.org/en/ourwork/safety/pages/shipsrouteing.aspx"),
    ("Copernicus Black Sea Physics", "黑海溫鹽、海流、海面高度等分析預報", "https://data.marine.copernicus.eu/product/BLKSEA_ANALYSISFORECAST_PHY_007_001/description"),
    ("Copernicus Black Sea Waves", "黑海波浪分析與 10 日預報", "https://data.marine.copernicus.eu/product/BLKSEA_ANALYSISFORECAST_WAV_007_003/description"),
    ("REMPEC", "地中海船舶污染預防、準備與應急合作", "https://www.rempec.org/en"),
    ("Black Sea Commission", "Bucharest Convention、黑海污染與油污事故協作", "https://www.blackseacommission.org/"),
    ("World Bank - Blueing the Black Sea 2025", "黑海污染診斷與區域治理背景", "https://openknowledge.worldbank.org/entities/publication/ce9e1ac2-6fe3-4e62-bb25-ae1aafb93bef"),
    ("MARAD Advisory 2026-003", "黑海/亞速海軍事行動與商船保全建議", "https://www.maritime.dot.gov/msci/2026-003-black-sea-and-sea-azov-military-combat-operations"),
    ("IMO Black Sea and Sea of Azov safety", "IMO 關於黑海/亞速海安全與保全的集中頁", "https://www.imo.org/en/MediaCentre/HotTopics/Pages/MaritimeSecurityandSafetyintheBlackSeaandSeaofAzov.aspx"),
    ("NATO Shipping Centre", "商船報告、警示與聯絡入口", "https://shipping.nato.int/"),
    ("Joint War Committee Listed Areas", "2026 戰爭、罷工、恐怖與相關風險區域", "https://lmalloyds.com/committee/joint-war-committee/"),
    ("UK OFSI Maritime Services Ban", "英國海運服務禁令與俄油價格上限指引", "https://www.gov.uk/government/publications/uk-maritime-services-ban-and-oil-price-cap-industry-guidance/uk-maritime-services-ban-and-oil-price-cap-industry-guidance"),
    ("OFAC Russian Oil Price Cap Guidance", "美國 OFAC 俄油/俄油品價格上限框架", "https://ofac.treasury.gov/media/931036/download?inline="),
    ("Price Cap Coalition Advisory", "海運油品貿易制裁規避風險與盡調做法", "https://ofac.treasury.gov/media/933506/download?inline="),
    ("European Commission transport sanctions", "EU 對俄運輸與海事限制總覽", "https://commission.europa.eu/topics/eu-solidarity-ukraine/eu-sanctions-against-russia-following-invasion-ukraine/sanctions-transport_en"),
    ("Danish Maritime Authority EU vessel list", "EU 指定船舶清單與高風險航運實務", "https://www.dma.dk/growth-and-framework-conditions/maritime-sanctions/sanctions-against-russia-and-belarus/eu-vessel-designations"),
    ("Rosmorport Novorossiysk VTS", "俄羅斯黑海港口 VTS 職能與證書", "https://www.rosmorport.com/nvr_serv_nav.html"),
    ("Rosmorport ecology", "Novorossiysk/Tuapse/Taman 疏浚與環保活動", "https://www.rosmorport.com/nvr_ecology.html"),
    ("Novorossiysk compulsory regulations", "Novorossiysk 港口、SPM、推薦航路規則", "https://bsamp.ru/docs/1622521442026Compulsory_Regulations_Novorossiysk.pdf"),
    ("BP Ceyhan terminal", "Ceyhan/BTC 海上油碼頭概況", "https://www.bp.com/en_az/azerbaijan/home/who-we-are/operationsprojects/terminals/ceyhan_terminal.html"),
    ("Ceyhan Toros terminal handbook", "Ceyhan 危險品/碼頭資訊與港口規則", "https://cdn.gac.com/prod/docs/TURKEY-Ceyhan_TRM-KE-002-TOROS-TERMINAL-INFORMATION-AND-PORT-REGULATIONS-HANDBOOK-2024.pdf"),
    ("TUPRAS", "土耳其煉廠與港口背景", "https://www.tupras.com.tr/en/"),
    ("NGA World Port Index", "港口位置、特徵、設施服務資料入口", "https://msi.nga.mil/Publications/WPI"),
    ("HELCOM Shipping", "波羅的海替代航線的環保特殊區域背景", "https://helcom.fi/action-areas/shipping/"),
]


SEGMENTS = [
    ("A", "土耳其裝貨港/錨地", "Ceyhan、Aliaga、Izmit/Tutunciftlik、Mersin/Atas 等", "貨品、碼頭相容性、靠泊限制、危險品申報、港口國/碼頭安檢、裝貨文件與制裁盡調。", "中-高"),
    ("B", "東地中海/愛琴海", "土耳其南岸或愛琴海出港後至達達尼爾南口", "Med SOx ECA 0.10% 硫限值；東地中海局部政治與海上救助/污染響應資源差異。", "中"),
    ("C", "達達尼爾海峽", "Canakkale Strait", "窄水道、TSS、報告點、能見度/流速限制、油輪/危險品船舶通航排隊。", "高"),
    ("D", "馬爾馬拉海", "Marmara Sea", "連接兩海峽的等待、交叉交通、漁船、錨地、污染敏感區。", "中-高"),
    ("E", "博斯普魯斯海峽", "Istanbul Strait", "急轉彎、強雙層流、城市密集岸線、渡輪/本地交通、所有油輪日間通航要求常構成延誤。", "高"),
    ("F", "黑海西南/中部", "Bosphorus 北口至俄羅斯黑海港口航路", "戰爭風險、漂雷/無人載具/導彈誤擊、氣象海況快速變化；需核對 NAVAREA III、NATO NSC、沿岸廣播。", "高"),
    ("G", "俄羅斯卸貨港", "Novorossiysk、Tuapse、Taman/Port Kavkaz 等", "VTS、引航、港口保全、制裁/指定船舶、港口設施受攻擊或營運中斷風險。", "高"),
]


ROUTE_OPTIONS = [
    ("主線：土耳其地中海/愛琴海 -> 俄羅斯黑海港", "Ceyhan/Aliaga/Izmit -> Dardanelles -> Marmara -> Bosphorus -> Black Sea -> Novorossiysk/Tuapse/Taman", "約 650-1,150 nm，取決於裝港。Ceyhan 至 Novorossiysk 約 900-1,050 nm 級別。", "最常見、最直接；核心風險集中在 Turkish Straits 與黑海戰爭風險。"),
    ("土耳其黑海港 -> 俄羅斯黑海港", "Samsun/Trabzon 等 -> Black Sea coast -> Novorossiysk/Tuapse/Taman", "約 250-600 nm。", "不經土耳其海峽，但仍處於黑海高保全/戰爭風險環境。"),
    ("長航線：土耳其 -> 俄羅斯波羅的海", "Turkey -> Mediterranean -> Gibraltar -> Atlantic/Channel/North Sea -> Danish Straits -> Ust-Luga/Primorsk", "通常超過 3,500 nm。", "需疊加 Gibraltar、English Channel/North Sea、Baltic ECA/冰況/港口限制；制裁與保險審查更重。"),
]


INSPECTION_CHECKS = [
    ("航線/通航", "核對實際裝卸港、吃水/空高、LOA、貨種、TSS、TSVTS 報告點、日間通航限制、引航與拖輪要求。"),
    ("海況/水文", "出航前抓取 Copernicus/氣象路由的黑海流、浪、風、能見度；冬季與風暴季需另加餘量。"),
    ("保全", "核對 MARAD、NATO NSC、NAVAREA III、沿岸廣播、JWC listed areas、船旗國保全通知；更新 SSP/VRA。"),
    ("環保", "確認 ECA 燃油切換、MARPOL 特殊區域排放限制、垃圾/油污/污水記錄、SOPEP/SMPEP 與油污應急聯絡。"),
    ("制裁/合規", "船舶、實益擁有人、管理人、保險、貨主、收貨人、碼頭、銀行、STS 歷史、AIS 歷史、價格上限/服務禁令適用性。"),
    ("文件", "保存裝貨指令、B/L、COO、質量/數量證書、租約、保險證書、P&I、港口許可、VTS/引航通信、航海日誌和 AIS 截圖。"),
]


def nm_between(lat1, lon1, lat2, lon2):
    r_nm = 3440.065
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r_nm * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def make_route_map():
    width, height = 16.8 * cm, 9.2 * cm
    d = Drawing(width, height)
    d.add(Rect(0, 0, width, height, fillColor=colors.HexColor("#eef6f8"), strokeColor=None))
    d.add(Polygon([0, height * 0.15, width * 0.33, height * 0.23, width * 0.45, height * 0.52, 0, height * 0.63], fillColor=colors.HexColor("#d8e2c4"), strokeColor=None))
    d.add(Polygon([width * 0.35, 0, width, 0, width, height * 0.38, width * 0.68, height * 0.48, width * 0.48, height * 0.36], fillColor=colors.HexColor("#d8e2c4"), strokeColor=None))
    d.add(Polygon([width * 0.47, height * 0.55, width, height * 0.58, width, height, width * 0.41, height, width * 0.34, height * 0.78], fillColor=colors.HexColor("#d8e2c4"), strokeColor=None))
    d.add(String(12, height - 18, "概略航路示意 - 非航海圖，僅用於報告閱讀", fontName=FONT, fontSize=8, fillColor=colors.HexColor("#52616b")))

    pts = {
        "Ceyhan": (0.18, 0.24),
        "Aliaga": (0.21, 0.50),
        "Dardanelles": (0.34, 0.55),
        "Marmara": (0.43, 0.61),
        "Bosphorus": (0.49, 0.69),
        "Black Sea": (0.66, 0.75),
        "Novorossiysk": (0.86, 0.66),
        "Tuapse": (0.91, 0.56),
    }

    route = ["Ceyhan", "Dardanelles", "Marmara", "Bosphorus", "Black Sea", "Novorossiysk"]
    for a, b in zip(route, route[1:]):
        x1, y1 = pts[a][0] * width, pts[a][1] * height
        x2, y2 = pts[b][0] * width, pts[b][1] * height
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#c85a3d"), strokeWidth=2.2))
    d.add(Line(pts["Aliaga"][0] * width, pts["Aliaga"][1] * height, pts["Dardanelles"][0] * width, pts["Dardanelles"][1] * height, strokeColor=colors.HexColor("#517f91"), strokeWidth=1.6, strokeDashArray=[4, 3]))
    d.add(Line(pts["Black Sea"][0] * width, pts["Black Sea"][1] * height, pts["Tuapse"][0] * width, pts["Tuapse"][1] * height, strokeColor=colors.HexColor("#517f91"), strokeWidth=1.6, strokeDashArray=[4, 3]))

    labels = {
        "Ceyhan": "Ceyhan",
        "Aliaga": "Aliaga",
        "Dardanelles": "Dardanelles",
        "Marmara": "Marmara",
        "Bosphorus": "Bosphorus",
        "Black Sea": "Black Sea",
        "Novorossiysk": "Novorossiysk",
        "Tuapse": "Tuapse",
    }
    for name, (px, py) in pts.items():
        x, y = px * width, py * height
        d.add(Circle(x, y, 3.6, fillColor=colors.HexColor("#0f5c75"), strokeColor=colors.white, strokeWidth=1))
        d.add(String(x + 5, y + 4, labels[name], fontName=FONT, fontSize=7.2, fillColor=colors.HexColor("#123")))

    d.add(String(width * 0.07, height * 0.12, "Eastern Mediterranean", fontName=FONT, fontSize=8, fillColor=colors.HexColor("#517f91")))
    d.add(String(width * 0.60, height * 0.84, "Black Sea", fontName=FONT, fontSize=10, fillColor=colors.HexColor("#2c6f86")))
    return d


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT, 7.5)
    canvas.setFillColor(colors.HexColor("#6b7780"))
    canvas.drawString(doc.leftMargin, 12 * mm, "Turkey to Russia tanker route reference pack")
    canvas.drawRightString(PAGE_W - doc.rightMargin, 12 * mm, f"{doc.page}")
    canvas.setStrokeColor(colors.HexColor("#d9e2e8"))
    canvas.line(doc.leftMargin, 16 * mm, PAGE_W - doc.rightMargin, 16 * mm)
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f4f8f9"))
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#0b3142"))
    canvas.rect(0, PAGE_H - 44 * mm, PAGE_W, 44 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#d8a35d"))
    canvas.rect(0, PAGE_H - 46 * mm, PAGE_W, 2.2 * mm, stroke=0, fill=1)
    canvas.setFont(FONT, 8.5)
    canvas.setFillColor(colors.white)
    canvas.drawString(22 * mm, PAGE_H - 22 * mm, "REFERENCE DOSSIER")
    canvas.restoreState()


def source_table(styles):
    data = [[p("來源", styles["small"]), p("用途", styles["small"]), p("鏈接", styles["small"])]]
    for name, use, url in SOURCES:
        data.append([p(name, styles["tiny"]), p(use, styles["tiny"]), p(f'<a href="{url}" color="#124f7a">{url}</a>', styles["tiny"])])
    table = Table(data, colWidths=[4.0 * cm, 5.0 * cm, 7.2 * cm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12384a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8e2e8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def add_section_title(story, text, styles):
    story.append(p(text, styles["h1"]))


def bullet_list(items, styles):
    return ListFlowable(
        [ListItem(p(item, styles["base"]), bulletColor=colors.HexColor("#c85a3d")) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=13,
        bulletFontName=FONT,
    )


def attachment_table(styles):
    rows = [[p("附件文件", styles["small"]), p("說明", styles["small"])]]
    descriptions = {
        "Ceyhan_Toros_Terminal_Information_2024.pdf": "Ceyhan/Toros 碼頭資訊與港口規則手冊。",
        "JWC_Listed_Areas_JWLA033_2026.pdf": "JWC 2026 listed areas，保險戰爭風險參考。",
        "OCIMF_Guidelines_Transiting_Turkish_Straits.pdf": "OCIMF 土耳其海峽通航指南。",
        "OFAC_Russian_Oil_Price_Cap_Guidance.pdf": "OFAC 俄油價格上限政策指引。",
        "Price_Cap_Coalition_Maritime_Advisory_2024.pdf": "價格上限聯盟海運業最佳實務建議。",
        "Turkish_Straits_Implementation_Directive_2024_EN.pdf": "土耳其海峽規則執行指令英文譯本。",
        "Turkish_Straits_VTS_User_Guide.pdf": "土耳其海峽 VTS 用戶指南。",
        "WorldBank_Blueing_Black_Sea_Pollution_2025.pdf": "世界銀行黑海污染診斷報告。",
    }
    for f in sorted(ATTACH.glob("*.pdf")):
        rows.append([p(f.name, styles["tiny"]), p(descriptions.get(f.name, "公開參考 PDF。"), styles["tiny"])])
    t = Table(rows, colWidths=[7.2 * cm, 9.0 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12384a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8e2e8")),
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def table_from_rows(rows, widths, styles, header_color="#12384a"):
    data = [[p(str(x), styles["small"]) for x in rows[0]]]
    for row in rows[1:]:
        data.append([p(str(x), styles["tiny"]) for x in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_color)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), FONT),
        ("FONTNAME", (0, 0), (-1, 0), FONT_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8e2e8")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafb")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def build():
    styles = make_styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="Turkey to Russia Tanker Route Reference Report",
        author="Codex",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=frame, onPage=cover),
        PageTemplate(id="body", frames=frame, onPage=header_footer),
    ])

    story = []
    story.append(Spacer(1, 58 * mm))
    story.append(p("油輪：土耳其裝貨至俄羅斯卸貨", styles["title"]))
    story.append(p("航路、水文、環境、保全、港口與合規參考資料包", styles["subtitle"]))
    story.append(p(f"生成日期：{date.today().isoformat()}  |  基準時區：Asia/Shanghai  |  用途：航前研究、檢查準備、盡調與風險梳理", styles["cover_meta"]))
    story.append(Spacer(1, 16 * mm))
    story.append(table_from_rows([
        ["核心假設", "說明"],
        ["主線航路", "土耳其地中海/愛琴海裝貨港，經達達尼爾、馬爾馬拉海、博斯普魯斯進黑海，到俄羅斯黑海卸貨港。"],
        ["未指定港口處理方式", "本報告按常見油輪港口和航段整理；實際航行計畫需以裝港、卸港、船型、吃水、貨種、保險和船旗國指令校準。"],
        ["法律性質", "本報告不是法律意見或航海指令；正式決策需依官方海圖、航行警告、港口當局、船旗國、P&I/保險人與律師意見。"],
    ], [4 * cm, 12.2 * cm], styles))
    story.append(PageBreak())
    doc.handle_nextPageTemplate("body")

    add_section_title(story, "1. 快速結論", styles)
    story.append(bullet_list([
        "若卸港為 Novorossiysk、Tuapse、Taman/Port Kavkaz 等俄羅斯黑海港，最關鍵的風險不是航程長度，而是 Turkish Straits 通航控制、黑海戰爭/保全風險、俄羅斯港口營運中斷與制裁/保險合規。",
        "地中海自 2025-05-01 起已是 MARPOL Annex VI SOx ECA，燃油硫含量限制 0.10%；黑海和地中海同時也是 MARPOL Annex I 油污染特殊區域，排放管理要從裝港前就準備好。",
        "Turkish Straits 雖然在 Montreux 體系下商船原則上享有通行自由，但 VTS、TSS、能見度、危險品/油輪日間通航、引航和等待安排會直接影響 ETA、滯期與風險控制。",
        "黑海/亞速海截至 2026 年仍有軍事行動、無人載具、漂雷、誤擊和港口基礎設施攻擊風險；航前應核對 MARAD、NATO Shipping Centre、NAVAREA III、JWC listed areas 和船旗國/保險人要求。",
        "如涉及俄羅斯原產油或俄羅斯油品，必須單獨判斷 G7/EU/UK/US 價格上限、海運服務禁令、指定船舶清單和高風險航運實務；即使貨物不是俄羅斯原產，俄羅斯港口與交易對手也需制裁篩查。",
    ], styles))

    add_section_title(story, "2. 航線框架", styles)
    story.append(p("下表把未指定港口情況拆成三條可用研究框架；主報告重點放在第一條。距離為研究級估算，正式航次應由 ECDIS、官方海圖和船公司航線服務核算。", styles["base"]))
    story.append(table_from_rows(
        [["方案", "航路", "距離級別", "適用性"],
         *ROUTE_OPTIONS],
        [3.2 * cm, 6.1 * cm, 3.0 * cm, 3.9 * cm],
        styles,
    ))
    story.append(Spacer(1, 5 * mm))
    story.append(make_route_map())

    add_section_title(story, "3. 分段風險與信息價值", styles)
    story.append(table_from_rows(
        [["段", "區域", "範圍", "重點信息", "風險"],
         *SEGMENTS],
        [0.8 * cm, 3.1 * cm, 3.8 * cm, 6.8 * cm, 1.7 * cm],
        styles,
    ))

    add_section_title(story, "4. 港口與裝卸端", styles)
    story.append(table_from_rows([
        ["港口/區域", "與油輪航次相關的信息", "建議核對"],
        ["Ceyhan", "土耳其地中海重要油碼頭區，包含 BTC/Ceyhan 相關海上油碼頭與其他危險品碼頭；附件含 Ceyhan/Toros 港口規則手冊。", "裝貨碼頭、裝油臂、最大吃水/LOA/DWT、繫泊、VHF、拖輪、危險品申報、SOPEP 應急聯絡。"],
        ["Aliaga/Izmir Bay", "煉化、化工、油品、LPG/LNG、散雜和拆船活動密集；適合把近岸交通與危險品港區風險單列。", "港界、引航登輪點、錨地分區、特殊貨種限制、局部環保規定。"],
        ["Izmit/Tutunciftlik", "馬爾馬拉海東部煉廠/油品裝卸端；若從此裝貨，將先在馬爾馬拉海內部運行再進博斯普魯斯。", "港內交通、引航/拖輪、煉廠安全規則、危險品指南。"],
        ["Novorossiysk", "俄羅斯黑海核心港；包含商港、Sheskharis 油港與 CPC Marine Terminal/外海 SPM 等不同設施。", "VTS、強制規則、引航、港口保全、SPM 航路、港口攻擊/停運風險、制裁篩查。"],
        ["Tuapse/Taman/Port Kavkaz", "俄羅斯黑海/刻赤方向的替代卸貨端或轉運端，水深、港界、政治/保全風險差異較大。", "港口狀態、海峽/淺水限制、俄烏戰爭風險、保險人批准。"],
    ], [3.0 * cm, 7.1 * cm, 6.1 * cm], styles))

    add_section_title(story, "5. 水文、氣象與航海控制", styles)
    story.append(bullet_list([
        "Turkish Straits 是典型狹水道風險：博斯普魯斯急彎、城市岸線、本地渡輪交通、漁船、能見度和強流共同作用；馬爾馬拉海是等待和交叉交通風險的緩衝區。",
        "黑海水文與海況不應只看平均氣候；應按航次時間抓取風、浪、流、能見度和海面高度預報。Copernicus Marine 的黑海 Physics 和 Waves 產品可作為航前研究資料源。",
        "NGA Sailing Directions、World Port Index、官方海圖、NAVAREA III 航警與沿岸廣播應一起使用；本報告和附件不能替代法定航海出版物。",
        "冬季、強北風和黑海風暴會顯著影響 Novorossiysk/Tuapse 一帶靠泊、錨地和外海 SPM 作業；港口代理和碼頭 ETA 更新要高頻維護。",
    ], styles))

    add_section_title(story, "6. 環境與污染響應", styles)
    story.append(table_from_rows([
        ["主題", "要點", "參考源"],
        ["MARPOL 特殊區域", "地中海、黑海、波羅的海在油污染/垃圾/空氣污染等 Annex 下存在特殊或更嚴控制。油輪要特別核對 Annex I 油/油性混合物排放、油類記錄簿與污油水接收設施。", "IMO MARPOL Special Areas"],
        ["地中海 SOx ECA", "2025-05-01 起地中海 SOx ECA 生效，ECA 內燃油硫含量限制 0.10% m/m，除非使用批准的等效措施。", "IMO Med SOx ECA notice"],
        ["污染響應", "地中海可查 REMPEC；黑海由 Bucharest Convention/Black Sea Commission 框架支持區域合作。船上仍需以 SOPEP/SMPEP、P&I、沿岸國聯絡表和碼頭應急程序為準。", "REMPEC、Black Sea Commission"],
        ["黑海污染背景", "黑海沿岸污染、戰爭相關污染、油污事故及流域輸入污染均有治理壓力；世界銀行 2025 報告可作背景資料。", "World Bank Blueing the Black Sea"],
    ], [3.2 * cm, 9.0 * cm, 4.0 * cm], styles))

    add_section_title(story, "7. 保全、戰爭風險與制裁", styles)
    story.append(p("這一部分最容易隨日期變化。報告生成時已抓取截至 2026-06-23 可用來源，但正式航次前必須重新核對。", styles["base"]))
    story.append(table_from_rows([
        ["風險", "航前處理"],
        ["黑海軍事風險", "核對 MARAD Advisory、IMO 黑海/亞速海頁面、NATO Shipping Centre、NAVAREA III、沿岸廣播、船旗國通告；更新 Vessel Risk Assessment 和 Ship Security Plan。"],
        ["戰爭風險保險", "JWC listed areas 是倫敦市場重要參考；進入或接近 listed area 前，確認 breach of navigation、額外保費、通知期限和保險人書面同意。"],
        ["俄羅斯相關制裁", "篩查船舶、實益擁有人、管理人、租家、貨主、收貨人、銀行、保險、碼頭與貨物原產；保存制裁查詢截圖與時間戳。"],
        ["價格上限/海運服務禁令", "若為 Russian Federation origin crude/petroleum products，判斷 G7/EU/UK/US 價格上限、服務禁令、證明/attestation、附加費用拆分與記錄保存要求。"],
        ["高風險航運實務", "檢查 AIS 關閉/漂移、異常 STS、頻繁換旗/換名、模糊保險、虛假文件、非透明所有權和指定船舶清單。"],
    ], [4.0 * cm, 12.2 * cm], styles))

    add_section_title(story, "8. 實務檢查清單", styles)
    story.append(table_from_rows(
        [["類別", "檢查項"],
         *INSPECTION_CHECKS],
        [3.2 * cm, 13.0 * cm],
        styles,
    ))

    add_section_title(story, "9. 附件包內容", styles)
    story.append(attachment_table(styles))
    story.append(PageBreak())

    add_section_title(story, "10. 可點擊來源清單", styles)
    story.append(p("以下鏈接均為報告編寫時使用或建議航前複核的參考入口。PDF 內可點擊跳轉；部分官方頁面會更新，請以打開時的最新內容為準。", styles["base"]))
    story.append(source_table(styles))

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    build()
