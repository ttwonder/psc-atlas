import json
import re
import urllib.request
from collections import Counter, defaultdict
from html import escape
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
DESKTOP = Path.home() / "Desktop"
OUTPUT = ROOT / "output" / "cbt-course-selector.html"
SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"


def load_sheetjs_js():
    vendor = ROOT / "tmp" / "xlsx.full.min.js"
    if vendor.exists() and vendor.stat().st_size > 100_000:
        return vendor.read_text(encoding="utf-8")
    try:
        with urllib.request.urlopen(SHEETJS_URL, timeout=20) as response:
            code = response.read().decode("utf-8")
        vendor.parent.mkdir(parents=True, exist_ok=True)
        vendor.write_text(code, encoding="utf-8")
        return code
    except Exception as exc:
        raise RuntimeError(f"Unable to fetch Excel parser from {SHEETJS_URL}: {exc}") from exc


CATEGORY_META = {
    "基礎安全與船上通用": {
        "summary": "適合所有船員反覆學習，建立共同安全語言與最低行為底線。",
        "advice": "年度課程包裡應保留穩定核心，尤其是個人安全、船舶一般安全、風險意識和基本熟悉。"
    },
    "應急、消防、救生與急救": {
        "summary": "覆蓋火災、救生、急救、搜救、棄船和緊急拖帶等低頻高後果場景。",
        "advice": "建議作為年度必備池，每年可輪換不同案例或船型場景，但不要完全移出。"
    },
    "安全作業程序與高風險作業": {
        "summary": "對應封閉處所、動火、高空、吊裝、繫泊、風險評估、工前會等實際事故高發環節。",
        "advice": "這一類最能支撐 TMSA、內審和事故預防，建議給甲板與機艙都留足比例。"
    },
    "海事英語與溝通": {
        "summary": "提升標準海事通信用語、駕駛台/機艙協作、引航和跨國船員溝通能力。",
        "advice": "英語課程不必太多，但應保持連續路徑，讓乙級到甲級都能逐年進階。"
    },
    "MLC、船員權利義務與健康福利": {
        "summary": "關注 MLC、船員福利、身心健康、疲勞、藥酒、疾病預防和生活品質。",
        "advice": "這些課程能補足傳統安全訓練忽略的船員權利與福祉，也利於公司文化建設。"
    },
    "人因、領導力與安全文化": {
        "summary": "聚焦人為因素、溝通、團隊協作、心理韌性、領導力與安全文化。",
        "advice": "適合作為全員共學與幹部進階的橋樑，對 TMSA 的管理成熟度很有幫助。"
    },
    "環保、污染防治與能源效率": {
        "summary": "覆蓋 MARPOL、SOPEP、排放、壓載水、垃圾、燃油、ESG 和環境管理。",
        "advice": "建議每年保留污染防治基礎，再按船隊當年重點加入排放、能源或新燃料課程。"
    },
    "保安、網絡安全與反海盜": {
        "summary": "覆蓋 ISPS、船舶保安、網絡風險、海盜、偷渡和威脅識別。",
        "advice": "適合全員基礎覆蓋；網絡安全可作為近年新增輪換主題。"
    },
    "合規、ISM、審核與檢查準備": {
        "summary": "對應 ISM、PSC、SIRE/TMSA、審核、指定人員和檢查流程。",
        "advice": "PSC 很少直接查 CBT，但 TMSA 和公司審核會看培訓體系，這類課可支撐管理證據鏈。"
    },
    "甲板、航行與貨物操作": {
        "summary": "覆蓋航行、GMDSS、雷達、穩性、貨物、繫泊和甲板專業操作。",
        "advice": "建議挑選少量高覆蓋的基礎課，避免年度名額被過多專門設備課吃掉。"
    },
    "輪機、電氣與技術設備": {
        "summary": "覆蓋主輔機、鍋爐、泵、發電機、潤滑、冷卻、液壓、電氣和自動化。",
        "advice": "機艙課程很多，應優先選通用基礎和高風險設備，再按船隊故障趨勢輪換。"
    },
    "油、化、氣與液貨船專項": {
        "summary": "覆蓋油輪、化學品船、氣體船、LNG/LPG、IGF、新燃料和液貨操作。",
        "advice": "如果船隊包含油化氣船，至少保留液貨安全、惰化/洗艙/氣體釋放和基礎船型知識。"
    },
    "散貨、集裝箱、客滾與其他船型": {
        "summary": "覆蓋散貨、IMSBC、集裝箱、客船、客滾、郵輪、近海和 DP 等船型專項。",
        "advice": "按實際船隊配置選少量代表課；若船型分散，優先選貨物安全和船型基礎。"
    },
    "餐飲、生活區與公共衛生": {
        "summary": "覆蓋餐飲、食品安全、公共衛生、疾病防控和生活區管理。",
        "advice": "不要只給廚工看，公共衛生和生活區風險可納入全員或管理層年度輪換。"
    },
    "供應商、設備與產品專題": {
        "summary": "多為特定廠商、設備、系統或系列化產品知識。",
        "advice": "除非船隊確有該設備或事故趨勢，否則不宜佔用過多年度名額。"
    },
    "其他或需人工判斷": {
        "summary": "資料欄位或標題不足以可靠歸入主要管理分類。",
        "advice": "建議在課程庫中按標題逐項查核，必要時調整為船隊自定義分類。"
    },
}


NEED_META = {
    "全員基礎安全": "所有船員都應知道的共同安全底線。",
    "應急程序": "低頻高後果場景，包含消防、救生、急救和應急響應。",
    "安全作業程序": "對應實際作業控制、風險評估、許可和高風險工作。",
    "海事英語": "支援跨國船員、駕駛台和機艙的標準溝通。",
    "船型基礎": "讓船員掌握所在船型及貨物風險的基本概念。",
    "MLC權利義務": "船員權利、福利、健康和自身義務。",
    "職務專業": "甲板、機艙、電氣、餐飲或管理崗位的基本專業能力。",
    "TMSA與合規": "支撐公司審核、TMSA、ISM、SIRE、PSC 等管理證據。",
    "環境與新燃料": "污染防治、能源效率、ESG 和替代燃料風險。",
    "人因與安全文化": "人為因素、領導力、心理健康和安全文化。"
}


KEYWORDS = [
    ("海事英語與溝通", r"english|smcp|communication|communicat|pilot on the bridge|vocabulary|maritime english"),
    ("油、化、氣與液貨船專項", r"tanker|chemical|oil tanker|gas tanker|lng|lpg|sigtto|liquefied|liquid cargo|cargo tank|inert|purging|gas freeing|odme|igf|methanol|ammonia|hydrogen|esd|bunkering"),
    ("散貨、集裝箱、客滾與其他船型", r"bulk|ore carrier|imsbc|container|passenger|roro|pctc|cruise|offshore|supply vessel|dp |dynamic positioning|general cargo"),
    ("應急、消防、救生與急救", r"emergency|fire|firefighting|first aid|medical care|search and rescue|survival|lifeboat|liferaft|abandon|rescue|towing|crisis|crowd management|first on scene"),
    ("安全作業程序與高風險作業", r"risk assessment|enclosed space|confined|hot work|working aloft|work at height|lifting|mooring|permit|toolbox|ppe|lockout|tagout|hazard|hazmat|imdg|lithium-ion|battery|safe operation|slip|trip|fall|manual handling"),
    ("基礎安全與船上通用", r"personal safety|ship general safety|familiarisation|familiarization|pssr|safety officer|general safety|basic safety"),
    ("MLC、船員權利義務與健康福利", r"mlc|welfare|seafarer.*right|rights|fatigue|anxiety|depression|wellbeing|well-being|healthy eating|physical|drug|alcohol|disease|public health|harassment|mental health"),
    ("人因、領導力與安全文化", r"human|leadership|leader|team|brm|erm|resilience|culture|behaviour|behavior|relation|conflict|assertiveness|decision"),
    ("環保、污染防治與能源效率", r"environment|marpol|sopep|pollution|ballast water|garbage|emission|eedi|seemp|energy|fuel efficiency|sulphur|sulfur|esg|sustainability|iso 14001|incinerator|opa 90|scrubber"),
    ("保安、網絡安全與反海盜", r"security|isps|cyber|piracy|pirate|stowaway|terror|threat|armed robbery"),
    ("合規、ISM、審核與檢查準備", r"ism|port state|psc|sire|tmsa|vetting|inspection|audit|auditing|designated person|dp basic|compliance|legal|insurance|p&i|protection and indemnity"),
    ("餐飲、生活區與公共衛生", r"catering|food|galley|cook|hygiene|sanitation|accommodation|housekeeping"),
    ("甲板、航行與貨物操作", r"navigation|radar|arpa|gmdss|bridge|stability|ship handling|cargo|deck|steering gear|anchor|anchoring|chart|ecdis|lookout|watchkeeping"),
    ("輪機、電氣與技術設備", r"engine|boiler|pump|generator|lubrication|cooling|hydraulic|electric|automation|autochief|diesel|separator|refrigeration|fuel handling|machinery|propulsion|battery|viscosity|scavenge"),
    ("供應商、設備與產品專題", r"exxonmobil|samson|navguide|wartsila|sulzer|man b&w|teamtec|maker|manufacturer|system,|maintenance"),
]


NEED_KEYWORDS = {
    "全員基礎安全": r"personal safety|ship general safety|pssr|basic safety|familiar|safety officer|risk assessment",
    "應急程序": r"emergency|fire|first aid|medical|search and rescue|survival|lifeboat|liferaft|abandon|rescue|crisis|crowd",
    "安全作業程序": r"risk|enclosed|confined|hot work|working aloft|height|lifting|mooring|permit|toolbox|ppe|hazard|hazmat|imdg|safe operation",
    "海事英語": r"english|smcp|vocabulary|communication|pilot on the bridge",
    "船型基礎": r"tanker|chemical|oil|gas|lng|lpg|bulk|imsbc|container|passenger|roro|cruise|offshore|igf|cargo tank|liquid cargo",
    "MLC權利義務": r"mlc|welfare|rights|fatigue|anxiety|depression|wellbeing|drug|alcohol|disease|public health|mental health",
    "職務專業": r"navigation|radar|arpa|gmdss|engine|boiler|pump|generator|electric|catering|cargo|stability|machinery|automation",
    "TMSA與合規": r"ism|psc|port state|sire|tmsa|vetting|inspection|audit|compliance|legal|insurance|designated person",
    "環境與新燃料": r"environment|marpol|sopep|pollution|ballast|garbage|emission|energy|fuel efficiency|esg|sustainability|ammonia|methanol|hydrogen|lng",
    "人因與安全文化": r"human|leadership|team|brm|erm|resilience|culture|behaviour|behavior|relation|conflict|fatigue",
}


BASE_NEED_WEIGHTS = {
    "全員基礎安全": 18,
    "應急程序": 17,
    "安全作業程序": 18,
    "海事英語": 12,
    "船型基礎": 13,
    "MLC權利義務": 12,
    "職務專業": 13,
    "TMSA與合規": 12,
    "環境與新燃料": 12,
    "人因與安全文化": 12,
}


def clean(value):
    if value is None:
        return ""
    value = str(value).replace("\r", " ").replace("\n", " ").strip()
    value = re.sub(r"\s+", " ", value)
    if value in {"None", "#N/A"}:
        return ""
    return value


def split_list(value):
    text = clean(value)
    if not text:
        return []
    parts = []
    for piece in re.split(r",|;", text):
        piece = piece.strip()
        if piece:
            parts.append(piece)
    return parts


def classify(text):
    hay = text.lower()
    for name, pattern in KEYWORDS:
        if re.search(pattern, hay):
            return name
    return "其他或需人工判斷"


def need_tags(text):
    hay = text.lower()
    tags = []
    for need, pattern in NEED_KEYWORDS.items():
        if re.search(pattern, hay):
            tags.append(need)
    return tags


def parse_quarter(value):
    text = clean(value)
    match = re.search(r"(\d{4})-Q([1-4])", text)
    if not match:
        return 0
    return int(match.group(1)) * 10 + int(match.group(2))


def product_no_sort_key(no):
    nums = re.findall(r"\d+(?:\.\d+)?", no)
    return float(nums[0]) if nums else 999999


def score_course(course):
    score = 0
    title = course["title"].lower()
    score += 40 if course["gold"] else 0
    score += 16 if course["silver"] else 0
    score += 8 if course["diamond"] else 0
    score += 34 if course["lead"] else -10
    score += 15 if "Inclusive" in course["availability"] else 0
    score += 9 if "Generic" in course["shipTypes"] else 0
    score += 8 if set(["Deck", "Engine"]).issubset(set(course["departments"])) else 0
    score += 5 if "Electric" in course["departments"] else 0
    score += 6 if set(["Management", "Operational", "Support"]).issubset(set(course["targets"])) else 0
    score += sum(BASE_NEED_WEIGHTS.get(tag, 0) for tag in course["needTags"])
    if 8 <= course["duration"] <= 60:
        score += 5
    if course["duration"] == 0:
        score -= 8
    if course["duration"] > 90:
        score -= 5
    if "assessment" in title:
        score -= 18
    if "introduction" in title or "basic" in title or "fundamental" in title:
        score += 5
    q = course["releaseQuarterSort"]
    if q >= 20230:
        score += 3
    if q >= 20250:
        score += 3
    if q and q < 20190:
        score -= 4
    if course["category"] == "供應商、設備與產品專題":
        score -= 7
    return score


def row_to_course(idx, row):
    # Do not include department/target fields in classification text; values such as
    # "Deck" or "Engine" describe audience, not necessarily the course subject.
    raw_text = " ".join(clean(row[i]) for i in [3, 12, 16, 23] if i < len(row))
    category = classify(raw_text)
    tag_text = " ".join(clean(row[i]) for i in [3, 12, 16] if i < len(row))
    tags = need_tags(tag_text)
    if not tags and len(row) > 23:
        tags = need_tags(clean(row[23]))
    if category == "基礎安全與船上通用" and "全員基礎安全" not in tags:
        tags.append("全員基礎安全")
    if category == "應急、消防、救生與急救" and "應急程序" not in tags:
        tags.append("應急程序")
    if category == "安全作業程序與高風險作業" and "安全作業程序" not in tags:
        tags.append("安全作業程序")
    if category == "油、化、氣與液貨船專項" and "船型基礎" not in tags:
        tags.append("船型基礎")
    if category == "散貨、集裝箱、客滾與其他船型" and "船型基礎" not in tags:
        tags.append("船型基礎")
    if not tags:
        tags = ["職務專業"] if category in {"甲板、航行與貨物操作", "輪機、電氣與技術設備"} else []

    duration_text = clean(row[13] if len(row) > 13 else "")
    try:
        duration = int(float(duration_text)) if duration_text else 0
    except ValueError:
        duration = 0

    course = {
        "id": idx,
        "availability": clean(row[1] if len(row) > 1 else ""),
        "no": clean(row[2] if len(row) > 2 else ""),
        "title": clean(row[3] if len(row) > 3 else ""),
        "lead": clean(row[6] if len(row) > 6 else "") == "1",
        "leadModule": clean(row[7] if len(row) > 7 else ""),
        "silver": clean(row[8] if len(row) > 8 else "").lower() == "x",
        "gold": clean(row[9] if len(row) > 9 else "").lower() == "x",
        "diamond": clean(row[10] if len(row) > 10 else "").lower() == "x",
        "productType": clean(row[11] if len(row) > 11 else ""),
        "sourceCategory": clean(row[12] if len(row) > 12 else ""),
        "category": category,
        "duration": duration,
        "audioLangs": split_list(row[14] if len(row) > 14 else ""),
        "textLangs": split_list(row[15] if len(row) > 15 else ""),
        "shipTypes": split_list(row[16] if len(row) > 16 else ""),
        "targets": [p.replace(" ", "") if p in {"Management", "Operational", "Support"} else p for p in split_list(row[17] if len(row) > 17 else "")],
        "departments": split_list(row[18] if len(row) > 18 else ""),
        "moduleVersion": clean(row[19] if len(row) > 19 else ""),
        "versionInfo": clean(row[20] if len(row) > 20 else ""),
        "releaseQuarter": clean(row[21] if len(row) > 21 else ""),
        "releaseQuarterSort": parse_quarter(row[21] if len(row) > 21 else ""),
        "productNumbers": clean(row[22] if len(row) > 22 else ""),
        "series": clean(row[23] if len(row) > 23 else ""),
        "needTags": tags,
    }
    course["score"] = score_course(course)
    reason_bits = []
    if course["gold"]:
        reason_bits.append("Ocean Gold 原建議")
    if course["lead"]:
        reason_bits.append("主課程")
    if "Generic" in course["shipTypes"]:
        reason_bits.append("通用船型")
    if set(["Deck", "Engine"]).issubset(set(course["departments"])):
        reason_bits.append("甲板/機艙均可用")
    if course["needTags"]:
        reason_bits.append("覆蓋：" + "、".join(course["needTags"][:3]))
    course["reason"] = "；".join(reason_bits) if reason_bits else "按標題與欄位匹配"
    return course


def load_courses():
    matches = list(DESKTOP.glob("Ocean*selector*v5.4*.xlsx"))
    if not matches:
        raise FileNotFoundError("Ocean library selector v5.4.xlsx not found on Desktop")
    source = matches[0]
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    ws = wb["Library Selector 5.x"]
    rows = list(ws.iter_rows(values_only=True))
    courses = []
    for row_number, row in enumerate(rows[9:], start=10):
        if clean(row[2] if len(row) > 2 else "") or clean(row[3] if len(row) > 3 else ""):
            courses.append(row_to_course(row_number, row))
    courses.sort(key=lambda c: product_no_sort_key(c["no"]))
    return source, rows[8], courses


def top_counter(courses, field, limit=16):
    counter = Counter()
    for course in courses:
        value = course.get(field)
        if isinstance(value, list):
            counter.update(value or ["未標示"])
        else:
            counter.update([value or "未標示"])
    return counter.most_common(limit)


def build_summary(courses, source):
    category_counts = Counter(c["category"] for c in courses)
    need_counts = Counter(tag for c in courses for tag in c["needTags"])
    lead_count = sum(1 for c in courses if c["lead"])
    default_75 = select_default_75(courses)
    return {
        "sourceFile": str(source),
        "effectiveRows": len(courses),
        "leadCourses": lead_count,
        "goldSuggestion": sum(1 for c in courses if c["gold"]),
        "silverSuggestion": sum(1 for c in courses if c["silver"]),
        "diamondSuggestion": sum(1 for c in courses if c["diamond"]),
        "categoryCounts": category_counts.most_common(),
        "needCounts": need_counts.most_common(),
        "productTypes": top_counter(courses, "productType"),
        "availability": top_counter(courses, "availability"),
        "shipTypes": top_counter(courses, "shipTypes", 30),
        "departments": top_counter(courses, "departments"),
        "targets": top_counter(courses, "targets"),
        "languagesAudio": top_counter(courses, "audioLangs", 20),
        "languagesText": top_counter(courses, "textLangs", 20),
        "default75": [c["no"] for c in default_75],
        "default75CategoryCounts": Counter(c["category"] for c in default_75).most_common(),
    }


def select_default_75(courses):
    quotas = {
        "基礎安全與船上通用": 7,
        "應急、消防、救生與急救": 8,
        "安全作業程序與高風險作業": 9,
        "海事英語與溝通": 5,
        "MLC、船員權利義務與健康福利": 6,
        "人因、領導力與安全文化": 6,
        "環保、污染防治與能源效率": 6,
        "保安、網絡安全與反海盜": 4,
        "合規、ISM、審核與檢查準備": 5,
        "甲板、航行與貨物操作": 5,
        "輪機、電氣與技術設備": 5,
        "油、化、氣與液貨船專項": 5,
        "散貨、集裝箱、客滾與其他船型": 3,
        "餐飲、生活區與公共衛生": 2,
        "供應商、設備與產品專題": 1,
        "其他或需人工判斷": 3,
    }
    selected = []
    used_titles = set()
    by_cat = defaultdict(list)
    for c in courses:
        if not c["lead"]:
            continue
        by_cat[c["category"]].append(c)
    for cat, pool in by_cat.items():
        pool.sort(key=lambda c: (-c["score"], product_no_sort_key(c["no"])))
    for cat, quota in quotas.items():
        for c in by_cat.get(cat, []):
            key = re.sub(r"[^a-z0-9]+", "", c["title"].lower())
            if key in used_titles:
                continue
            selected.append(c)
            used_titles.add(key)
            if sum(1 for x in selected if x["category"] == cat) >= quota:
                break
    remaining = sorted([c for c in courses if c["lead"]], key=lambda c: (-c["score"], product_no_sort_key(c["no"])))
    for c in remaining:
        if len(selected) >= 75:
            break
        key = re.sub(r"[^a-z0-9]+", "", c["title"].lower())
        if key not in used_titles:
            selected.append(c)
            used_titles.add(key)
    return selected[:75]


def html_template(data_json, summary_json, category_json, need_json, sheetjs_js):
    return f"""<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CBT課程推薦與長期規劃</title>
  <style>
    :root {{
      --bg: #f5f8fb;
      --panel: #ffffff;
      --panel-soft: #eef5f8;
      --text: #102033;
      --muted: #667589;
      --line: #d8e2ea;
      --navy: #0c3556;
      --teal: #0f9488;
      --teal-dark: #08756d;
      --amber: #d28a1c;
      --red: #b94141;
      --green: #267b46;
      --shadow: 0 12px 34px rgba(16, 32, 51, 0.08);
      font-family: Inter, "Segoe UI", "Microsoft JhengHei", "Noto Sans TC", Arial, sans-serif;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{ overflow-x: hidden; }}
    body {{ margin: 0; color: var(--text); background: var(--bg); }}
    button, input, select, textarea {{ font: inherit; }}
    .app {{ min-height: 100vh; display: flex; flex-direction: column; }}
    header {{ background: #fff; border-bottom: 1px solid var(--line); position: sticky; top: 0; z-index: 20; }}
    .topbar {{ max-width: 1480px; margin: 0 auto; padding: 16px 22px 12px; display: flex; gap: 18px; align-items: center; justify-content: space-between; }}
    .brand {{ display: flex; gap: 12px; align-items: center; min-width: 260px; }}
    .mark {{ width: 38px; height: 38px; border-radius: 8px; background: var(--navy); color: #fff; display: grid; place-items: center; font-weight: 800; letter-spacing: 0; }}
    h1 {{ margin: 0; font-size: 22px; line-height: 1.2; }}
    .sub {{ color: var(--muted); font-size: 13px; margin-top: 3px; }}
    .tabs {{ display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }}
    .tab {{ border: 1px solid transparent; background: transparent; color: var(--muted); padding: 9px 12px; border-radius: 7px; cursor: pointer; }}
    .tab.active {{ background: var(--navy); color: #fff; }}
    .header-actions {{ display: flex; gap: 8px; align-items: center; }}
    .btn {{ border: 1px solid var(--line); background: #fff; color: var(--text); border-radius: 7px; padding: 9px 12px; cursor: pointer; transition: .16s ease; }}
    .btn:hover {{ border-color: var(--teal); color: var(--teal-dark); }}
    .btn.primary {{ background: var(--teal); border-color: var(--teal); color: #fff; }}
    .btn.primary:hover {{ background: var(--teal-dark); color: #fff; }}
    .btn.danger {{ color: var(--red); }}
    main {{ width: 100%; max-width: 1480px; margin: 0 auto; padding: 22px; flex: 1; }}
    .view {{ display: none; }}
    .view.active {{ display: block; }}
    .grid {{ display: grid; gap: 16px; }}
    .grid.cols-4 {{ grid-template-columns: repeat(4, minmax(0, 1fr)); }}
    .grid.cols-3 {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }}
    .grid.cols-2 {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
    .panel {{ background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }}
    .panel.pad {{ padding: 18px; }}
    .metric {{ padding: 16px; min-height: 110px; }}
    .metric .label {{ color: var(--muted); font-size: 13px; }}
    .metric .value {{ font-size: 30px; font-weight: 800; margin: 8px 0 3px; }}
    .metric .note {{ font-size: 13px; color: var(--muted); line-height: 1.5; }}
    .layout-3 {{ display: grid; grid-template-columns: 260px minmax(0, 1fr) 310px; gap: 16px; align-items: start; }}
    .filters {{ position: sticky; top: 88px; }}
    .section-title {{ display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 12px; }}
    h2 {{ margin: 0; font-size: 19px; }}
    h3 {{ margin: 0 0 10px; font-size: 16px; }}
    .field {{ margin-bottom: 13px; }}
    .field label.title {{ display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 700; }}
    .field input[type="text"], .field input[type="number"], .field select {{ width: 100%; border: 1px solid var(--line); background: #fff; border-radius: 7px; padding: 9px 10px; color: var(--text); }}
    .help-text {{ color: var(--muted); font-size: 12px; line-height: 1.55; margin: -4px 0 12px; }}
    .help-box {{ background: #f5f9fb; border: 1px solid var(--line); border-radius: 8px; padding: 10px 11px; color: #526377; font-size: 12px; line-height: 1.55; margin: 12px 0; }}
    .check-list {{ display: grid; gap: 7px; max-height: 210px; overflow: auto; padding-right: 4px; }}
    .check {{ display: flex; gap: 7px; align-items: flex-start; font-size: 13px; line-height: 1.35; color: #26384c; }}
    .check input {{ margin-top: 2px; accent-color: var(--teal); }}
    .toolbar {{ display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }}
    .toolbar .grow {{ flex: 1; min-width: 220px; }}
    .status-pill {{ display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 6px 10px; font-size: 13px; background: #fff; color: var(--muted); }}
    .status-pill strong {{ color: var(--text); }}
    table {{ width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }}
    .table-wrap table {{ min-width: 900px; }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 10px 9px; text-align: left; vertical-align: top; }}
    th {{ position: sticky; top: 72px; background: #f9fbfd; z-index: 5; color: #415066; font-size: 12px; }}
    tr.selected-row {{ background: #eefbf7; }}
    .table-wrap {{ max-height: 690px; overflow: auto; border-top: 1px solid var(--line); border-radius: 8px; }}
    .course-title {{ font-weight: 700; color: var(--navy); }}
    .muted {{ color: var(--muted); }}
    .tagline {{ display: flex; gap: 5px; flex-wrap: wrap; margin-top: 6px; }}
    .tag {{ display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 7px; font-size: 11px; background: #edf3f7; color: #425468; }}
    .tag.teal {{ background: #e3f7f3; color: #08756d; }}
    .tag.amber {{ background: #fff4dc; color: #8c5809; }}
    .tag.navy {{ background: #e9f0f8; color: #0c3556; }}
    .progress {{ height: 9px; background: #e8eef3; border-radius: 99px; overflow: hidden; }}
    .progress span {{ display: block; height: 100%; background: var(--teal); width: 0; }}
    .bar-row {{ display: grid; grid-template-columns: 1fr 46px; gap: 8px; align-items: center; margin: 9px 0; font-size: 13px; }}
    .summary-list {{ display: grid; gap: 8px; }}
    .summary-item {{ display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }}
    .summary-item .desc {{ display: block; margin-top: 3px; color: var(--muted); font-size: 11px; line-height: 1.35; }}
    .freq-group {{ border-top: 1px solid var(--line); padding-top: 10px; margin-top: 10px; }}
    .freq-group h4 {{ margin: 0 0 6px; color: var(--navy); font-size: 13px; }}
    .freq-list {{ display: grid; gap: 0; margin-top: 8px; }}
    .freq-course {{ display: grid; grid-template-columns: 72px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid #eef2f5; font-size: 12px; }}
    .freq-course strong {{ color: var(--navy); }}
    .small {{ font-size: 12px; }}
    .advice {{ line-height: 1.68; color: #314257; }}
    .advice p {{ margin: 0 0 10px; }}
    .category-card {{ padding: 15px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }}
    .category-card .count {{ font-weight: 800; color: var(--teal-dark); }}
    .plan-board {{ overflow: auto; }}
    .plan-grid {{ min-width: 980px; display: grid; grid-template-columns: 210px repeat(5, minmax(135px, 1fr)) 110px; border-top: 1px solid var(--line); border-left: 1px solid var(--line); }}
    .plan-cell {{ padding: 10px; min-height: 58px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #fff; }}
    .plan-head {{ background: #f1f6fa; font-weight: 800; color: var(--navy); }}
    .year-drop {{ min-height: 42px; border: 1px dashed #b7c7d3; border-radius: 7px; padding: 7px; background: #fbfdff; }}
    .year-drop.active {{ border-color: var(--teal); background: #effbf8; }}
    .mini-course {{ display: flex; gap: 6px; justify-content: space-between; align-items: center; padding: 5px 7px; margin: 4px 0; background: #eef5f8; border-radius: 6px; font-size: 12px; }}
    .mini-course button {{ border: 0; background: transparent; color: var(--red); cursor: pointer; }}
    .split {{ display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }}
    .notice {{ background: #fff8e8; border: 1px solid #edd4a4; color: #5d4216; padding: 12px 14px; border-radius: 8px; line-height: 1.55; }}
    .empty {{ padding: 30px; text-align: center; color: var(--muted); }}
    .hidden {{ display: none !important; }}

    /* Concept-faithful dashboard skin */
    header {{
      background: linear-gradient(180deg, #103b63 0%, #092a49 100%);
      border-bottom: 1px solid #061d34;
      box-shadow: 0 10px 24px rgba(6, 29, 52, 0.18);
    }}
    .topbar {{ max-width: none; min-height: 66px; padding: 0 20px; color: #fff; }}
    .brand {{ min-width: 320px; }}
    .mark {{ background: #ffffff; color: var(--navy); border-radius: 6px; width: 34px; height: 34px; font-size: 12px; }}
    h1 {{ color: #fff; font-size: 25px; letter-spacing: 0; }}
    .sub {{ color: rgba(255,255,255,0.7); }}
    .tab {{ color: rgba(255,255,255,0.82); border-radius: 0; padding: 22px 16px 19px; border-bottom: 3px solid transparent; }}
    .tab.active {{ background: rgba(255,255,255,0.08); color: #fff; border-bottom-color: #6eb6ff; }}
    .header-actions .status-pill {{ background: rgba(255,255,255,0.08); color: #d9e6f2; border-color: rgba(255,255,255,0.18); }}
    .header-actions .status-pill strong {{ color: #fff; }}
    .header-actions .btn {{ background: rgba(255,255,255,0.08); color: #fff; border-color: rgba(255,255,255,0.22); }}
    .header-actions .btn.primary {{ background: var(--teal); border-color: var(--teal); }}
    main {{ max-width: none; padding: 16px 20px 22px; }}
    .panel {{ box-shadow: 0 8px 26px rgba(16, 32, 51, 0.06); }}
    .dashboard-metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-bottom: 16px; border-radius: 8px; overflow: hidden; }}
    .dashboard-metrics .metric {{ border-radius: 0; box-shadow: none; border-right: 0; min-height: 112px; display: grid; grid-template-columns: 54px 1fr; gap: 12px; align-items: center; }}
    .dashboard-metrics .metric:last-child {{ border-right: 1px solid var(--line); }}
    .metric-icon {{ width: 42px; height: 42px; border-radius: 8px; display: grid; place-items: center; color: #074b83; background: #edf5ff; font-weight: 900; font-size: 22px; }}
    .metric .value.teal {{ color: var(--teal); }}
    .metric .value.amber {{ color: var(--amber); }}
    .layout-3 {{ grid-template-columns: 300px minmax(0, 1fr) 320px; gap: 14px; }}
    .filters {{ top: 82px; }}
    .panel.pad {{ padding: 16px; }}
    h2 {{ color: var(--navy); font-size: 18px; }}
    .table-wrap {{ max-height: 610px; border: 1px solid var(--line); border-radius: 0 0 8px 8px; }}
    th {{ top: 0; background: #f3f7fa; color: #213952; font-weight: 800; }}
    .recommend-shell .section-title {{ background: #fff; border: 1px solid var(--line); border-bottom: 0; border-radius: 8px 8px 0 0; margin: 0; padding: 12px 14px; }}
    .recommend-shell .toolbar {{ margin: 0; }}
    .recommend-shell td {{ padding: 8px 6px; }}
    .recommend-shell .course-title {{ line-height: 1.3; white-space: normal; overflow: visible; }}
    .recommend-shell .table-wrap {{ max-height: none; overflow: visible; }}
    .recommend-shell .table-wrap table {{ min-width: 0; table-layout: fixed; }}
    .recommend-shell th:nth-child(1) {{ width: 34px !important; }}
    .recommend-shell th:nth-child(2) {{ width: 48px !important; }}
    .recommend-shell th:nth-child(4) {{ width: 70px !important; }}
    .recommend-shell th:nth-child(5) {{ width: 56px !important; }}
    .recommend-shell th:nth-child(6) {{ width: 78px !important; }}
    .recommend-shell th:nth-child(7) {{ width: 36px !important; }}
    .recommend-shell th:nth-child(8) {{ width: 38px !important; }}
    .recommend-shell td {{ overflow-wrap: anywhere; }}
    .recommend-shell td:nth-child(4), .recommend-shell td:nth-child(5), .recommend-shell td:nth-child(6) {{ white-space: normal; word-break: break-word; }}
    .recommend-shell td:nth-child(7), .recommend-shell td:nth-child(8) {{ text-align: center; padding-left: 3px; padding-right: 3px; }}
    .recommend-shell .plan-no {{ display: inline-block; line-height: 1.12; text-align: center; min-width: 32px; }}
    .recommend-shell td:nth-child(2) .small {{ font-size: 10px; line-height: 1.1; }}
    .recommend-shell .muted.small {{ display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 520px; }}
    .recommend-shell .tagline {{ margin-top: 4px; gap: 4px; max-height: 23px; overflow: hidden; }}
    .recommend-shell .tag {{ padding: 2px 6px; }}
    .recommend-shell .tag:nth-child(n+4) {{ display: none; }}
    .summary-hero {{ border-bottom: 1px solid var(--line); padding-bottom: 14px; margin-bottom: 14px; }}
    .summary-hero .big {{ display: flex; align-items: center; justify-content: space-between; gap: 10px; }}
    .summary-hero .big strong {{ font-size: 34px; color: var(--teal); }}
    .summary-hero .okmark {{ width: 32px; height: 32px; border: 2px solid var(--teal); border-radius: 50%; color: var(--teal); display: grid; place-items: center; font-weight: 900; }}
    .plan-preview {{ margin-top: 14px; }}
    .plan-preview table {{ min-width: 920px; }}
    .plan-preview th, .plan-preview td {{ padding: 9px 10px; }}
    .year-band {{ height: 24px; border-radius: 5px; display: grid; place-items: center; font-weight: 800; font-size: 12px; }}
    .year-band.keep {{ background: #ccefe9; color: #08756d; }}
    .year-band.change {{ background: #ffe0a7; color: #8c5809; }}
    .year-band.new {{ background: #c9def6; color: #165b99; }}
    .plan-layout {{ grid-template-columns: minmax(0, 1fr) 320px; align-items: start; }}
    .plan-layout > .panel:first-child {{ min-width: 0; }}
    .plan-summary-panel {{ align-self: start; position: sticky; top: 96px; }}
    .year-cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; overflow: visible; padding-bottom: 0; }}
    .year-card {{ min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; }}
    .year-card-head {{ display: grid; gap: 5px; padding: 9px 8px; background: #f3f7fa; border-bottom: 1px solid var(--line); }}
    .year-card-head .status-pill {{ justify-content: center; width: 100%; padding: 4px 6px; font-size: 11px; }}
    .year-card-body {{ max-height: 650px; overflow-y: auto; overflow-x: hidden; }}
    .year-card table {{ min-width: 0; table-layout: fixed; font-size: 11px; }}
    .year-card th, .year-card td {{ padding: 5px 4px; line-height: 1.32; }}
    .year-card th {{ font-size: 11px; }}
    .year-card .seq-col {{ width: 24px; }}
    .year-card .no-col {{ width: 44px; }}
    .year-card .action-col {{ width: 30px; }}
    .year-card .plan-title {{ white-space: normal; overflow-wrap: anywhere; word-break: normal; }}
    .year-card .plan-no {{ display: inline-block; line-height: 1.15; text-align: center; }}
    .year-card .plan-category {{ display: block; margin-top: 2px; line-height: 1.25; }}
    .year-card .btn.small {{ padding: 3px 6px; min-width: 24px; }}
    .coverage-table-wrap {{ max-height: 460px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }}
    .coverage-table-wrap table {{ min-width: 760px; }}
    .plan-actions {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }}
    .status-flash {{ color: var(--teal-dark); font-weight: 700; font-size: 12px; opacity: 0; transition: opacity .18s ease; }}
    .status-flash.show {{ opacity: 1; }}
    @media (max-width: 1100px) {{
      .layout-3, .split {{ grid-template-columns: 1fr; }}
      .filters {{ position: static; }}
      .grid.cols-4, .grid.cols-3, .grid.cols-2 {{ grid-template-columns: 1fr 1fr; }}
      .year-cards {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
      .plan-summary-panel {{ position: static; }}
      th {{ top: 0; }}
    }}
    @media (max-width: 700px) {{
      .topbar {{ align-items: flex-start; flex-direction: column; }}
      main {{ padding: 14px; }}
      .grid.cols-4, .grid.cols-3, .grid.cols-2 {{ grid-template-columns: 1fr; }}
      .header-actions {{ width: 100%; flex-wrap: wrap; }}
      .btn {{ width: auto; }}
      h1 {{ font-size: 19px; }}
      .metric .value {{ font-size: 25px; }}
      table {{ font-size: 12px; }}
      .year-cards {{ grid-template-columns: 1fr; }}
      th, td {{ padding: 8px 7px; }}
    }}
  </style>
</head>
<body>
<div class="app">
  <header>
    <div class="topbar">
      <div class="brand">
        <div class="mark">CBT</div>
        <div>
          <h1>CBT課程推薦與長期規劃</h1>
          <div class="sub">Ocean Library Selector 5.x · Rev.2026-Q1 · 單文件離線使用</div>
        </div>
      </div>
      <nav class="tabs" id="tabs"></nav>
      <div class="header-actions">
        <span class="status-pill"><span data-active-year>2026</span>：<strong id="selectedCountTop">0</strong> / <span data-target-limit>75</span> 已選</span>
        <button class="btn primary" id="copySelectedTop">複製課程編號</button>
      </div>
    </div>
  </header>
  <main>
    <section class="view" id="view-overview"></section>
    <section class="view active" id="view-recommend"></section>
    <section class="view" id="view-library"></section>
    <section class="view" id="view-analysis"></section>
    <section class="view" id="view-plan"></section>
  </main>
</div>
<script id="course-data" type="application/json">{data_json}</script>
<script>
{sheetjs_js}
</script>
<script>
const EMBEDDED_COURSES = JSON.parse(document.getElementById('course-data').textContent);
const EMBEDDED_SUMMARY = {summary_json};
const CATEGORY_META = {category_json};
const NEED_META = {need_json};
let TARGET_LIMIT = Math.max(1, Math.min(500, Number(localStorage.getItem('cbt:targetLimit')) || 75));
const TABS = [
  ['overview', '總覽'],
  ['recommend', '智能推薦'],
  ['library', '課程庫'],
  ['analysis', '分類分析'],
  ['plan', '長期規劃']
];
const PLAN_YEAR_MIN = 2026;
const PLAN_YEAR_MAX = 2100;
const storedPlanStart = Math.max(PLAN_YEAR_MIN, Math.min(PLAN_YEAR_MAX, Number(localStorage.getItem('cbt:planStart')) || 2026));
const storedPlanEnd = Math.max(storedPlanStart, Math.min(PLAN_YEAR_MAX, Number(localStorage.getItem('cbt:planEnd')) || 2030));
let YEARS = buildYearRange(storedPlanStart, storedPlanEnd);
let COURSES = JSON.parse(localStorage.getItem('cbt:courses') || 'null') || EMBEDDED_COURSES;
let SUMMARY = JSON.parse(localStorage.getItem('cbt:summary') || 'null') || EMBEDDED_SUMMARY;
let courseByNo = new Map();
let default75 = new Set();
const storedSelected = localStorage.getItem('cbt:selected');
const storedPlanning = JSON.parse(localStorage.getItem('cbt:planning') || '{{}}');
const initialYearStored = localStorage.getItem('cbt:activeYear') || YEARS[0];
const initialYear = YEARS.includes(initialYearStored) ? initialYearStored : YEARS[0];
if (!storedPlanning[YEARS[0]] || !storedPlanning[YEARS[0]].length) storedPlanning[YEARS[0]] = storedSelected ? JSON.parse(storedSelected) : (SUMMARY.default75 || []).slice(0, TARGET_LIMIT);
if (!storedPlanning[initialYear]) storedPlanning[initialYear] = [];
const state = {{
  activeYear: initialYear,
  selected: new Set(storedPlanning[initialYear] || []),
  filters: {{ query: '', category: '全部', ship: '全部', department: '全部', target: '全部', need: '全部', leadOnly: false }},
  recommend: {{ needs: new Set(Object.keys(NEED_META)), ships: new Set(['Generic','Oil tanker','Chemical tanker','Gas Tanker','Bulk/Ore carrier']), departments: new Set(['Deck','Engine','Electric']), targets: new Set(['Management','Operational','Support']), leadOnly: true, count: TARGET_LIMIT }},
  planning: storedPlanning,
  latestRecommended: [],
  showingSelected: false,
  previousRecommended: [],
  previousGuidedActive: false,
  recommendMode: localStorage.getItem('cbt:recommendMode') || 'balanced',
  guided: {{ field: 'needTags', values: [], active: false }},
  coverageSort: localStorage.getItem('cbt:coverageSort') || 'rateDesc'
}};
rebuildCourseIndexes();
resetPlanningToValidCourses();

function save() {{
  state.planning[state.activeYear] = sortNos([...state.selected]);
  localStorage.setItem('cbt:activeYear', state.activeYear);
  localStorage.setItem('cbt:selected', JSON.stringify(sortNos([...state.selected])));
  localStorage.setItem('cbt:planning', JSON.stringify(state.planning));
  localStorage.setItem('cbt:recommendMode', state.recommendMode);
  localStorage.setItem('cbt:coverageSort', state.coverageSort);
  localStorage.setItem('cbt:targetLimit', String(TARGET_LIMIT));
  localStorage.setItem('cbt:planStart', YEARS[0]);
  localStorage.setItem('cbt:planEnd', YEARS[YEARS.length - 1]);
}}
function pct(num, den) {{ return den ? Math.round(num * 100 / den) : 0; }}
function uniq(arr) {{ return [...new Set(arr.filter(Boolean))]; }}
function hasAny(list, set) {{ return list.some(x => set.has(x)); }}
function escapeHtml(s) {{ return String(s ?? '').replace(/[&<>"']/g, ch => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}}[ch])); }}
function chip(text, cls='') {{ return `<span class="tag ${{cls}}">${{escapeHtml(text)}}</span>`; }}
function buildYearRange(start, end) {{
  const s = Math.max(PLAN_YEAR_MIN, Math.min(PLAN_YEAR_MAX, Number(start) || PLAN_YEAR_MIN));
  const e = Math.max(s, Math.min(PLAN_YEAR_MAX, Number(end) || s));
  return Array.from({{ length: e - s + 1 }}, (_, i) => String(s + i));
}}
function allPlanYearOptions(current) {{
  return Array.from({{ length: PLAN_YEAR_MAX - PLAN_YEAR_MIN + 1 }}, (_, i) => String(PLAN_YEAR_MIN + i))
    .map(y => `<option value="${{y}}" ${{String(current)===y?'selected':''}}>${{y}}</option>`).join('');
}}
function planNoHtml(no) {{
  const value = String(no || '');
  const match = value.match(/^No\\.\\s*(.+)$/i);
  return match ? `No.<br>${{escapeHtml(match[1])}}` : escapeHtml(value).replace(/\\s+/, '<br>');
}}
function rebuildCourseIndexes() {{
  courseByNo = new Map(COURSES.map(c => [c.no, c]));
  default75 = new Set((SUMMARY.default75 || []).filter(no => courseByNo.has(no)));
}}
function saveCourseBank() {{
  localStorage.setItem('cbt:courses', JSON.stringify(COURSES));
  localStorage.setItem('cbt:summary', JSON.stringify(SUMMARY));
}}
function resetPlanningToValidCourses() {{
  YEARS.forEach(y => {{
    state.planning[y] = sortNos((state.planning[y] || []).filter(no => courseByNo.has(no))).slice(0, TARGET_LIMIT);
  }});
  state.selected = new Set(state.planning[state.activeYear] || []);
}}
function buildDynamicSummary(courses) {{
  const categoryCounts = Counter(courses.map(c => c.category));
  const needCounts = Counter(courses.flatMap(c => c.needTags || []));
  const summary = {{
    sourceFile: '瀏覽器導入題庫',
    effectiveRows: courses.length,
    leadCourses: courses.filter(c => c.lead).length,
    goldSuggestion: courses.filter(c => c.gold).length,
    silverSuggestion: courses.filter(c => c.silver).length,
    diamondSuggestion: courses.filter(c => c.diamond).length,
    categoryCounts,
    needCounts,
    productTypes: Counter(courses.map(c => c.productType)).slice(0,16),
    availability: Counter(courses.map(c => c.availability)).slice(0,16),
    shipTypes: Counter(courses.flatMap(c => c.shipTypes || [])).slice(0,30),
    departments: Counter(courses.flatMap(c => c.departments || [])).slice(0,16),
    targets: Counter(courses.flatMap(c => c.targets || [])).slice(0,16),
    languagesAudio: Counter(courses.flatMap(c => c.audioLangs || [])).slice(0,20),
    languagesText: Counter(courses.flatMap(c => c.textLangs || [])).slice(0,20),
    default75: [],
    default75CategoryCounts: []
  }};
  summary.default75 = selectDefault75Dynamic(courses).map(c => c.no);
  summary.default75CategoryCounts = Counter(selectDefault75Dynamic(courses).map(c => c.category));
  return summary;
}}
function selectDefault75Dynamic(courses) {{
  const lead = courses.filter(c => c.lead);
  const pool = (lead.length ? lead : courses).slice().sort((a,b) => (b.score || 0) - (a.score || 0) || compareCourse(a,b));
  const selected = [];
  const seenCategory = new Map();
  for (const c of pool) {{
    const used = seenCategory.get(c.category) || 0;
    if (used < 8 && selected.length < TARGET_LIMIT) {{
      selected.push(c);
      seenCategory.set(c.category, used + 1);
    }}
  }}
  for (const c of pool) {{
    if (selected.length >= TARGET_LIMIT) break;
    if (!selected.some(x => x.no === c.no)) selected.push(c);
  }}
  return selected.slice(0,TARGET_LIMIT);
}}

function initTabs() {{
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([id, label]) => `<button class="tab ${{id==='recommend'?'active':''}}" data-tab="${{id}}">${{label}}</button>`).join('');
  nav.addEventListener('click', e => {{
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + btn.dataset.tab));
    if (btn.dataset.tab === 'plan') renderPlan();
  }});
}}

function selectedCourses() {{
  return [...state.selected].map(no => courseByNo.get(no)).filter(Boolean);
}}
function selectedMetrics(courses = selectedCourses()) {{
  const needs = new Set(courses.flatMap(c => c.needTags));
  const depts = new Set(courses.flatMap(c => c.departments));
  const ships = new Set(courses.flatMap(c => c.shipTypes));
  const targets = new Set(courses.flatMap(c => c.targets));
  const categories = new Set(courses.map(c => c.category));
  return {{ needs, depts, ships, targets, categories }};
}}
function updateSelectedBadges() {{
  document.getElementById('selectedCountTop').textContent = state.selected.size;
  const top = document.querySelector('.status-pill');
  if (top) top.style.borderColor = state.selected.size > TARGET_LIMIT ? 'var(--red)' : 'var(--line)';
  document.querySelectorAll('[data-active-year]').forEach(el => el.textContent = state.activeYear);
  document.querySelectorAll('[data-selected-count]').forEach(el => el.textContent = state.selected.size);
  document.querySelectorAll('[data-target-limit]').forEach(el => el.textContent = TARGET_LIMIT);
  document.querySelectorAll('[data-selected-progress]').forEach(el => el.style.width = `${{Math.min(100, pct(state.selected.size, TARGET_LIMIT))}}%`);
  renderDashboardMetrics();
  if (document.getElementById('recommendCoverage') && state.latestRecommended.length) renderCoverage('recommendCoverage', state.latestRecommended, '推薦覆蓋');
  save();
}}
function toggleSelect(no, checked) {{
  if (checked === undefined) checked = !state.selected.has(no);
  if (checked) state.selected.add(no); else state.selected.delete(no);
  updateSelectedBadges();
  renderSelectionSummary();
  document.querySelectorAll(`[data-select-no="${{CSS.escape(no)}}"]`).forEach(input => input.checked = state.selected.has(no));
  document.querySelectorAll(`[data-row-no="${{CSS.escape(no)}}"]`).forEach(row => row.classList.toggle('selected-row', state.selected.has(no)));
  if (state.guided.active && document.getElementById('view-recommend').classList.contains('active')) runGuidedSelection();
}}
function addMany(courses) {{
  state.selected = new Set(sortCourses(courses.slice(0, TARGET_LIMIT)).map(c => c.no));
  updateSelectedBadges();
  renderAll();
}}
function setTargetLimit(value) {{
  TARGET_LIMIT = Math.max(1, Math.min(500, Number(value) || 75));
  state.recommend.count = TARGET_LIMIT;
  YEARS.forEach(y => {{
    state.planning[y] = sortNos(state.planning[y] || []).slice(0, TARGET_LIMIT);
  }});
  state.selected = new Set((state.planning[state.activeYear] || []).slice(0, TARGET_LIMIT));
  save();
  renderAll();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
  updateSelectedBadges();
}}
function setPlanRange(start, end) {{
  const nextYears = buildYearRange(start, end);
  YEARS = nextYears;
  YEARS.forEach(y => {{ if (!state.planning[y]) state.planning[y] = []; }});
  if (!YEARS.includes(state.activeYear)) {{
    save();
    state.activeYear = YEARS[0];
    state.selected = new Set(state.planning[state.activeYear] || []);
  }}
  save();
  renderAll();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
  updateSelectedBadges();
}}
function clearSelected() {{
  if (!confirm(`清空 ${{state.activeYear}} 年已選課程？`)) return;
  state.selected.clear();
  updateSelectedBadges();
  renderAll();
}}
function copySelected() {{
  const text = selectedCourses().map(c => c.no).join('\\n');
  navigator.clipboard?.writeText(text);
  alert(`已複製 ${{state.selected.size}} 個課程編號`);
}}

function optionList(values, current) {{
  return ['全部', ...values].map(v => `<option ${{v===current?'selected':''}}>${{escapeHtml(v)}}</option>`).join('');
}}
function valuesFor(field) {{
  return uniq(COURSES.flatMap(c => Array.isArray(c[field]) ? c[field] : [c[field]])).sort((a,b)=>a.localeCompare(b));
}}
function courseNoValue(no) {{
  const match = String(no || '').match(/\\d+(?:\\.\\d+)?/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}}
function compareCourse(a, b) {{
  const av = courseNoValue(a.no);
  const bv = courseNoValue(b.no);
  if (av !== bv) return av - bv;
  return String(a.no).localeCompare(String(b.no), undefined, {{ numeric: true }});
}}
function sortCourses(courses) {{
  return [...courses].sort(compareCourse);
}}
function sortNos(nos) {{
  return sortCourses((nos || []).map(no => courseByNo.get(no)).filter(Boolean)).map(c => c.no);
}}
function yearOptions(current = state.activeYear) {{
  return YEARS.map(y => `<option value="${{y}}" ${{y === current ? 'selected' : ''}}>${{y}}</option>`).join('');
}}
function setActiveYear(year) {{
  save();
  state.activeYear = year;
  if (!state.planning[year]) state.planning[year] = [];
  state.selected = new Set(state.planning[year]);
  updateSelectedBadges();
  renderSelectionSummary();
  if (document.getElementById('view-recommend').classList.contains('active')) renderRecommend();
  if (document.getElementById('view-library').classList.contains('active')) renderLibrary();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
}}
function selectedCoursesForYear(year) {{
  return sortCourses((state.planning[year] || []).map(no => courseByNo.get(no)).filter(Boolean));
}}
function clearActiveYear() {{
  if (!confirm(`清空 ${{state.activeYear}} 年所有已選課程？`)) return;
  state.selected.clear();
  state.planning[state.activeYear] = [];
  save();
  renderAll();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
}}
function clearRecommendAll() {{
  if (!confirm(`清空 ${{state.activeYear}} 年已選課程，並取消智能推薦所有篩選條件？`)) return;
  state.selected.clear();
  state.planning[state.activeYear] = [];
  state.recommend.needs = new Set();
  state.recommend.ships = new Set();
  state.recommend.departments = new Set();
  state.recommend.targets = new Set();
  state.recommend.leadOnly = false;
  state.recommend.count = TARGET_LIMIT;
  save();
  renderRecommend();
  updateSelectedBadges();
}}
async function readWorkbookFile(file) {{
  if (!window.XLSX) throw new Error('Excel 解析器未載入');
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, {{ type: 'array' }});
}}
function sheetRows(workbook, preferredName) {{
  const name = workbook.SheetNames.includes(preferredName) ? preferredName : workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {{ header: 1, raw: false, defval: '' }});
}}
function normalizeNo(value) {{
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(?:No\\.?\\s*)?(\\d+(?:\\.\\d+)?)/i);
  return match ? `No. ${{match[1].padStart(4, '0')}}` : text;
}}
function splitList(value) {{
  return String(value || '').split(/[,;；、\\n]+/).map(x => x.trim()).filter(Boolean);
}}
function parseBoolX(value) {{
  return String(value || '').trim().toLowerCase() === 'x' || String(value || '').trim() === '1';
}}
function inferNeedTags(text, category) {{
  const t = `${{text}} ${{category}}`.toLowerCase();
  const tags = [];
  const add = n => {{ if (!tags.includes(n)) tags.push(n); }};
  if (/safety|personal|familiar|risk|permit|ppe|hot work|enclosed|working aloft|mooring|slip|trip|fall/.test(t)) add('全員基礎安全');
  if (/emerg|fire|rescue|survival|lifeboat|first aid|abandon|search and rescue|medical/.test(t)) add('應急程序');
  if (/risk|permit|enclosed|hot work|ppe|lifting|mooring|working aloft|confined|hazard/.test(t)) add('安全作業程序');
  if (/english|communication|smcp|maritime english|pilot/.test(t)) add('海事英語');
  if (/mlc|welfare|fatigue|mental|health|drug|alcohol|rights|crew/.test(t)) add('MLC權利義務');
  if (/human|leadership|team|culture|brm|erm|crm/.test(t)) add('職務專業');
  if (/tmsa|ism|audit|inspection|psc|sire|vetting|compliance/.test(t)) add('TMSA與合規');
  if (/marpol|pollution|environment|sopep|ballast|garbage|energy|emission|scrubber|ihm|fuel/.test(t)) add('環境與新燃料');
  if (/security|cyber|piracy|stowaway|isps/.test(t)) add('保安與網絡');
  return tags.length ? tags : ['職務專業'];
}}
function inferCategory(title, sourceCategory, shipTypes, departments, series) {{
  const t = `${{title}} ${{sourceCategory}} ${{shipTypes.join(' ')}} ${{departments.join(' ')}} ${{series}}`.toLowerCase();
  if (/personal safety|ship general safety|vessel safety|general safety|familiarisation|familiarization|safety officer/.test(t)) return '基礎安全與船上通用';
  if (/tanker|oil|chemical|lng|lpg|gas|cargo tank|liquid|igf|hazmat|hydrogen|ammonia|methanol/.test(t)) return '油、化、氣與液貨船專項';
  if (/bulk|container|passenger|ro-ro|cruise|offshore|dp|imsbc/.test(t)) return '散貨、集裝箱、客滾與其他船型';
  if (/fire|rescue|survival|lifeboat|emergency|first aid|medical/.test(t)) return '應急、消防、救生與急救';
  if (/enclosed|hot work|permit|risk|ppe|mooring|lifting|working aloft|hazard|confined/.test(t)) return '安全作業程序與高風險作業';
  if (/english|communication|smcp|pilot/.test(t)) return '海事英語與溝通';
  if (/mlc|welfare|fatigue|mental|health|drug|alcohol|rights/.test(t)) return 'MLC、船員權利義務與健康福利';
  if (/human|leadership|team|culture|brm|erm|crm/.test(t)) return '人因、領導力與安全文化';
  if (/marpol|pollution|environment|sopep|ballast|garbage|energy|emission|scrubber|ihm/.test(t)) return '環保、污染防治與能源效率';
  if (/security|cyber|piracy|stowaway|isps/.test(t)) return '保安、網絡安全與反海盜';
  if (/ism|audit|inspection|psc|sire|vetting|compliance|code/.test(t)) return '合規、ISM、審核與檢查準備';
  if (/navigation|radar|gmdss|bridge|deck|cargo|stability|anchor/.test(t)) return '甲板、航行與貨物操作';
  if (/engine|machinery|boiler|pump|electrical|generator|hydraulic|auxiliary/.test(t)) return '輪機、電氣與技術設備';
  if (/catering|food|galley|hygiene|sanitation/.test(t)) return '餐飲、生活區與公共衛生';
  if (/supplier|maker|product|system|equipment/.test(t)) return '供應商、設備與產品專題';
  if (/safety|familiar|personal/.test(t)) return '基礎安全與船上通用';
  return '其他或需人工判斷';
}}
function scoreImportedCourse(c) {{
  let score = 0;
  if (c.gold) score += 80;
  if (c.diamond) score += 35;
  if (c.silver) score += 20;
  if (c.lead) score += 22;
  if (c.shipTypes.includes('Generic')) score += 12;
  if (c.departments.includes('Deck') && c.departments.includes('Engine')) score += 10;
  score += Math.min(24, (c.needTags || []).length * 6);
  if (c.duration >= 10 && c.duration <= 70) score += 6;
  return score;
}}
function findCourseHeader(rows) {{
  const rowIndex = rows.findIndex(row => row.some(cell => /Ocean product number/i.test(String(cell))) && row.some(cell => /^Title$/i.test(String(cell).trim())));
  const header = rows[rowIndex] || [];
  const find = regex => header.findIndex(cell => regex.test(String(cell || '').replace(/\\s+/g, ' ').trim()));
  return {{
    rowIndex,
    cols: {{
      no: find(/Ocean product number/i),
      title: find(/^Title$/i),
      lead: find(/Lead Module Flag/i),
      leadModule: find(/^Lead Module$/i),
      silver: find(/Silver/i),
      gold: find(/Gold/i),
      diamond: find(/Diamond/i),
      productType: find(/Product type/i),
      sourceCategory: find(/^Category$/i),
      duration: find(/Duration/i),
      audio: find(/Audio/i),
      text: find(/Text\\/subtitles|subtitles/i),
      ship: find(/Ship type/i),
      target: find(/STCW/i),
      department: find(/Department/i),
      moduleVersion: find(/Module version/i),
      versionInfo: find(/Version info/i),
      releaseQuarter: find(/Release date/i),
      productNumbers: find(/Product Number\\(s\\)/i),
      series: find(/Name\\(s\\)/i)
    }}
  }};
}}
function cellByCol(row, cols, key, fallback='') {{
  const idx = cols[key];
  return idx >= 0 ? row[idx] : fallback;
}}
function courseFromImportedRow(row, idx, cols) {{
  const no = normalizeNo(cellByCol(row, cols, 'no'));
  const title = String(cellByCol(row, cols, 'title') || '').trim();
  if (!no && !title) return null;
  const shipTypes = splitList(cellByCol(row, cols, 'ship'));
  const departments = splitList(cellByCol(row, cols, 'department'));
  const targets = splitList(cellByCol(row, cols, 'target')).map(p => ['Management','Operational','Support'].includes(p) ? p.replace(' ', '') : p);
  const sourceCategory = String(cellByCol(row, cols, 'sourceCategory') || '').trim();
  const series = String(cellByCol(row, cols, 'series') || '').trim();
  const category = inferCategory(title, sourceCategory, shipTypes, departments, series);
  const course = {{
    id: idx,
    availability: '',
    no,
    title,
    lead: String(cellByCol(row, cols, 'lead') || '').trim() === '1',
    leadModule: String(cellByCol(row, cols, 'leadModule') || '').trim(),
    silver: parseBoolX(cellByCol(row, cols, 'silver')),
    gold: parseBoolX(cellByCol(row, cols, 'gold')),
    diamond: parseBoolX(cellByCol(row, cols, 'diamond')),
    productType: String(cellByCol(row, cols, 'productType') || '').trim(),
    sourceCategory,
    category,
    duration: Number.parseInt(String(cellByCol(row, cols, 'duration') || '0'), 10) || 0,
    audioLangs: splitList(cellByCol(row, cols, 'audio')),
    textLangs: splitList(cellByCol(row, cols, 'text')),
    shipTypes,
    targets,
    departments,
    moduleVersion: String(cellByCol(row, cols, 'moduleVersion') || '').trim(),
    versionInfo: String(cellByCol(row, cols, 'versionInfo') || '').trim(),
    releaseQuarter: String(cellByCol(row, cols, 'releaseQuarter') || '').trim(),
    releaseQuarterSort: 0,
    productNumbers: String(cellByCol(row, cols, 'productNumbers') || '').trim(),
    series,
    needTags: inferNeedTags(`${{title}} ${{sourceCategory}} ${{series}}`, category)
  }};
  course.score = scoreImportedCourse(course);
  course.reason = [course.gold ? 'Ocean Gold 原建議' : '', course.lead ? '主課程' : '', course.shipTypes.includes('Generic') ? '通用船型' : '', course.needTags.length ? '覆蓋：' + course.needTags.slice(0,3).join('、') : ''].filter(Boolean).join('；') || '按導入題庫欄位匹配';
  return course;
}}
async function importLatestCourseBank(file) {{
  const workbook = await readWorkbookFile(file);
  const rows = sheetRows(workbook, 'Library Selector 5.x');
  const headerInfo = findCourseHeader(rows);
  if (headerInfo.rowIndex < 0) throw new Error('找不到 Ocean 題庫表頭，請確認是 Library Selector 題庫文件');
  const imported = rows.slice(headerInfo.rowIndex + 1).map((row, idx) => courseFromImportedRow(row, idx + headerInfo.rowIndex + 2, headerInfo.cols)).filter(Boolean);
  if (!imported.length) throw new Error('沒有在題庫中讀到有效課程');
  COURSES = sortCourses(imported);
  SUMMARY = buildDynamicSummary(COURSES);
  rebuildCourseIndexes();
  resetPlanningToValidCourses();
  saveCourseBank();
  save();
  renderAll();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
  alert(`已導入最新題庫：${{COURSES.length}} 門課程。所有頁面已更新。`);
}}
async function importPlanExcel(file) {{
  const workbook = await readWorkbookFile(file);
  const allRows = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], {{ header: 1, raw: false, defval: '' }}));
  let start = allRows.findIndex(row => row.some(cell => String(cell).includes('年份')) && row.some(cell => String(cell).includes('課程編號')));
  if (start < 0) start = 0;
  const importedPlan = Object.fromEntries(YEARS.map(y => [y, []]));
  for (const row of allRows.slice(start + 1)) {{
    const year = String(row[0] || '').trim();
    if (!YEARS.includes(year)) continue;
    const no = normalizeNo(row[2] || row[1]);
    if (courseByNo.has(no) && !importedPlan[year].includes(no)) importedPlan[year].push(no);
  }}
  const total = YEARS.reduce((sum, y) => sum + importedPlan[y].length, 0);
  if (!total) throw new Error('沒有讀到可匹配的年度課程編號');
  YEARS.forEach(y => state.planning[y] = sortNos(importedPlan[y]).slice(0, TARGET_LIMIT));
  state.selected = new Set(state.planning[state.activeYear] || []);
  save();
  renderAll();
  if (document.getElementById('view-plan').classList.contains('active')) renderPlan();
  alert(`已導入長期規劃：共 ${{total}} 個年度課程位置。`);
}}
function yearUsagePenalty(year) {{
  const penalty = new Map();
  YEARS.forEach(y => {{
    if (y === year) return;
    (state.planning[y] || []).forEach(no => penalty.set(no, (penalty.get(no) || 0) + 1));
  }});
  return penalty;
}}
function replacementRateForYear(year) {{
  const idx = YEARS.indexOf(year);
  if (idx <= 0) return 0;
  const current = new Set(state.planning[year] || []);
  const prev = new Set(state.planning[YEARS[idx - 1]] || []);
  if (!current.size) return 0;
  let changed = 0;
  current.forEach(no => {{ if (!prev.has(no)) changed += 1; }});
  return pct(changed, current.size);
}}

function renderOverview() {{
  const el = document.getElementById('view-overview');
  el.innerHTML = `
    <div class="grid cols-4">
      <div class="panel metric"><div class="label">有效課程資料</div><div class="value">${{SUMMARY.effectiveRows}}</div><div class="note">按有課程編號或標題的行計算。</div></div>
      <div class="panel metric"><div class="label">主課程 Lead Module</div><div class="value">${{SUMMARY.leadCourses}}</div><div class="note">推薦預設優先選主課程，避免子模組佔用年度名額。</div></div>
      <div class="panel metric"><div class="label">Ocean Gold 原建議</div><div class="value">${{SUMMARY.goldSuggestion}}</div><div class="note">可作基準，但本工具會按船隊覆蓋面重新平衡。</div></div>
      <div class="panel metric"><div class="label">已選年度名額</div><div class="value"><span data-selected-count>${{state.selected.size}}</span> / <span data-target-limit>${{TARGET_LIMIT}}</span></div><div class="progress"><span data-selected-progress style="width:${{pct(state.selected.size, TARGET_LIMIT)}}%"></span></div><div class="note">超過設定名額會保留，但作紅色提醒。</div></div>
    </div>
    <div class="split" style="margin-top:16px">
      <div class="panel pad advice">
        <div class="section-title"><h2>選課策略建議</h2><div class="toolbar" style="margin:0"><button class="btn" id="importCourseBank">導入最新題庫</button><button class="btn primary" id="useDefault75">套用平衡推薦 <span data-target-limit>${{TARGET_LIMIT}}</span> 門</button><input id="courseBankFile" type="file" accept=".xlsx,.xls" hidden></div></div>
        <div class="field" style="max-width:360px"><label class="title">年度課程名額</label><div style="display:flex; gap:8px"><input id="targetLimitInput" type="number" min="1" max="500" value="${{TARGET_LIMIT}}"><button class="btn" id="applyTargetLimit">套用</button></div></div>
        <p>這份年度課程包應該定位成「廣泛、基礎、可被 TMSA/公司審核解釋」的船隊共同訓練包，而不是把所有專業課一次塞滿。PSC 實務上很少逐門查 CBT，但 TMSA、內審、油公司審核會關心培訓矩陣、風險識別和持續改進。</p>
        <p>建議把課程分成三層：固定核心約 45 門，覆蓋全員安全、應急、MLC、保安、環境、人因；船型與部門專項約 20 門，照顧油化氣、散貨、甲板、機艙、電氣與餐飲；年度輪換約 10 門，配合事故趨勢、新燃料、檢查缺陷和公司當年重點。</p>
      </div>
      <div class="panel pad" id="selectionSummary"></div>
    </div>`;
  const targetInput = document.getElementById('targetLimitInput');
  const applyTargetLimit = () => setTargetLimit(targetInput.value);
  targetInput.onchange = applyTargetLimit;
  targetInput.onkeydown = e => {{ if (e.key === 'Enter') {{ e.preventDefault(); applyTargetLimit(); }} }};
  document.getElementById('applyTargetLimit').onclick = applyTargetLimit;
  document.getElementById('useDefault75').onclick = () => {{
    const cfg = {{ needs: new Set(Object.keys(NEED_META)), ships: new Set(['Generic','Oil tanker','Chemical tanker','Gas Tanker','Bulk/Ore carrier']), departments: new Set(['Deck','Engine','Electric']), targets: new Set(['Management','Operational','Support']), leadOnly: true, count: TARGET_LIMIT }};
    addMany(recommendCourses(cfg, new Map()));
  }};
  document.getElementById('importCourseBank').onclick = () => document.getElementById('courseBankFile').click();
  document.getElementById('courseBankFile').onchange = async e => {{
    const file = e.target.files?.[0];
    if (!file) return;
    try {{ await importLatestCourseBank(file); }}
    catch (err) {{ alert('導入題庫失敗：' + err.message); }}
    e.target.value = '';
  }};
  renderSelectionSummary();
}}

function renderSelectionSummary() {{
  const el = document.getElementById('selectionSummary');
  if (!el) return;
  const courses = selectedCourses();
  const m = selectedMetrics(courses);
  const cats = Counter(courses.map(c => c.category));
  el.innerHTML = `
    <div class="section-title"><h2>已選統計</h2><button class="btn danger" id="clearSelected">清空</button></div>
    <div class="bar-row"><span>名額使用</span><strong>${{courses.length}} / ${{TARGET_LIMIT}}</strong></div><div class="progress"><span style="width:${{Math.min(100,pct(courses.length,TARGET_LIMIT))}}%"></span></div>
    <div class="bar-row"><span>需求覆蓋</span><strong>${{m.needs.size}} / ${{Object.keys(NEED_META).length}}</strong></div><div class="progress"><span style="width:${{pct(m.needs.size,Object.keys(NEED_META).length)}}%"></span></div>
    <div class="bar-row"><span>部門覆蓋</span><strong>${{m.depts.size}}</strong></div><div class="progress"><span style="width:${{Math.min(100,m.depts.size*22)}}%"></span></div>
    <div class="bar-row"><span>船型覆蓋</span><strong>${{m.ships.size}}</strong></div><div class="progress"><span style="width:${{Math.min(100,m.ships.size*8)}}%"></span></div>
    <h3 style="margin-top:16px">主要分類</h3>
    <div class="summary-list">${{cats.slice(0,8).map(([k,v]) => `<div class="summary-item"><span>${{escapeHtml(k)}}</span><strong>${{v}}</strong></div>`).join('') || '<div class="muted">尚未選擇課程</div>'}}</div>
  `;
  document.getElementById('clearSelected')?.addEventListener('click', clearSelected);
}}
function Counter(items) {{
  const map = new Map();
  items.forEach(x => map.set(x || '未標示', (map.get(x || '未標示') || 0) + 1));
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}}

function dashboardBasis(courses = state.latestRecommended) {{
  return state.selected.size ? selectedCourses() : (courses && courses.length ? courses : COURSES.filter(c => default75.has(c.no)));
}}
function renderDashboardMetrics(courses = state.latestRecommended) {{
  const el = document.getElementById('recommendMetrics');
  if (!el) return;
  const basis = dashboardBasis(courses);
  const m = selectedMetrics(basis);
  const coverage = Math.max(pct(m.needs.size, Object.keys(NEED_META).length), pct(m.categories.size, Object.keys(CATEGORY_META).length));
  const changeRate = replacementRateForYear(state.activeYear);
  el.innerHTML = `
    <div class="panel metric">
      <div class="metric-icon">✓</div>
      <div><div class="label"><span data-active-year>${{state.activeYear}}</span> 已選</div><div class="value teal"><span data-selected-count>${{state.selected.size}}</span> / <span data-target-limit>${{TARGET_LIMIT}}</span></div><div class="note">當前年份課程名額</div></div>
    </div>
    <div class="panel metric">
      <div class="metric-icon">□</div>
      <div><div class="label">有效課程</div><div class="value">${{SUMMARY.effectiveRows}}</div><div class="note">可用課程總數</div></div>
    </div>
    <div class="panel metric">
      <div class="metric-icon">◇</div>
      <div><div class="label">覆蓋率</div><div class="value teal">${{coverage}}%</div><div class="progress"><span style="width:${{coverage}}%"></span></div><div class="note">目標 90% 以上</div></div>
    </div>
    <div class="panel metric">
      <div class="metric-icon">↻</div>
      <div><div class="label">年度更換</div><div class="value amber">${{changeRate}}%</div><div class="progress"><span style="width:${{Math.min(100, changeRate)}}%; background: var(--amber)"></span></div><div class="note">${{state.activeYear === YEARS[0] ? '基準年' : '相對上一年實際計算'}}</div></div>
    </div>`;
}}

function renderRecommendPlanPreview(courses = state.latestRecommended) {{
  const el = document.getElementById('recommendPlanPreview');
  if (!el) return;
  const rows = dashboardBasis(courses).slice(0, 5);
  el.innerHTML = `
    <div class="section-title">
      <h2>長期課程規劃概覽 <span class="muted small">年度更換與輪替計畫</span></h2>
      <div class="toolbar"><span class="status-pill">預覽課程：${{rows.length}} 筆</span><button class="btn" data-jump-plan>檢視完整規劃</button></div>
    </div>
    <div class="table-wrap" style="max-height:260px">
      <table>
        <thead><tr><th style="width:130px">課程編號</th><th>課程標題</th>${{YEARS.map((y, idx) => `<th>第 ${{idx+1}} 年<br>${{y}}</th>`).join('')}}<th>狀態</th></tr></thead>
        <tbody>${{rows.map((c, idx) => `<tr><td><strong>${{c.no}}</strong></td><td>${{escapeHtml(c.title)}}</td>${{YEARS.map((y, yidx) => `<td><span class="year-band ${{(idx+yidx)%4===0?'change':'keep'}}">${{(idx+yidx)%4===0?'更換':'保留'}}</span></td>`).join('')}}<td>${{chip('已排程','teal')}}</td></tr>`).join('')}}</tbody>
      </table>
    </div>`;
  el.querySelector('[data-jump-plan]')?.addEventListener('click', () => {{
    document.querySelector('[data-tab="plan"]').click();
  }});
}}

function courseScore(c, cfg = state.recommend, usedPenalty = new Map()) {{
  let score = c.score || 0;
  if (cfg.leadOnly && !c.lead) score -= 60;
  for (const need of c.needTags) if (cfg.needs.has(need)) score += 24;
  if (hasAny(c.shipTypes, cfg.ships)) score += 18;
  if (c.shipTypes.includes('Generic')) score += 10;
  if (hasAny(c.departments, cfg.departments)) score += 15;
  if (hasAny(c.targets, cfg.targets)) score += 10;
  score -= (usedPenalty.get(c.no) || 0) * 22;
  return score;
}}
function passesRecommendationFilters(c, cfg) {{
  if (cfg.needs.size && cfg.needs.size !== Object.keys(NEED_META).length && !hasAny(c.needTags, cfg.needs)) return false;
  if (cfg.ships.size && c.shipTypes.length && !c.shipTypes.includes('Generic') && !hasAny(c.shipTypes, cfg.ships)) return false;
  if (cfg.departments.size && c.departments.length && !hasAny(c.departments, cfg.departments)) return false;
  if (cfg.targets.size && c.targets.length && !hasAny(c.targets, cfg.targets)) return false;
  return true;
}}
function hasActiveRecommendFilters(cfg) {{
  return cfg.leadOnly || cfg.needs.size || cfg.ships.size || cfg.departments.size || cfg.targets.size;
}}
const RECOMMEND_MODES = {{
  balanced: {{ label: '全船隊平衡覆蓋', needs: Object.keys(NEED_META), ships: ['Generic','Oil tanker','Chemical tanker','Gas Tanker','Bulk/Ore carrier'], departments: ['Deck','Engine','Electric'], targets: ['Management','Operational','Support'], leadOnly: true }},
  safety: {{ label: '全員安全與應急', needs: ['全員基礎安全','應急程序','安全作業程序'], ships: ['Generic'], departments: ['Deck','Engine','Electric','Catering'], targets: ['Management','Operational','Support'], leadOnly: true }},
  tmsa: {{ label: 'TMSA / 合規檢查', needs: ['TMSA與合規','安全作業程序','環境與新燃料','保安與網絡'], ships: ['Generic','Oil tanker','Chemical tanker','Gas Tanker'], departments: ['Deck','Engine','Electric'], targets: ['Management','Operational'], leadOnly: true }},
  shipType: {{ label: '船型與貨物專項', needs: ['職務專業','安全作業程序','環境與新燃料'], ships: ['Oil tanker','Chemical tanker','Gas Tanker','Bulk/Ore carrier','Container vessel'], departments: ['Deck','Engine'], targets: ['Management','Operational'], leadOnly: true }},
  crewGrowth: {{ label: '英語 / MLC / 人因', needs: ['海事英語','MLC權利義務','職務專業','全員基礎安全'], ships: ['Generic'], departments: ['Deck','Engine','Catering'], targets: ['Management','Operational','Support'], leadOnly: true }}
}};
function applyRecommendMode(mode) {{
  const cfg = RECOMMEND_MODES[mode] || RECOMMEND_MODES.balanced;
  state.recommendMode = mode;
  state.recommend.needs = new Set(cfg.needs);
  state.recommend.ships = new Set(cfg.ships);
  state.recommend.departments = new Set(cfg.departments);
  state.recommend.targets = new Set(cfg.targets);
  state.recommend.leadOnly = cfg.leadOnly;
  state.recommend.count = TARGET_LIMIT;
  state.guided.active = false;
  save();
  renderRecommend();
}}
function recommendCourses(cfg = state.recommend, usedPenalty = new Map()) {{
  const count = Math.max(1, Math.min(500, Number(cfg.count) || TARGET_LIMIT));
  const strictFilters = hasActiveRecommendFilters(cfg);
  const ranked = COURSES
    .map(c => ({{ c, dynamicScore: courseScore(c, cfg, usedPenalty) }}))
    .filter(x => !cfg.leadOnly || x.c.lead)
    .filter(x => !strictFilters || passesRecommendationFilters(x.c, cfg))
    .sort((a,b) => b.dynamicScore - a.dynamicScore || (a.c.no.localeCompare(b.c.no, undefined, {{numeric:true}})));
  const picked = [];
  const pickedNos = new Set();
  const seenTitle = new Set();
  const take = (pool, allowTitleDupes=false) => {{
    for (const item of pool) {{
      if (pickedNos.has(item.c.no)) continue;
      const key = item.c.title.toLowerCase().replace(/[^a-z0-9]+/g,'');
      if (!allowTitleDupes && seenTitle.has(key) && picked.length < count - 5) continue;
      picked.push({{...item.c, dynamicScore: Math.round(item.dynamicScore)}});
      pickedNos.add(item.c.no);
      seenTitle.add(key);
      if (picked.length >= count) break;
    }}
  }};
  take(ranked);
  if (picked.length < count) take(ranked, true);
  return picked;
}}
function guidedFieldLabel(field) {{
  return {{ needTags: '學習方向', shipTypes: '船型覆蓋', departments: '部門', targets: '職級/對象' }}[field] || '分類';
}}
function guidedValues(field) {{
  if (field === 'needTags') return Object.keys(NEED_META);
  return valuesFor(field).filter(x => x !== '未標示');
}}
function courseMatchesGuided(c, field, values) {{
  const selected = values && values.length ? values : [];
  if (!selected.length) return false;
  const data = c[field];
  return Array.isArray(data) ? data.some(v => selected.includes(v)) : selected.includes(data);
}}
function guidedValueChecks(field, current=[]) {{
  const values = guidedValues(field);
  const selected = current && current.length ? current : (values[0] ? [values[0]] : []);
  state.guided.values = selected;
  return values.map(v => `<label class="check"><input type="checkbox" data-guided-value="${{escapeHtml(v)}}" ${{selected.includes(v)?'checked':''}}> ${{escapeHtml(v)}}</label>`).join('');
}}
function runGuidedSelection(showStatus=false) {{
  state.showingSelected = false;
  markShowSelectedButton(false);
  const field = state.guided.field;
  const values = state.guided.values && state.guided.values.length ? state.guided.values : guidedValues(field).slice(0,1);
  state.guided.values = values;
  state.guided.active = true;
  const selected = selectedCourses();
  const selectedNos = new Set(selected.map(c => c.no));
  const matching = COURSES
    .filter(c => courseMatchesGuided(c, field, values) && !selectedNos.has(c.no))
    .sort((a,b) => (b.score || 0) - (a.score || 0) || compareCourse(a,b));
  state.latestRecommended = [...sortCourses(selected), ...matching];
  const found = document.getElementById('recommendFound');
  if (found) found.textContent = state.latestRecommended.length;
  renderCourseTable('recommendTable', state.latestRecommended, {{showScore:true, compactNo:true, maxRows: state.latestRecommended.length || 1}});
  renderCoverage('recommendCoverage', state.latestRecommended, `${{guidedFieldLabel(field)}}：${{values.join('、')}}`);
  renderDashboardMetrics(state.latestRecommended);
  if (showStatus) {{
    const status = document.getElementById('recommendStatus');
    if (status) {{
      status.textContent = `已顯示「${{guidedFieldLabel(field)}}：${{values.join('、')}}」課程，已選課程置頂保留`;
      status.classList.add('show');
      window.setTimeout(() => status.classList.remove('show'), 1600);
    }}
  }}
}}
function markShowSelectedButton(active) {{
  const btn = document.getElementById('showSelectedCourses');
  if (!btn) return;
  btn.classList.toggle('primary', !!active);
  btn.textContent = active ? '返回推薦清單' : '顯示已選課程';
}}
function restoreRecommendList() {{
  state.showingSelected = false;
  markShowSelectedButton(false);
  if (state.previousRecommended && state.previousRecommended.length) {{
    state.latestRecommended = state.previousRecommended.slice();
    state.guided.active = !!state.previousGuidedActive;
  }} else {{
    state.latestRecommended = recommendCourses(state.recommend, yearUsagePenalty(state.activeYear));
    state.guided.active = false;
  }}
  const found = document.getElementById('recommendFound');
  if (found) found.textContent = state.latestRecommended.length;
  renderCourseTable('recommendTable', state.latestRecommended, {{showScore:true, compactNo:true, maxRows: state.guided.active ? Math.max(1, state.latestRecommended.length) : TARGET_LIMIT}});
  renderCoverage('recommendCoverage', state.latestRecommended, state.guided.active ? '自主選課清單' : '推薦覆蓋');
  renderDashboardMetrics(state.latestRecommended);
}}
function showSelectedInRecommend() {{
  if (state.showingSelected) {{
    restoreRecommendList();
    return;
  }}
  state.previousRecommended = state.latestRecommended.slice();
  state.previousGuidedActive = !!state.guided.active;
  state.showingSelected = true;
  markShowSelectedButton(true);
  state.guided.active = false;
  state.latestRecommended = selectedCourses();
  const found = document.getElementById('recommendFound');
  if (found) found.textContent = state.latestRecommended.length;
  renderCourseTable('recommendTable', state.latestRecommended, {{showScore:true, compactNo:true, maxRows: Math.max(1, state.latestRecommended.length)}});
  renderCoverage('recommendCoverage', state.latestRecommended, '已選課程');
  renderDashboardMetrics(state.latestRecommended);
  const status = document.getElementById('recommendStatus');
  if (status) {{
    status.textContent = `正在顯示 ${{state.latestRecommended.length}} 門已選課程`;
    status.classList.add('show');
    window.setTimeout(() => status.classList.remove('show'), 1600);
  }}
}}

function renderRecommend() {{
  const el = document.getElementById('view-recommend');
  const needChecks = Object.keys(NEED_META).map(n => `<label class="check"><input type="checkbox" data-rneed="${{n}}" ${{state.recommend.needs.has(n)?'checked':''}}> ${{n}}</label>`).join('');
  const shipChecks = valuesFor('shipTypes').filter(x => x !== '未標示').slice(0,26).map(n => `<label class="check"><input type="checkbox" data-rship="${{n}}" ${{state.recommend.ships.has(n)?'checked':''}}> ${{n}}</label>`).join('');
  const deptChecks = valuesFor('departments').filter(x => x !== '未標示').map(n => `<label class="check"><input type="checkbox" data-rdept="${{n}}" ${{state.recommend.departments.has(n)?'checked':''}}> ${{n}}</label>`).join('');
  const targetChecks = valuesFor('targets').filter(x => x !== '未標示').map(n => `<label class="check"><input type="checkbox" data-rtarget="${{n}}" ${{state.recommend.targets.has(n)?'checked':''}}> ${{n}}</label>`).join('');
  const modeOptions = Object.entries(RECOMMEND_MODES).map(([key, cfg]) => `<option value="${{key}}" ${{state.recommendMode===key?'selected':''}}>${{cfg.label}}</option>`).join('');
  const guidedFieldOptions = ['needTags','shipTypes','departments','targets'].map(f => `<option value="${{f}}" ${{state.guided.field===f?'selected':''}}>${{guidedFieldLabel(f)}}</option>`).join('');
  el.innerHTML = `
    <div id="recommendMetrics" class="dashboard-metrics"></div>
    <div class="layout-3">
      <aside class="panel pad filters">
        <div class="section-title"><h2>篩選條件</h2><div class="toolbar" style="margin:0"><button class="btn" id="resetRecommend">重置</button><button class="btn danger" id="clearRecommendAll">一鍵清空</button></div></div>
        <div class="help-text">勾選條件會先更新中間的推薦清單；只有按「套用為本年度課程」後，才會真正覆蓋當前年份已選課程。</div>
        <div class="field"><label class="title">智能推薦角度</label><select id="recommendMode">${{modeOptions}}</select></div>
        <button class="btn primary" id="applyRecommendMode" style="width:100%; margin-bottom:12px">按此角度生成推薦</button>
        <div class="field"><label class="title">選課年份</label><select id="recYear">${{yearOptions()}}</select></div>
        <label class="check"><input id="recLeadOnly" type="checkbox" ${{state.recommend.leadOnly?'checked':''}}> 只推薦主課程</label>
        <div class="field"><label class="title">學習方向</label><div class="check-list">${{needChecks}}</div></div>
        <div class="field"><label class="title">船型覆蓋</label><div class="check-list">${{shipChecks}}</div></div>
        <div class="field"><label class="title">部門</label><div class="check-list">${{deptChecks}}</div></div>
        <div class="field"><label class="title">職級/對象</label><div class="check-list">${{targetChecks}}</div></div>
        <div class="help-box">自主選課：選一個或多個分類值後，中間會先顯示已選課程，下面再列出該分類下尚未選的課程，可逐步補滿設定名額。</div>
        <div class="field"><label class="title">自主選課分類</label><select id="guidedField">${{guidedFieldOptions}}</select></div>
        <div class="field"><label class="title">分類值（可多選）</label><div class="check-list" id="guidedValueList">${{guidedValueChecks(state.guided.field, state.guided.values)}}</div></div>
        <button class="btn" id="showGuidedCourses" style="width:100%">顯示此分類課程</button>
        <div class="help-box">「重新計算推薦」只重新排序和刷新清單；不會改變已選課程。確認清單合適後，再按中間上方的套用按鈕。</div>
        <button class="btn primary" id="runRecommend" style="width:100%">重新計算推薦</button>
        <div id="recommendStatus" class="status-flash" style="margin-top:8px">已重新計算，尚未套用到年度清單</div>
      </aside>
      <section class="recommend-shell">
        <div class="section-title">
          <div><h2>智能推薦課程 <span class="muted small">找到 <span id="recommendFound">${{TARGET_LIMIT}}</span> 筆課程</span></h2></div>
          <div class="toolbar"><span class="status-pill">排序：推薦優先</span><button class="btn" id="showSelectedCourses">顯示已選課程</button><button class="btn primary" id="selectRecommended">套用為 <span data-active-year>${{state.activeYear}}</span> 年度 <span data-target-limit>${{TARGET_LIMIT}}</span> 門課程</button><button class="btn" id="copyRecommended">複製推薦編號</button></div>
        </div>
        <div id="recommendTable"></div>
      </section>
      <aside class="panel pad" id="recommendCoverage"></aside>
    </div>
    `;
  document.getElementById('recYear').onchange = e => setActiveYear(e.target.value);
  document.getElementById('recommendMode').onchange = e => {{ state.recommendMode = e.target.value; save(); }};
  document.getElementById('applyRecommendMode').onclick = () => applyRecommendMode(document.getElementById('recommendMode').value);
  document.getElementById('guidedField').onchange = e => {{
    state.guided.field = e.target.value;
    state.guided.values = guidedValues(state.guided.field).slice(0,1);
    renderRecommend();
  }};
  el.querySelectorAll('[data-guided-value]').forEach(input => input.onchange = () => {{
    state.guided.values = [...el.querySelectorAll('[data-guided-value]:checked')].map(x => x.dataset.guidedValue);
  }});
  document.getElementById('showGuidedCourses').onclick = () => {{
    state.guided.values = [...el.querySelectorAll('[data-guided-value]:checked')].map(x => x.dataset.guidedValue);
    runGuidedSelection(true);
  }};
  el.querySelectorAll('[data-rneed]').forEach(i => i.onchange = () => {{ syncCheckSet(i, state.recommend.needs, i.dataset.rneed); runRecommendation(); }});
  el.querySelectorAll('[data-rship]').forEach(i => i.onchange = () => {{ syncCheckSet(i, state.recommend.ships, i.dataset.rship); runRecommendation(); }});
  el.querySelectorAll('[data-rdept]').forEach(i => i.onchange = () => {{ syncCheckSet(i, state.recommend.departments, i.dataset.rdept); runRecommendation(); }});
  el.querySelectorAll('[data-rtarget]').forEach(i => i.onchange = () => {{ syncCheckSet(i, state.recommend.targets, i.dataset.rtarget); runRecommendation(); }});
  document.getElementById('recLeadOnly').onchange = e => {{ state.recommend.leadOnly = e.target.checked; runRecommendation(); }};
  document.getElementById('runRecommend').onclick = () => runRecommendation(true);
  document.getElementById('clearRecommendAll').onclick = clearRecommendAll;
  document.getElementById('resetRecommend').onclick = () => {{
    state.recommend.needs = new Set(Object.keys(NEED_META));
    state.recommend.ships = new Set(['Generic','Oil tanker','Chemical tanker','Gas Tanker','Bulk/Ore carrier']);
    state.recommend.departments = new Set(['Deck','Engine','Electric']);
    state.recommend.targets = new Set(['Management','Operational','Support']);
    state.recommend.leadOnly = true;
    state.recommend.count = TARGET_LIMIT;
    renderRecommend();
  }};
  document.getElementById('selectRecommended').onclick = () => addMany(state.latestRecommended);
  document.getElementById('showSelectedCourses').onclick = showSelectedInRecommend;
  document.getElementById('copyRecommended').onclick = () => {{
    navigator.clipboard?.writeText(state.latestRecommended.map(c => c.no).join('\\n'));
    alert('已複製推薦課程編號');
  }};
  runRecommendation();
}}
function syncCheckSet(input, set, value) {{ input.checked ? set.add(value) : set.delete(value); }}
function runRecommendation(showStatus = false) {{
  state.showingSelected = false;
  markShowSelectedButton(false);
  state.guided.active = false;
  state.recommend.count = TARGET_LIMIT;
  state.latestRecommended = recommendCourses(state.recommend, yearUsagePenalty(state.activeYear));
  const found = document.getElementById('recommendFound');
  if (found) found.textContent = state.latestRecommended.length;
  renderCourseTable('recommendTable', state.latestRecommended, {{showScore:true, compactNo:true, maxRows: TARGET_LIMIT}});
  renderCoverage('recommendCoverage', state.latestRecommended, '推薦覆蓋');
  renderDashboardMetrics(state.latestRecommended);
  if (showStatus) {{
    const status = document.getElementById('recommendStatus');
    if (status) {{
      status.textContent = '已重新計算，尚未套用到年度清單';
      status.classList.add('show');
      window.setTimeout(() => status.classList.remove('show'), 1300);
    }}
  }}
}}

function renderCoverage(id, courses, title) {{
  const el = document.getElementById(id);
  if (!el) return;
  const basis = dashboardBasis(courses);
  const m = selectedMetrics(basis);
  const cats = Counter(courses.map(c => c.category));
  const shipCov = Math.min(100, Math.max(70, pct(m.ships.size, 8)));
  const deptCov = Math.min(100, Math.max(70, pct(m.depts.size, 4)));
  const targetCov = Math.min(100, Math.max(70, pct(m.targets.size, 4)));
  const needCov = pct(m.needs.size, Object.keys(NEED_META).length);
  const changeRate = replacementRateForYear(state.activeYear);
  el.innerHTML = `
    <div class="summary-hero">
      <h2>選課摘要</h2>
      <div class="small muted">已選課程</div>
      <div class="big"><strong><span data-selected-count>${{state.selected.size}}</span> / <span data-target-limit>${{TARGET_LIMIT}}</span></strong><span class="okmark">✓</span></div>
      <div class="summary-item"><span>總時長</span><strong>${{Math.round(basis.reduce((s,c)=>s+(c.duration||0),0)/60)}} 小時 ${{basis.reduce((s,c)=>s+(c.duration||0),0)%60}} 分鐘</strong></div>
    </div>
    <h2>覆蓋率分析</h2>
    <div class="bar-row"><span>船型覆蓋</span><strong>${{shipCov}}%</strong></div><div class="progress"><span style="width:${{shipCov}}%"></span></div>
    <div class="bar-row"><span>部門覆蓋</span><strong>${{deptCov}}%</strong></div><div class="progress"><span style="width:${{deptCov}}%"></span></div>
    <div class="bar-row"><span>職級覆蓋</span><strong>${{targetCov}}%</strong></div><div class="progress"><span style="width:${{targetCov}}%; background: var(--amber)"></span></div>
    <div class="bar-row"><span>主題覆蓋</span><strong>${{needCov}}%</strong></div><div class="progress"><span style="width:${{needCov}}%"></span></div>
    <h2 style="margin-top:18px">年度更換率指標</h2>
    <div class="value amber" style="font-size:30px;font-weight:800">${{changeRate}}%</div>
    <div class="muted small">${{state.activeYear === YEARS[0] ? '基準年，無上一年對比' : '相對上一年實際計算；建議範圍 25% - 35%'}}</div>
    <h3 style="margin-top:16px">主要分類</h3>
    ${{cats.slice(0,6).map(([k,v]) => `<div class="bar-row"><span>${{escapeHtml(k)}}</span><strong>${{v}}</strong></div><div class="progress"><span style="width:${{pct(v,courses.length)}}%"></span></div>`).join('')}}
  `;
}}

function renderLibrary() {{
  const el = document.getElementById('view-library');
  el.innerHTML = `
    <div class="layout-3">
      <aside class="panel pad filters">
        <h2>課程篩選</h2>
        <div class="field"><label class="title">選課年份</label><select id="libYear">${{yearOptions()}}</select></div>
        <div class="field"><label class="title">搜尋</label><input id="libQuery" type="text" value="${{escapeHtml(state.filters.query)}}" placeholder="課程編號、標題、系列"></div>
        <div class="field"><label class="title">管理分類</label><select id="libCategory">${{optionList(Object.keys(CATEGORY_META), state.filters.category)}}</select></div>
        <div class="field"><label class="title">船型</label><select id="libShip">${{optionList(valuesFor('shipTypes'), state.filters.ship)}}</select></div>
        <div class="field"><label class="title">部門</label><select id="libDepartment">${{optionList(valuesFor('departments'), state.filters.department)}}</select></div>
        <div class="field"><label class="title">職級/對象</label><select id="libTarget">${{optionList(valuesFor('targets'), state.filters.target)}}</select></div>
        <div class="field"><label class="title">需求標籤</label><select id="libNeed">${{optionList(Object.keys(NEED_META), state.filters.need)}}</select></div>
        <label class="check"><input id="libLeadOnly" type="checkbox" ${{state.filters.leadOnly?'checked':''}}> 只看主課程</label>
      </aside>
      <section class="panel pad" style="grid-column: span 2">
        <div class="section-title"><h2>全部課程庫 <span class="muted small">正在編輯 <span data-active-year>${{state.activeYear}}</span> 年</span></h2><div class="toolbar"><button class="btn danger" id="clearLibraryYear">清空本年課程</button><span class="status-pill"><strong id="libraryCount">0</strong> 筆符合</span></div></div>
        <div id="libraryTable"></div>
      </section>
    </div>`;
  document.getElementById('libYear').onchange = e => setActiveYear(e.target.value);
  document.getElementById('clearLibraryYear').onclick = clearActiveYear;
  ['Query','Category','Ship','Department','Target','Need'].forEach(name => {{
    const id = 'lib' + name;
    document.getElementById(id).oninput = e => {{ state.filters[name.toLowerCase()] = e.target.value; updateLibraryTable(); }};
  }});
  document.getElementById('libLeadOnly').onchange = e => {{ state.filters.leadOnly = e.target.checked; updateLibraryTable(); }};
  updateLibraryTable();
}}
function filteredCourses() {{
  const f = state.filters;
  const q = f.query.trim().toLowerCase();
  return COURSES.filter(c => {{
    if (f.leadOnly && !c.lead) return false;
    if (f.category !== '全部' && c.category !== f.category) return false;
    if (f.ship !== '全部' && !c.shipTypes.includes(f.ship)) return false;
    if (f.department !== '全部' && !c.departments.includes(f.department)) return false;
    if (f.target !== '全部' && !c.targets.includes(f.target)) return false;
    if (f.need !== '全部' && !c.needTags.includes(f.need)) return false;
    if (q && !(c.no + ' ' + c.title + ' ' + c.series + ' ' + c.category).toLowerCase().includes(q)) return false;
    return true;
  }});
}}
function updateLibraryTable() {{
  const courses = filteredCourses();
  document.getElementById('libraryCount').textContent = courses.length;
  renderCourseTable('libraryTable', courses, {{showScore:false, maxRows:Math.max(1, courses.length)}});
}}

function renderCourseTable(targetId, courses, opts={{}}) {{
  const el = document.getElementById(targetId);
  const max = opts.maxRows || 260;
  const shown = courses.slice(0, max);
  const compactNo = !!opts.compactNo;
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:42px">選</th><th style="width:96px">編號</th><th>課程</th><th style="width:150px">分類</th><th style="width:120px">船型</th><th style="width:110px">部門</th><th style="width:70px">分鐘</th>${{opts.showScore?'<th style="width:70px">分數</th>':''}}
        </tr></thead>
        <tbody>
        ${{shown.map(c => `<tr data-row-no="${{escapeHtml(c.no)}}" class="${{state.selected.has(c.no)?'selected-row':''}}">
          <td><input type="checkbox" data-select-no="${{escapeHtml(c.no)}}" ${{state.selected.has(c.no)?'checked':''}}></td>
          <td><strong class="${{compactNo ? 'plan-no' : ''}}">${{compactNo ? planNoHtml(c.no) : escapeHtml(c.no)}}</strong><div class="small muted">${{c.lead?'主課程':'子模組'}}</div></td>
          <td><div class="course-title">${{escapeHtml(c.title)}}</div><div class="muted small">${{escapeHtml(c.reason || '')}}</div><div class="tagline">${{c.needTags.map(t => chip(t,'teal')).join('')}}${{c.gold?chip('Gold','amber'):''}}${{c.sourceCategory?chip(c.sourceCategory,'navy'):''}}</div></td>
          <td>${{escapeHtml(c.category)}}</td>
          <td>${{escapeHtml(c.shipTypes.join('、') || '未標示')}}</td>
          <td>${{escapeHtml(c.departments.join('、') || '未標示')}}</td>
          <td>${{c.duration || '-'}}</td>
          ${{opts.showScore?`<td><strong>${{c.dynamicScore ?? c.score}}</strong></td>`:''}}
        </tr>`).join('')}}
        </tbody>
      </table>
    </div>
    ${{courses.length > max ? `<div class="muted small" style="padding:10px">為保持頁面流暢，目前顯示前 ${{max}} 筆；請繼續使用篩選縮小範圍。</div>` : ''}}
  `;
  el.querySelectorAll('[data-select-no]').forEach(input => input.onchange = () => toggleSelect(input.dataset.selectNo, input.checked));
}}

function renderAnalysis() {{
  const el = document.getElementById('view-analysis');
  el.innerHTML = `
    <div class="grid cols-4">
      <div class="panel metric"><div class="label">產品類型</div><div class="value">${{SUMMARY.productTypes.length}}</div><div class="note">${{SUMMARY.productTypes.map(x=>x[0]+': '+x[1]).join('；')}}</div></div>
      <div class="panel metric"><div class="label">船型標籤</div><div class="value">${{SUMMARY.shipTypes.length}}</div><div class="note">Generic 最多，其次是客船、油氣化、散貨等專項。</div></div>
      <div class="panel metric"><div class="label">語言覆蓋</div><div class="value">${{SUMMARY.languagesAudio[0]?.[0] || 'English'}}</div><div class="note">多數課程以英語為主，部分支援中文音頻或字幕。</div></div>
      <div class="panel metric"><div class="label">原始 Category</div><div class="value">${{COURSES.filter(c=>c.sourceCategory).length}}</div><div class="note">其餘課程由本工具按關鍵欄位重新分類。</div></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      ${{Object.entries(CATEGORY_META).map(([cat, meta]) => {{
        const count = SUMMARY.categoryCounts.find(x=>x[0]===cat)?.[1] || 0;
        const lead = COURSES.filter(c=>c.category===cat && c.lead).length;
        return `<div class="category-card"><div class="section-title"><h3>${{cat}}</h3><span class="count">${{count}} 筆 / 主課程 ${{lead}}</span></div><p class="muted">${{meta.summary}}</p><p class="advice">${{meta.advice}}</p></div>`;
      }}).join('')}}
    </div>`;
}}

function generatePlan() {{
  const usage = new Map();
  const plan = {{}};
  save();
  YEARS.forEach((year, idx) => {{
    let pool;
    if ((state.planning[year] || []).length && year === state.activeYear) {{
      pool = selectedCoursesForYear(year).slice(0, TARGET_LIMIT);
    }} else if (idx === 0 && (state.planning[year] || []).length) {{
      pool = selectedCoursesForYear(year).slice(0, TARGET_LIMIT);
    }} else {{
      pool = recommendCourses(state.recommend, usage).slice(0, TARGET_LIMIT);
    }}
    plan[year] = sortCourses(pool).map(c => c.no);
    pool.forEach(c => usage.set(c.no, (usage.get(c.no)||0)+1));
  }});
  state.planning = plan;
  state.selected = new Set(state.planning[state.activeYear] || []);
  save();
  renderPlan();
}}
function planStats() {{
  const years = YEARS;
  const usage = Counter(years.flatMap(y => state.planning[y] || []));
  const unique = usage.length;
  const yearCounts = years.map(y => [y, (state.planning[y] || []).length]);
  return {{ years, usage, unique, yearCounts }};
}}
function planUniqueCourses() {{
  return [...new Set(YEARS.flatMap(y => state.planning[y] || []))].map(no => courseByNo.get(no)).filter(Boolean);
}}
function coverageRowsForPlan() {{
  const uniqueCourses = planUniqueCourses();
  const selectedByCat = Counter(uniqueCourses.map(c => c.category));
  return Object.keys(CATEGORY_META).map(cat => {{
    const total = COURSES.filter(c => c.category === cat).length;
    const selected = selectedByCat.find(x => x[0] === cat)?.[1] || 0;
    return {{ cat, selected, total, rate: pct(selected, total) }};
  }}).sort((a,b) => b.selected - a.selected || b.rate - a.rate);
}}
function sortCoverageRows(rows) {{
  const sorted = [...rows];
  if (state.coverageSort === 'rateAsc') return sorted.sort((a,b) => a.rate - b.rate || a.cat.localeCompare(b.cat));
  if (state.coverageSort === 'selectedDesc') return sorted.sort((a,b) => b.selected - a.selected || b.rate - a.rate);
  if (state.coverageSort === 'selectedAsc') return sorted.sort((a,b) => a.selected - b.selected || a.cat.localeCompare(b.cat));
  if (state.coverageSort === 'nameAsc') return sorted.sort((a,b) => a.cat.localeCompare(b.cat));
  return sorted.sort((a,b) => b.rate - a.rate || b.selected - a.selected);
}}
function escapeExcel(s) {{ return escapeHtml(s).replace(/\\n/g, '<br>'); }}
function exportPlanExcel() {{
  save();
  const summaryRows = YEARS.map(y => `<tr><td>${{y}}</td><td>${{(state.planning[y]||[]).length}}</td><td>${{replacementRateForYear(y)}}%</td></tr>`).join('');
  const coverageRows = sortCoverageRows(coverageRowsForPlan()).map(r => `<tr><td>${{escapeExcel(r.cat)}}</td><td class="num">${{r.selected}}</td><td class="num">${{r.total}}</td><td class="num">${{r.rate}}%</td></tr>`).join('');
  const courseRows = YEARS.flatMap(y => sortNos(state.planning[y] || []).map((no, idx) => {{
    const c = courseByNo.get(no);
    if (!c) return '';
    return `<tr><td class="year">${{y}}</td><td class="num">${{idx+1}}</td><td class="code">${{escapeExcel(c.no)}}</td><td class="title-cell">${{escapeExcel(c.title)}}</td><td>${{escapeExcel(c.category)}}</td><td>${{escapeExcel(c.shipTypes.join('、'))}}</td><td>${{escapeExcel(c.departments.join('、'))}}</td><td class="num">${{c.duration || ''}}</td></tr>`;
  }})).join('');
  const totalSlots = YEARS.reduce((sum, y) => sum + (state.planning[y] || []).length, 0);
  const uniqueSlots = new Set(YEARS.flatMap(y => state.planning[y] || [])).size;
  const plannedSlots = YEARS.length * TARGET_LIMIT;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body {{ font-family: "Microsoft JhengHei", Arial, sans-serif; color:#102033; }}
    .report-title {{ font-size:24px; font-weight:800; color:#0c3556; padding:12px 0 4px; }}
    .report-subtitle {{ color:#667589; padding:0 0 14px; }}
    .section-title-xls {{ font-size:16px; font-weight:800; color:#0c3556; background:#e9f3f7; border:1px solid #9fb6c6; padding:8px 10px; }}
    table {{ border-collapse:collapse; width:100%; margin-bottom:18px; table-layout:fixed; }}
    th {{ background:#0c3556; color:#fff; font-weight:700; border:1px solid #7890a3; padding:8px 9px; text-align:left; }}
    td {{ border:1px solid #c8d4df; padding:7px 9px; vertical-align:top; mso-number-format:"\\@"; }}
    .summary-table td {{ font-size:13px; }}
    .course-table td {{ font-size:12px; }}
    .course-table tr:nth-child(even) td, .coverage-table tr:nth-child(even) td {{ background:#eef7f5; }}
    .course-table tr:nth-child(odd) td, .coverage-table tr:nth-child(odd) td {{ background:#ffffff; }}
    .num {{ text-align:center; font-weight:700; }}
    .year {{ text-align:center; font-weight:700; color:#0c3556; background:#f3f7fa; }}
    .code {{ font-weight:700; color:#0c3556; text-align:center; }}
    .title-cell {{ font-weight:700; color:#102033; }}
    .note-cell {{ color:#5f6e7f; background:#fff8e8; border:1px solid #e4c887; padding:8px 10px; }}
    .w-year {{ width:70px; }} .w-seq {{ width:56px; }} .w-code {{ width:92px; }} .w-title {{ width:310px; }}
    .w-cat {{ width:210px; }} .w-ship {{ width:170px; }} .w-dept {{ width:130px; }} .w-min {{ width:65px; }}
  </style></head><body>
    <div class="report-title">CBT 長期課程規劃</div>
    <div class="report-subtitle">匯出日期：${{new Date().toISOString().slice(0,10)}}　規劃期間：${{YEARS[0]}}-${{YEARS[YEARS.length-1]}}　年度名額：${{totalSlots}} / ${{plannedSlots}}　不同課程：${{uniqueSlots}} 門</div>
    <div class="note-cell">說明：每個年份都是獨立的 ${{TARGET_LIMIT}} 門清單；更換率按相對上一年度實際課程差異計算。</div>
    <br>
    <div class="section-title-xls">年度摘要</div>
    <table class="summary-table"><colgroup><col class="w-year"><col class="w-seq"><col class="w-code"></colgroup><thead><tr><th>年份</th><th>課程數</th><th>相對上一年更換率</th></tr></thead><tbody>${{summaryRows}}</tbody></table>
    <div class="section-title-xls">分類覆蓋率</div>
    <table class="coverage-table"><colgroup><col class="w-title"><col class="w-code"><col class="w-code"><col class="w-code"></colgroup><thead><tr><th>分類</th><th>期間不重複已選</th><th>課程庫總數</th><th>覆蓋率</th></tr></thead><tbody>${{coverageRows}}</tbody></table>
    <div class="section-title-xls">完整課程清單</div>
    <table class="course-table"><colgroup><col class="w-year"><col class="w-seq"><col class="w-code"><col class="w-title"><col class="w-cat"><col class="w-ship"><col class="w-dept"><col class="w-min"></colgroup><thead><tr><th>年份</th><th>序號</th><th>課程編號</th><th>課程名稱</th><th>分類</th><th>船型</th><th>部門</th><th>分鐘</th></tr></thead><tbody>${{courseRows}}</tbody></table>
  </body></html>`;
  const blob = new Blob([html], {{type: 'application/vnd.ms-excel;charset=utf-8'}});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CBT長期課程規劃_${{YEARS[0]}}-${{YEARS[YEARS.length-1]}}_${{new Date().toISOString().slice(0,10)}}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}}
function renderPlan() {{
  const el = document.getElementById('view-plan');
  YEARS.forEach(y => {{ if (!state.planning[y]) state.planning[y] = []; }});
  const stats = planStats();
  const coverageRows = sortCoverageRows(coverageRowsForPlan());
  const uniqueCourses = planUniqueCourses();
  el.innerHTML = `
    <div class="split plan-layout">
      <section class="panel pad">
        <div class="section-title"><h2>長期課程規劃</h2><div class="plan-actions"><button class="btn primary" id="autoPlan">自動生成長期規劃</button><button class="btn" id="exportPlan">匯出 Excel</button><button class="btn" id="importPlan">導入 Excel</button><button class="btn" id="clearPlan">清空規劃</button><input id="planImportFile" type="file" accept=".xlsx,.xls" hidden></div></div>
        <div class="toolbar"><label class="muted small">開始年份</label><select id="planStart">${{allPlanYearOptions(YEARS[0])}}</select><label class="muted small">結束年份</label><select id="planEnd">${{allPlanYearOptions(YEARS[YEARS.length-1])}}</select><span class="status-pill">期間：${{YEARS.length}} 年 · 每年 <span data-target-limit>${{TARGET_LIMIT}}</span> 門</span></div>
        <div class="notice">每個年份都是獨立的 ${{TARGET_LIMIT}} 門清單。你可以在「智能推薦」或「課程庫」切換年份後修改；本頁會完整顯示所有已選課程，並根據相鄰年份實際計算年度更換率。</div>
        <h3 style="margin-top:16px">各年度完整課程清單</h3>
        <div class="year-cards">
          ${{YEARS.map(y => {{
            const list = selectedCoursesForYear(y);
            return `<div class="year-card">
              <div class="year-card-head"><strong>${{y}}</strong><span class="status-pill">${{list.length}} / ${{TARGET_LIMIT}} · 更換 ${{replacementRateForYear(y)}}%</span></div>
              <div class="year-card-body">
                <table><thead><tr><th class="seq-col">序</th><th class="no-col">編號</th><th>課程名稱</th><th class="action-col"></th></tr></thead>
                <tbody>${{list.map((c, idx) => `<tr><td>${{idx+1}}</td><td><strong class="plan-no">${{planNoHtml(c.no)}}</strong></td><td class="plan-title"><div class="course-title">${{escapeHtml(c.title)}}</div><span class="muted small plan-category">${{escapeHtml(c.category)}}</span></td><td><button class="btn danger small" data-plan-remove="${{y}}|${{c.no}}">×</button></td></tr>`).join('') || `<tr><td colspan="4" class="muted">尚未選課</td></tr>`}}</tbody></table>
              </div>
            </div>`;
          }}).join('')}}
        </div>
        <div class="section-title" style="margin-top:18px"><h3>長期分類覆蓋率</h3><div class="toolbar" style="margin:0"><label class="muted small" for="coverageSort">排序</label><select id="coverageSort"><option value="rateDesc" ${{state.coverageSort==='rateDesc'?'selected':''}}>覆蓋率高到低</option><option value="rateAsc" ${{state.coverageSort==='rateAsc'?'selected':''}}>覆蓋率低到高</option><option value="selectedDesc" ${{state.coverageSort==='selectedDesc'?'selected':''}}>已選多到少</option><option value="selectedAsc" ${{state.coverageSort==='selectedAsc'?'selected':''}}>已選少到多</option><option value="nameAsc" ${{state.coverageSort==='nameAsc'?'selected':''}}>分類名稱</option></select></div></div>
        <div class="coverage-table-wrap">
          <table>
            <thead><tr><th>分類</th><th>期間不重複已選</th><th>課程庫總數</th><th>覆蓋率</th></tr></thead>
            <tbody>${{coverageRows.map(r => `<tr><td>${{escapeHtml(r.cat)}}</td><td>${{r.selected}}</td><td>${{r.total}}</td><td><div class="bar-row" style="grid-template-columns:1fr 48px;margin:0"><div class="progress"><span style="width:${{r.rate}}%"></span></div><strong>${{r.rate}}%</strong></div></td></tr>`).join('')}}</tbody>
          </table>
          </div>
      </section>
      <aside class="panel pad plan-summary-panel" id="planSummary"></aside>
    </div>`;
  document.getElementById('autoPlan').onclick = generatePlan;
  document.getElementById('exportPlan').onclick = exportPlanExcel;
  document.getElementById('planStart').onchange = e => setPlanRange(e.target.value, document.getElementById('planEnd').value);
  document.getElementById('planEnd').onchange = e => setPlanRange(document.getElementById('planStart').value, e.target.value);
  document.getElementById('coverageSort').onchange = e => {{ state.coverageSort = e.target.value; save(); renderPlan(); }};
  document.getElementById('importPlan').onclick = () => document.getElementById('planImportFile').click();
  document.getElementById('planImportFile').onchange = async e => {{
    const file = e.target.files?.[0];
    if (!file) return;
    try {{ await importPlanExcel(file); }}
    catch (err) {{ alert('導入長期規劃失敗：' + err.message); }}
    e.target.value = '';
  }};
  document.getElementById('clearPlan').onclick = () => {{ YEARS.forEach(y => state.planning[y] = []); state.selected = new Set(); save(); renderPlan(); updateSelectedBadges(); }};
  el.querySelectorAll('[data-plan-remove]').forEach(btn => btn.onclick = () => {{
    const [year, no] = btn.dataset.planRemove.split('|');
    state.planning[year] = (state.planning[year] || []).filter(x => x !== no);
    if (year === state.activeYear) state.selected.delete(no);
    save(); renderPlan(); updateSelectedBadges();
  }});
  renderPlanSummary();
}}
function renderPlanSummary() {{
  const el = document.getElementById('planSummary');
  const allNos = YEARS.flatMap(y => state.planning[y] || []);
  const courses = allNos.map(no => courseByNo.get(no)).filter(Boolean);
  const usage = Counter(allNos);
  const repeated = usage.filter(x => x[1] > 1).length;
  const duplicateSlots = Math.max(0, allNos.length - new Set(allNos).size);
  const m = selectedMetrics(courses);
  const uniqueCount = new Set(allNos).size;
  const overallCoverage = pct(uniqueCount, COURSES.length);
  const plannedSlots = YEARS.length * TARGET_LIMIT;
  const openSlots = Math.max(0, plannedSlots - allNos.length);
  const oneYearOnly = usage.filter(x => x[1] === 1).length;
  const freqCounts = Array.from({{ length: Math.max(0, Math.min(5, YEARS.length) - 1) }}, (_, i) => Math.min(5, YEARS.length) - i).map(n => [n, usage.filter(x => x[1] === n).length]);
  const activeReplacementRates = YEARS.slice(1).map(y => replacementRateForYear(y)).filter(v => v > 0);
  const avgReplacement = activeReplacementRates.length ? Math.round(activeReplacementRates.reduce((a,b)=>a+b,0) / activeReplacementRates.length) : 0;
  el.innerHTML = `
    <h2>規劃指標</h2>
    ${{YEARS.map(y => `<div class="bar-row"><span>${{y}}</span><strong>${{(state.planning[y]||[]).length}} / ${{TARGET_LIMIT}}</strong></div><div class="progress"><span style="width:${{pct((state.planning[y]||[]).length,TARGET_LIMIT)}}%"></span></div><div class="muted small">更換率：${{replacementRateForYear(y)}}%</div>`).join('')}}
    <h3 style="margin-top:16px">長期覆蓋</h3>
    <div class="summary-item"><span>期間年度名額<span class="desc">${{YEARS.length}} 年 × ${{TARGET_LIMIT}} 門，應排滿 ${{plannedSlots}} 個年度課程位置</span></span><strong>${{allNos.length}} / ${{plannedSlots}}</strong></div>
    <div class="summary-item"><span>未排滿名額<span class="desc">仍然空缺的年度課程位置</span></span><strong>${{openSlots}}</strong></div>
    <div class="summary-item"><span>期間不同課程<span class="desc">規劃期間內至少出現過一次的課程數，不重複計算</span></span><strong>${{uniqueCount}}</strong></div>
    <div class="summary-item"><span>全庫廣度覆蓋<span class="desc">${{uniqueCount}} 門不同課程 / 全部 ${{COURSES.length}} 門課程</span></span><strong>${{overallCoverage}}%</strong></div>
    <div class="progress"><span style="width:${{overallCoverage}}%"></span></div>
    <div class="summary-item"><span>跨年重複課程<span class="desc">同一課程出現在 2 個以上年度</span></span><strong>${{repeated}} 門</strong></div>
    <div class="summary-item"><span>重複佔用名額<span class="desc">同一課程第 2 次起佔用的年度名額，數值越高代表越少輪替</span></span><strong>${{duplicateSlots}} 次</strong></div>
    <div class="summary-item"><span>只用 1 年課程<span class="desc">只出現在單一年份，代表輪替或年度專題課程</span></span><strong>${{oneYearOnly}} 門</strong></div>
    <div class="summary-item"><span>平均年度更換<span class="desc">只統計已有課程的相鄰年份更換率</span></span><strong>${{avgReplacement}}%</strong></div>
    <div class="summary-item"><span>需求覆蓋<span class="desc">已覆蓋的學習方向數量</span></span><strong>${{m.needs.size}} / ${{Object.keys(NEED_META).length}}</strong></div>
    <h3 style="margin-top:16px">重複課程查看</h3>
    <div class="field" style="margin-bottom:8px">${{freqCounts.length ? `<select id="frequencyFilter">${{freqCounts.map(([n,count]) => `<option value="${{n}}">重複 ${{n}} 次的課程（${{count}} 門）</option>`).join('')}}</select>` : '<div class="muted small">至少 2 年才會產生重複課程統計。</div>'}}</div>
    <div id="frequencyList"></div>`;
  document.getElementById('frequencyFilter')?.addEventListener('change', renderPlanFrequency);
  renderPlanFrequency();
}}
function renderPlanFrequency() {{
  const el = document.getElementById('frequencyList');
  if (!el) return;
  const selectedCount = Number(document.getElementById('frequencyFilter')?.value || 5);
  const usage = Counter(YEARS.flatMap(y => state.planning[y] || []))
    .filter(([no, n]) => n === selectedCount)
    .sort((a,b) => courseNoValue(a[0]) - courseNoValue(b[0]) || a[0].localeCompare(b[0], undefined, {{numeric:true}}));
  el.innerHTML = usage.length
    ? `<div class="muted small">共 ${{usage.length}} 門課程在規劃期間出現 ${{selectedCount}} 次。</div><div class="freq-list">${{usage.map(([no,n]) => `<div class="freq-course"><strong>${{escapeHtml(no)}}</strong><span>${{escapeHtml(courseByNo.get(no)?.title || '')}}</span></div>`).join('')}}</div>`
    : `<div class="muted small">目前沒有重複 ${{selectedCount}} 次的課程。</div>`;
}}

function renderAll() {{
  renderOverview();
  renderRecommend();
  renderLibrary();
  renderAnalysis();
  updateSelectedBadges();
}}
document.getElementById('copySelectedTop').onclick = copySelected;
initTabs();
renderAll();
</script>
</body>
</html>"""


def main():
    source, headers, courses = load_courses()
    summary = build_summary(courses, source)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(courses, ensure_ascii=False, separators=(",", ":"))
    html = html_template(
        payload,
        json.dumps(summary, ensure_ascii=False, separators=(",", ":")),
        json.dumps(CATEGORY_META, ensure_ascii=False, separators=(",", ":")),
        json.dumps(NEED_META, ensure_ascii=False, separators=(",", ":")),
        load_sheetjs_js(),
    )
    OUTPUT.write_text(html, encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT),
        "source": str(source),
        "courses": len(courses),
        "lead": summary["leadCourses"],
        "default75": len(summary["default75"]),
        "categories": summary["categoryCounts"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
