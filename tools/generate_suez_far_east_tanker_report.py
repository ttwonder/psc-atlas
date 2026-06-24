from __future__ import annotations

from datetime import date
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.shapes import Circle, Drawing, Line, Polygon, Rect, String


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "turkey_suez_to_russia_far_east_tanker_route_report.pdf"
ATTACH = ROOT / "output" / "reference_attachments_suez_far_east"
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


def p(text, style):
    return Paragraph(text, style)


def styles():
    base = {
        "fontName": FONT,
        "fontSize": 8.7,
        "leading": 12.8,
        "textColor": colors.HexColor("#1f2933"),
        "wordWrap": "CJK",
        "spaceAfter": 4,
    }
    from reportlab.lib.styles import ParagraphStyle

    return {
        "base": ParagraphStyle("base", **base),
        "small": ParagraphStyle("small", **{**base, "fontSize": 7.4, "leading": 10.4, "textColor": colors.HexColor("#53616d")}),
        "tiny": ParagraphStyle("tiny", **{**base, "fontSize": 6.7, "leading": 8.7, "textColor": colors.HexColor("#53616d")}),
        "title": ParagraphStyle("title", **{**base, "fontName": FONT_BOLD, "fontSize": 23, "leading": 29, "textColor": colors.HexColor("#0b1f2a"), "alignment": TA_LEFT}),
        "subtitle": ParagraphStyle("subtitle", **{**base, "fontSize": 10.2, "leading": 15, "textColor": colors.HexColor("#425466")}),
        "h1": ParagraphStyle("h1", **{**base, "fontName": FONT_BOLD, "fontSize": 14.2, "leading": 19, "textColor": colors.HexColor("#10384f"), "spaceBefore": 10, "spaceAfter": 7}),
        "cover": ParagraphStyle("cover", **{**base, "fontSize": 8.2, "leading": 11.5, "textColor": colors.HexColor("#52616b")}),
    }


SOURCES = [
    ("Suez Canal Authority", "蘇伊士運河規則、船隊制度、通航與費率入口", "https://www.suezcanal.gov.eg/"),
    ("SCA Navigation System", "南北向 convoy、到達限制時間、油輪速度參考", "https://www.suezcanal.gov.eg/English/Navigation/Pages/NavigationSystem.aspx"),
    ("SCA Rules of Navigation PDF", "運河通航規則原文", "https://www.suezcanal.gov.eg/FlipPDFDocuments/Rules%20of%20Navigation.pdf"),
    ("IMO MARPOL Special Areas", "地中海、紅海、亞丁灣等特殊區域", "https://www.imo.org/en/ourwork/environment/pages/special-areas-marpol.aspx"),
    ("IMO Mediterranean SOx ECA", "2025-05-01 起地中海 SOx ECA 0.10% 硫限值", "https://www.imo.org/en/mediacentre/pages/whatsnew-2254.aspx"),
    ("UK MCA MIN 717", "紅海與亞丁灣 Annex I/V 特殊區域 2025 起生效", "https://www.gov.uk/government/publications/min-717-mf-pollution-prevention-red-sea-and-gulf-of-aden-marpol-annex-i-and-v/min-717-mf-pollution-prevention-red-sea-and-gulf-of-aden-marpol-annex-i-and-v-special-areas"),
    ("MARAD Advisory 2026-006", "紅海、Bab el Mandeb、亞丁灣、阿拉伯海、索馬里盆地安全風險", "https://www.maritime.dot.gov/msci/2026-006-red-sea-bab-el-mandeb-strait-gulf-aden-arabian-sea-and-somali-basin-houthi-attacks"),
    ("UKMTO", "VRA/VRS、事件報告、JMIC、BMP Maritime Security 入口", "https://www.ukmto.org/"),
    ("JMIC advisory updates", "紅海/亞丁灣近期安全態勢更新", "https://www.ukmto.org/partner-products"),
    ("BMP Maritime Security 2025", "全球威脅風險評估與船舶防護最佳實務", "https://www.maritimeglobalsecurity.org/"),
    ("ReCAAP ISC", "亞洲海盜與武裝搶劫週報、年報、SOMS 指南", "https://www.recaap.org/"),
    ("ReCAAP Annual Report 2025", "2025 亞洲海盜/武裝搶劫統計與熱點", "https://www.recaap.org/resources/ck/files/reports/annual/ReCAAP%20ISC%20Annual%20Report%202025.pdf"),
    ("Copernicus Global Ocean Physics", "全球海流、溫鹽、海面高度 10 日預報", "https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description"),
    ("JMA RSMC Tokyo", "西北太平洋及南海熱帶氣旋資訊", "https://www.jma.go.jp/jma/jma-eng/jma-center/rsmc-hp-pub-eg/RSMC_HP.htm"),
    ("JTWC", "熱帶氣旋公開產品入口", "https://www.metoc.navy.mil/jtwc/jtwc.html"),
    ("NGA World Port Index", "港口位置、特徵、設施服務資料入口", "https://msi.nga.mil/Publications/WPI"),
    ("Rosmorport Far East VTS", "Vladivostok/Nakhodka VTS 與遠東港口通航服務", "https://www.rosmorport.com/vlf_serv_vts.html"),
    ("Rosmorport Far East Seaports", "Vladivostok、Vostochny、Nakhodka、Posyet 等港口規格", "https://www.rosmorport.com/vlf_seaports.html"),
    ("Rosmorport Far East Pilotage", "Vostochny/Nakhodka 引航與油碼頭登輪點", "https://www.rosmorport.com/filials/vof_serv_loc/"),
    ("Sakhalin Energy Prigorodnoye", "Sakhalin LNG/OET 端口設施背景", "https://www.sakhalinenergy.ru/en/company/assets/prigorodnoye/"),
    ("UK OFSI Oil Price Cap", "英國俄油海運服務禁令與價格上限指引", "https://www.gov.uk/government/publications/uk-maritime-services-ban-and-oil-price-cap-industry-guidance/uk-maritime-services-ban-and-oil-price-cap-industry-guidance"),
    ("OFAC Russian Oil Guidance", "美國 OFAC 俄油/油品價格上限框架", "https://ofac.treasury.gov/media/931036/download?inline="),
    ("Price Cap Coalition Advisory", "海運油品貿易制裁規避風險與盡調建議", "https://ofac.treasury.gov/media/933506/download?inline="),
]


SEGMENTS = [
    ("A", "土耳其裝貨港/錨地", "Ceyhan、Aliaga、Izmit、Mersin/Atas 等", "裝貨文件、港口/碼頭規則、危險品申報、ECA 燃油切換、貨物與交易對手盡調。", "中-高"),
    ("B", "東地中海至 Port Said", "土耳其出港至蘇伊士北口", "Med SOx ECA；東地中海政治/軍事態勢、交通密度、等待錨地與運河 ETA 管理。", "中"),
    ("C", "蘇伊士運河", "Port Said - Canal - Port Tewfik/Suez", "SCA 規則、convoy、油輪速度、引航、繫泊/拖輪、貨物申報、垃圾/污油水管理。", "高"),
    ("D", "紅海/蘇伊士灣", "Suez 至 Bab el Mandeb 北段", "紅海 Annex I/V 特殊區域；Houthi 遠程攻擊、GNSS/AIS/通訊暴露、靠近也門岸線風險。", "高"),
    ("E", "Bab el Mandeb/亞丁灣", "狹窄咽喉、IRTC 周邊、索馬里盆地入口", "導彈/UAV/USV、小艇、登輪、海盜回潮；UKMTO VRA/VRS 和 JMIC/BMP 實務最關鍵。", "很高"),
    ("F", "阿拉伯海/印度洋", "亞丁灣外至斯里蘭卡/印度洋", "西南季風、長湧、北印度洋熱帶氣旋、遠洋醫療與避風港選擇。", "中-高"),
    ("G", "Malacca/Singapore 或替代海峽", "SOMS 主線；Sunda/Lombok 備選", "SOMS 武裝搶劫高發、TSS、漁船、拖帶、錨地；吃水/交通/保全可推動選擇替代海峽。", "高"),
    ("H", "南海/東海/台灣或呂宋以東", "新加坡至西北太平洋", "颱風、季風、漁船、軍演/航警、區域政治敏感水域；航路需依船旗國和公司風險偏好。", "中-高"),
    ("I", "日本海/俄羅斯遠東港", "Korea Strait/Tsushima 至 Kozmino/Nakhodka/Vladivostok/De-Kastri/Prigorodnoye", "VTS/引航、冬季冰況、霧、港口狀態、俄羅斯制裁/指定船舶/港口與保險限制。", "高"),
]


ROUTES = [
    ("主線：Malacca/Singapore", "Turkey -> Suez -> Red Sea -> Gulf of Aden -> Indian Ocean -> Malacca/Singapore -> South China Sea -> Korea Strait -> Russian Far East", "約 8,000-8,800 nm；Ceyhan 到 Kozmino 粗估約 8,300 nm。", "距離最短、補給/維修資源最多；但 SOMS 交通與武裝搶劫風險高。"),
    ("備選：Sunda Strait", "Indian Ocean -> Sunda -> Java Sea -> South China Sea/Philippine Sea -> Russian Far East", "通常比 Malacca 略長。", "可避開 Singapore Strait 局部事件，但需重新核對吃水、海流、火山/氣象、印尼通航與保全。"),
    ("備選：Lombok/Makassar", "Indian Ocean -> Lombok -> Makassar -> Philippine Sea -> Japan Sea", "更長，常用於深吃水或特定路由策略。", "深水條件較好，但遠洋段更長，燃油與天氣窗口成本更高。"),
]


CHECKS = [
    ("航路", "確認實際裝港、卸港、船型、吃水、空高、貨物與保險條款；用 ECDIS/官方海圖核算航程與避險航線。"),
    ("蘇伊士", "SCA 代理、到達限制時間、convoy、SCID/申報、引航、繫泊、拖輪、垃圾/污油水、運河費用和延誤條款。"),
    ("保全", "紅海/亞丁灣做 VRA；跟 UKMTO、JMIC、MARAD、CMF/NCAGS、船旗國與保險人同步；決定 AIS/通訊策略。"),
    ("亞洲海峽", "SOMS 區域增加瞭望、甲板照明、門禁、巡邏、報告程序；核對 ReCAAP 週報與沿岸國通告。"),
    ("氣象", "北印度洋雙峰氣旋季、SW monsoon、南海/西北太平洋颱風、日本海冬季風浪/冰況；每段設天氣路由觸發條件。"),
    ("環保", "Med SOx ECA、Red Sea/Gulf of Aden MARPOL Annex I/V 特殊區域、垃圾/油類記錄簿、SOPEP/SMPEP、港口接收設施。"),
    ("制裁", "篩查船舶、實益擁有人、管理人、租家、貨主、收貨人、銀行、保險、港口、STS 與 AIS 歷史；俄羅斯相關貨物另判斷價格上限。"),
]


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont(FONT, 7.3)
    canvas.setFillColor(colors.HexColor("#6b7780"))
    canvas.drawString(doc.leftMargin, 12 * mm, "Turkey - Suez - Russia Far East tanker route reference pack")
    canvas.drawRightString(PAGE_W - doc.rightMargin, 12 * mm, str(doc.page))
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


def table(rows, widths, st, header="#12384a"):
    data = [[p(str(x), st["small"]) for x in rows[0]]]
    for row in rows[1:]:
        data.append([p(str(x), st["tiny"]) for x in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header)),
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


def bullets(items, st):
    return ListFlowable(
        [ListItem(p(x, st["base"]), bulletColor=colors.HexColor("#c85a3d")) for x in items],
        bulletType="bullet",
        leftIndent=13,
        bulletFontName=FONT,
    )


def route_map():
    w, h = 16.5 * cm, 8.6 * cm
    d = Drawing(w, h)
    d.add(Rect(0, 0, w, h, fillColor=colors.HexColor("#eef6f8"), strokeColor=None))
    land = colors.HexColor("#d9e2c8")
    sea_text = colors.HexColor("#2c6f86")
    d.add(Polygon([0, h * .58, w * .32, h * .62, w * .38, h * .43, w * .22, h * .28, 0, h * .20], fillColor=land, strokeColor=None))
    d.add(Polygon([w * .25, 0, w * .72, 0, w * .74, h * .25, w * .55, h * .35, w * .42, h * .23, w * .30, h * .16], fillColor=land, strokeColor=None))
    d.add(Polygon([w * .63, h * .42, w, h * .34, w, h, w * .70, h, w * .64, h * .72], fillColor=land, strokeColor=None))
    pts = {
        "Turkey": (.08, .58),
        "Suez": (.20, .47),
        "Bab el Mandeb": (.30, .29),
        "Indian Ocean": (.48, .21),
        "Singapore": (.61, .26),
        "Taiwan/Luzon": (.77, .49),
        "Korea Strait": (.86, .66),
        "Kozmino/Nakhodka": (.93, .75),
    }
    order = list(pts)
    for a, b in zip(order, order[1:]):
        x1, y1 = pts[a][0] * w, pts[a][1] * h
        x2, y2 = pts[b][0] * w, pts[b][1] * h
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor("#c85a3d"), strokeWidth=2.1))
    d.add(Line(pts["Singapore"][0] * w, pts["Singapore"][1] * h, w * .68, h * .17, strokeColor=colors.HexColor("#517f91"), strokeWidth=1.5, strokeDashArray=[4, 3]))
    d.add(Line(w * .68, h * .17, pts["Taiwan/Luzon"][0] * w, pts["Taiwan/Luzon"][1] * h, strokeColor=colors.HexColor("#517f91"), strokeWidth=1.5, strokeDashArray=[4, 3]))
    for name, (px, py) in pts.items():
        x, y = px * w, py * h
        d.add(Circle(x, y, 3.6, fillColor=colors.HexColor("#0f5c75"), strokeColor=colors.white, strokeWidth=1))
        d.add(String(x + 5, y + 4, name, fontName=FONT, fontSize=6.8, fillColor=colors.HexColor("#123")))
    d.add(String(8, h - 16, "概略航路示意 - 非航海圖，僅供報告閱讀", fontName=FONT, fontSize=7.5, fillColor=colors.HexColor("#52616b")))
    d.add(String(w * .39, h * .10, "Indian Ocean", fontName=FONT, fontSize=9, fillColor=sea_text))
    d.add(String(w * .76, h * .83, "NW Pacific / Sea of Japan", fontName=FONT, fontSize=8.5, fillColor=sea_text))
    return d


def source_table(st):
    rows = [["來源", "用途", "鏈接"]]
    rows.extend(SOURCES)
    data = [[p(str(x), st["small"]) for x in rows[0]]]
    for name, use, url in rows[1:]:
        data.append([p(name, st["tiny"]), p(use, st["tiny"]), p(f'<a href="{url}" color="#124f7a">{url}</a>', st["tiny"])])
    t = Table(data, colWidths=[3.9 * cm, 5.1 * cm, 7.2 * cm], repeatRows=1)
    t.setStyle(TableStyle([
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
    return t


def attachment_table(st):
    desc = {
        "Suez_Canal_Rules_of_Navigation_alt.pdf": "蘇伊士運河航行規則 PDF 備份來源。",
        "ReCAAP_ISC_Annual_Report_2025.pdf": "亞洲海盜與武裝搶劫 2025 年報。",
        "OFAC_Russian_Oil_Price_Cap_Guidance.pdf": "OFAC 俄油/油品價格上限指引。",
        "Price_Cap_Coalition_Maritime_Advisory_2024.pdf": "價格上限聯盟海運業盡調建議。",
    }
    rows = [["附件文件", "說明"]]
    for f in sorted(ATTACH.glob("*.pdf")):
        rows.append([f.name, desc.get(f.name, "公開參考 PDF。")])
    return table(rows, [7.4 * cm, 8.8 * cm], st)


def build():
    st = styles()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="Turkey Suez to Russia Far East Tanker Route Report",
        author="Codex",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="cover", frames=frame, onPage=cover), PageTemplate(id="body", frames=frame, onPage=header_footer)])
    story = []
    story.append(Spacer(1, 58 * mm))
    story.append(p("油輪：土耳其經蘇伊士至俄羅斯遠東", st["title"]))
    story.append(p("航路、水文、環境、保全、港口與合規參考資料包", st["subtitle"]))
    story.append(p(f"生成日期：{date.today().isoformat()} | 基準時區：Asia/Shanghai | 用途：航前研究、檢查準備、盡調與風險梳理", st["cover"]))
    story.append(Spacer(1, 15 * mm))
    story.append(table([
        ["核心假設", "說明"],
        ["主線航路", "土耳其裝貨港 -> 東地中海 -> 蘇伊士運河 -> 紅海/Bab el Mandeb/亞丁灣 -> 印度洋 -> Malacca/Singapore -> 南海/東海/日本海 -> 俄羅斯遠東港。"],
        ["可能卸港", "Kozmino、Nakhodka、Vostochny、Vladivostok、De-Kastri、Prigorodnoye 等；實際港口會改變最終進港、冰況、引航和制裁審查。"],
        ["法律性質", "本報告不是法律意見或航海指令；正式決策以官方海圖、港口/運河當局、船旗國、保險人、P&I 與律師意見為準。"],
    ], [4.0 * cm, 12.2 * cm], st))
    story.append(PageBreak())
    doc.handle_nextPageTemplate("body")

    story.append(p("1. 快速結論", st["h1"]))
    story.append(bullets([
        "這條線的高價值資料集中在四個節點：蘇伊士運河規則與排隊、紅海/亞丁灣保全、Malacca/Singapore 武裝搶劫與交通密度、俄羅斯遠東港口與制裁/保險限制。",
        "以 Ceyhan -> Suez -> Bab el Mandeb -> Colombo 外海 -> Singapore -> 台灣/呂宋附近 -> Korea Strait -> Kozmino 粗算約 8,300 nm；正式航程需按實際裝卸港和避險路由重算。",
        "紅海與亞丁灣截至 2026-06-23 仍需按高風險水域處理：MARAD 2026-006 指出 UAV/USV/UUV、導彈、小艇、非法登輪和欺騙通信等風險，需做 VRA 並接入 UKMTO/JMIC 報告鏈。",
        "SOMS 不是戰爭區，但武裝搶劫頻率高、交通密度大、夜間登輪風險突出；ReCAAP 2025 年報顯示亞洲事件增加，SOMS 是重點區。",
        "環保上，地中海 SOx ECA、紅海/亞丁灣 Annex I/V 特殊區域、油輪 cargo area 排放限制和垃圾/污油水管理要在航次開始前完成計畫。",
        "若貨物、港口或交易鏈涉及 Russia，仍需完整制裁篩查；如是俄羅斯原產油/油品，還要判斷 G7/EU/UK/US 價格上限與海運服務禁令。"
    ], st))

    story.append(p("2. 航線框架", st["h1"]))
    story.append(table([["方案", "航路", "距離級別", "適用性"], *ROUTES], [3.1 * cm, 6.2 * cm, 3.0 * cm, 3.9 * cm], st))
    story.append(Spacer(1, 5 * mm))
    story.append(route_map())

    story.append(p("3. 分段風險與信息價值", st["h1"]))
    story.append(table([["段", "區域", "範圍", "重點信息", "風險"], *SEGMENTS], [0.75 * cm, 3.0 * cm, 3.8 * cm, 6.9 * cm, 1.75 * cm], st))

    story.append(p("4. 蘇伊士與紅海保全", st["h1"]))
    story.append(table([
        ["主題", "要點", "資料入口"],
        ["蘇伊士運河", "SCA 對所有船舶適用 Rules of Navigation；官方頁顯示兩個 convoy 系統。Navigation System 頁列明 southbound/northbound 開航時間、2300 到達限制及油輪 14 km/h 速度參考。", "Suez Canal Authority、SCA Navigation System"],
        ["紅海/BAM/亞丁灣", "高風險來自 Houthi 攻擊、無人系統、導彈、小艇、登輪、欺騙通信，以及索馬里海盜活動回升；航前需更新 VRA、BMP-MS、UKMTO VRS/JMIC。", "MARAD 2026-006、UKMTO、JMIC、BMP-MS"],
        ["AIS/通信", "AIS、商業數據、Wi-Fi、航速/航跡重複均可能增加暴露；是否關閉 AIS 必須由船長、公司、船旗國與安全評估共同決策，並確保安全航行。", "MARAD、SOLAS/IMO 指引、UKMTO"],
        ["事件應對", "小艇、UAV/導彈、可疑通信、登輪企圖需有預案：安全艙、額外瞭望、消防/損控、SSAS、UKMTO/NCAGS/P&I/公司報告鏈。", "BMP-MS、UKMTO、船舶 SSP"],
    ], [3.2 * cm, 9.0 * cm, 4.0 * cm], st))

    story.append(p("5. 俄羅斯遠東港口端", st["h1"]))
    story.append(table([
        ["港口/區域", "與油輪航次相關的信息", "建議核對"],
        ["Kozmino/Vostochny/Nakhodka", "Kozmino 是 ESPO 原油出口相關核心油港；Rosmorport 遠東資料顯示 Vostochny 液體貨能力較大，Nakhodka VTS/引航覆蓋 Nakhodka 與油碼頭方向。", "卸港是否為油碼頭、最大 DWT/吃水、引航登輪點、VTS 報到、錨地、冬季冰/霧、港口狀態。"],
        ["Vladivostok", "俄羅斯太平洋門戶，港口服務和 VTS 覆蓋較完整，但未必是主要油輪卸貨端。", "港口用途、是否接收該貨種、制裁/銀行/代理可行性。"],
        ["De-Kastri", "Sakhalin-1 相關油品出口端；更偏北，冰級、季節和遠東氣象條件更重要。", "冰級要求、裝/卸設施、船舶相容性、Sakhalin 專案與制裁狀態。"],
        ["Prigorodnoye", "Sakhalin Energy 頁面顯示其含 LNG 與 Oil Export Terminal 設施；若目的港在 Sakhalin，需要單獨核對 OET 規則。", "貨種相容性、冰況、VTS、引航、專案制裁和港口接收要求。"],
    ], [3.2 * cm, 7.2 * cm, 5.8 * cm], st))

    story.append(p("6. 水文、氣象與環境", st["h1"]))
    story.append(table([
        ["主題", "要點", "來源"],
        ["遠洋海況", "印度洋與西太平洋段應使用全球海流/浪/風產品，Copernicus Global Ocean Physics 提供 10 日 3D 全球海洋預報。", "Copernicus Marine"],
        ["熱帶氣旋", "北印度洋通常有春季和秋季兩個氣旋窗口；南海和西北太平洋需用 JMA RSMC Tokyo/JTWC 監控。", "JMA、JTWC、IMD/WMO 資料"],
        ["MARPOL", "地中海、紅海、亞丁灣等存在特殊區域要求；2025-01-01 起紅海/亞丁灣 Annex I/V 部分要求生效。", "IMO、UK MCA MIN 717"],
        ["油污應急", "長航線需按區域更新 SOPEP/SMPEP 聯絡表、沿岸國通知、P&I/ITOPF/OSRO、港口接收設施和廢棄物計畫。", "SOPEP/SMPEP、港口/代理"],
    ], [3.2 * cm, 9.0 * cm, 4.0 * cm], st))

    story.append(p("7. 實務檢查清單", st["h1"]))
    story.append(table([["類別", "檢查項"], *CHECKS], [3.2 * cm, 13.0 * cm], st))

    story.append(p("8. 附件包內容", st["h1"]))
    story.append(attachment_table(st))
    story.append(PageBreak())

    story.append(p("9. 可點擊來源清單", st["h1"]))
    story.append(p("以下鏈接均為報告編寫時使用或建議航前複核的參考入口。PDF 內可點擊跳轉；動態安全頁面請以打開時最新內容為準。", st["base"]))
    story.append(source_table(st))

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    build()
