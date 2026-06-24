from pathlib import Path
import re


def _clean_item(text: str) -> str:
    text = re.sub(r'\s+', ' ', text.replace('\u00a0', ' ')).strip(' -;:•\t\r\n')
    return text


def _add_grouped_case(source_id: str, date: str, heading: str, items: list[str], source_title: str, source_url: str, region: str, vessel_prefix: str, evidence='narrative'):
    defs = []
    for item in items:
        item = _clean_item(item)
        if len(item) < 12:
            continue
        entry = d(f'英文原文：{item}', item)
        entry['sourceQuote'] = f'{source_id} | {heading} | {item}'
        entry['detentionReason'] = f'{source_id} 來源明確標明這些為 detainable deficiencies / grounds for detention，且導致或促成滯留。'
        defs.append(entry)
    if not defs:
        return
    cases.append(case(
        f"{slug(source_id)}-{slug(heading)}",
        date,
        f"{vessel_prefix} — {heading}",
        '多船旗 / 未逐案披露',
        'Multiple vessel types',
        region,
        'Multiple PSC inspections',
        defs,
        source_title,
        source_url,
        evidence,
    ))


def _parse_dromon_html_style(path: Path):
    text = path.read_text(encoding='utf-8', errors='ignore').replace('\u00a0', ' ')
    start = text.find('These detainable deficiencies')
    end = text.find('Act now')
    if start >= 0:
        text = text[start:end if end > start else None]
    known = [
        'Structural Condition', 'Water/Weathertight Condition', 'Emergency Systems', 'Cargo Operations, including Equipment',
        'Cargo Operations, including equipment', 'Radio Communication', 'Radio Communications', 'Fire Safety', 'Alarms',
        'Safety of Navigation', 'Life-Saving Appliances', 'Life-saving Appliances', 'Loadline',
        'Certificates & Documentation – Ship Certificates', 'Certificates & Documentation – Crew', 'Certificates & Documentation – Crew certificates',
        'Certificates & Documentation – Documents', 'Certificates and Documentation', 'Certificates & Documentation',
        'Propulsion and auxiliary machinery', 'ISPS', 'ISM', 'Pollution prevention – MARPOL Annex I',
        'Pollution Prevention – MARPOL Annex I', 'Pollution prevention – MARPOL Annex IV', 'Pollution Prevention – MARPOL Annex IV',
        'Pollution prevention – MARPOL Annex V', 'Pollution Prevention – MARPOL Annex V', 'Pollution prevention – MARPOL Annex VI',
        'Pollution Prevention – MARPOL Annex VI', 'Pollution Prevention – Ballast Water', 'Pollution Prevention - Ballast Water',
        'MLC, 2006, Working and living conditions', 'MLC, 2006 Conditions of employment',
        'MLC, 2006 Accommodation, recreational facilities, food and catering', 'MLC, 2006 Health protection, medical care, social security'
    ]
    groups = {}
    cur = None
    for raw in text.splitlines():
        line = _clean_item(raw)
        if not line or line.startswith('These detainable'):
            continue
        if line in {'Download in PDF', 'Share this post:', 'Previous Post', 'Next Post'} or line.startswith(('Related Posts', 'Previous Post', 'Next Post')):
            continue
        clean = line.rstrip(':')
        matched = None
        for h in known:
            if clean == h or clean.startswith(h + ' '):
                matched = h
                break
        if matched:
            cur = matched
            groups.setdefault(cur, [])
            rest = line[len(matched):].strip(' :•')
            if rest:
                groups[cur].append(rest)
            continue
        if cur:
            groups.setdefault(cur, []).append(line)
    out = {}
    for h, items in groups.items():
        clean_items = []
        for item in items:
            item = _clean_item(item)
            if len(item) < 12:
                continue
            if item.lower() in {'documents', 'crew certificates', 'ship certificates'}:
                continue
            clean_items.append(item)
        if clean_items:
            out[h] = clean_items
    return out


def _parse_dromon_pdf_flat(path: Path):
    text = path.read_text(encoding='utf-8', errors='ignore')
    start = text.find('These detainable')
    end = text.find('Act now')
    if start >= 0:
        text = text[start:end if end > start else None]
    known = [
        'Certificates & Documentation  Crew certificates', 'Certificates & Documentation  Documents',
        'Pollution Prevention  MARPOL Annex I', 'Pollution Prevention  MARPOL Annex IV',
        'Pollution Prevention - Ballast Water', 'MLC, 2006 Accommodation, recreational facilities, food and catering',
        'MLC, 2006, Working and living conditions', 'MLC, 2006 Conditions of employment',
        'Water/Weathertight Condition', 'Cargo Operations, including equipment', 'Radio Communications',
        'Safety of Navigation', 'Life-saving Appliances', 'Propulsion and auxiliary machinery',
        'Structural Condition', 'Emergency Systems', 'Fire Safety', 'Certificates & Documentation',
        'Loadline', 'ISPS', 'ISM', 'Alarms'
    ]
    flat = ' '.join(_clean_item(x) for x in text.splitlines() if _clean_item(x))
    for h in sorted(known, key=len, reverse=True):
        flat = flat.replace(h + ' ', f'\n@@{h}@@ ')
    groups = {}
    split_heads = r'(?:The|There|Several|Some|One|Two|All|During|No|Fixed|Chain|Cargo|Testing|Quick|Crew|Emergency|Documents|Flag|Related|Barrels|Heavy|ISPS|Crew members|Records|Pollution|As per|Operation|Work|Insufficient|Cold|Accommodation|Living|Some medicines)\b'
    for block in flat.split('\n@@'):
        if '@@' not in block:
            continue
        h, rest = block.split('@@', 1)
        parts = re.split(r'\s{2,}|(?<=\.)\s+(?=' + split_heads + ')', rest.strip())
        clean = []
        for p in parts:
            p = _clean_item(p)
            if len(p) < 12 or p.endswith('@@'):
                continue
            clean.append(p)
        if clean:
            groups[h] = clean
    return groups


def add_dromon_c25006_2025():
    p = root/'research_pages/new_sources/dromon_2025_02_alert32.txt'
    if not p.exists():
        return
    groups = _parse_dromon_html_style(p)
    for heading, items in groups.items():
        _add_grouped_case(
            'dromon-c25006-2025', '2025-02-12', heading, items,
            'Dromon Bureau of Shipping / C25006 Alert on Detainable Deficiencies',
            'https://www.dromon.com/2025/02/14/alert-on-detainable-deficiencies-32/',
            'Global / Dromon detention alert', 'Dromon C25006 2025 detainable deficiencies'
        )


def add_dromon_c26016_2026():
    p = root/'research_pages/new_sources/C26016-Alert-on-detainable-deficiencies.txt'
    if not p.exists():
        return
    groups = _parse_dromon_pdf_flat(p)
    for heading, items in groups.items():
        _add_grouped_case(
            'dromon-c26016-2026', '2026-02-16', heading, items,
            'Dromon Bureau of Shipping / C26016 Alert on Detainable Deficiencies',
            'https://www.dromon.com/wp-content/uploads/2026/02/C26016-Alert-on-detainable-deficiencies.pdf',
            'Global / Dromon detention alert', 'Dromon C26016 2026 detainable deficiencies'
        )


def _panama_items():
    p = root/'research_pages/new_sources/panama_2026_uscg_mmn.txt'
    if not p.exists():
        return {}
    text = p.read_text(encoding='utf-8', errors='ignore')
    groups = {'USCG PSCO statutory deficiency comments': []}
    # Extract concrete PSCO sentences from the first summary pages.
    for m in re.finditer(r'((?:PSCOs?|Crew|The Administration|Steering hydraulic|The technical|Due to)[^.]{20,700}\.)', text, flags=re.I):
        item = _clean_item(m.group(1))
        if any(x in item.lower() for x in ['observed', 'found', 'unable', 'inoperative', 'expired', 'missing', 'serious failure', 'release from detention', 'deficiency']):
            groups['USCG PSCO statutory deficiency comments'].append(item)
    # Extract numbered items in the top-code sections.
    section_start = text.find('The following summary describes the top 5 deficiencies')
    section_end = text.find('4. Fleet Advisory')
    if section_start >= 0 and section_end > section_start:
        sec = text[section_start:section_end]
        code_blocks = re.split(r'(?=\b(?:07105|07126|09209|07199|7120)\b)', sec)
        for block in code_blocks:
            head = _clean_item(block[:90])
            if not re.match(r'^(07105|07126|09209|07199|7120)', head):
                continue
            heading = head.split(' 1 ')[0].strip() if ' 1 ' in head else head[:70]
            parts = re.split(r'(?<!\d)\b(?:[1-9]|10)\s+', block)
            items = []
            for part in parts[1:]:
                part = _clean_item(part)
                if len(part) < 25:
                    continue
                # Stop a runaway item if the next code leaked in.
                part = re.split(r'\b(?:07126|09209|07199|7120)\b', part)[0].strip()
                items.append(part)
            if items:
                groups[f'Panama/USCG {heading}'] = items
    # Deduplicate while preserving order.
    out = {}
    for h, items in groups.items():
        seen = set(); clean=[]
        for item in items:
            key = item.lower()[:220]
            if key in seen or len(item) < 20:
                continue
            seen.add(key); clean.append(item)
        if clean:
            out[h] = clean
    return out


def add_panama_uscg_2025():
    groups = _panama_items()
    for heading, items in groups.items():
        _add_grouped_case(
            'panama-uscg-mmn-04-2026', '2026-02-03', heading, items,
            'Panama Maritime Authority / MMN-04-2026 Key Detainable Deficiencies under USCG PSC 2025',
            'https://www.panamashipregistry.com/wp-content/uploads/2026/02/MMN-04-2026-PSC-USCG-03-02-2026.pdf',
            'USCG / United States', 'Panama-flagged vessels under USCG PSC 2025', 'official-summary'
        )


def add_dnv_top18_2025():
    source_title = 'DNV / PSC CIC 2025 and DNV PSC Top 18 detainable deficiencies'
    source_url = 'https://www.dnv.com/news/2025/psc-cic-2025-on-ballast-water-management-and-dnvs-psc-top-18/'
    rows = [
        ('03108', 'Water/Weathertight Condition', 'Ventilators, air pipes, casings'),
        ('04114', 'Emergency Systems', 'Emergency source of power – Emergency generator'),
        ('07105', 'Fire Safety', 'Fire doors/openings in fire-resisting divisions'),
        ('07106', 'Fire Safety', 'Fire detection'),
        ('07109', 'Fire Safety', 'Fixed fire extinguishing installation'),
        ('07113', 'Fire Safety', 'Fire pumps and pipes'),
        ('07114', 'Fire Safety', 'Means of control (openings, pumps), machinery spaces'),
        ('07115', 'Fire Safety', 'Fire-dampers'),
        ('07120', 'Fire Safety', 'Means of escape'),
        ('07126/18420', 'Fire Safety', 'Oil accumulation and cleanliness in engine room'),
        ('10114', 'Safety of Navigation', 'VDR and S-VDR'),
        ('11101', 'Life Saving Appliances', 'Lifeboats'),
        ('11104', 'Life Saving Appliances', 'Rescue boats'),
        ('11112', 'Life Saving Appliances', 'Launching arrangements for survival craft'),
        ('11113', 'Life Saving Appliances', 'Launching arrangements for rescue boats'),
        ('13101', 'Propulsion and auxiliary machinery', 'Propulsion main engine'),
        ('14104', 'Pollution Prevention – MARPOL Annex I', 'Oil filtering equipment'),
        ('14108', 'Pollution Prevention – MARPOL Annex I', '15 PPM alarm arrangements'),
        ('14601/14602/14606', 'Pollution Prevention – MARPOL Annex VI', 'Engine air pollution and Technical Files'),
        ('15...', 'ISM', 'All ISM deficiencies'),
    ]
    defs = []
    for code, heading, text in rows:
        entry = d(f'英文原文：{text}', text)
        entry['code'] = code
        entry['category'] = cat(heading + ' ' + text)
        entry['sourceQuote'] = f'DNV Top 18 2025 | {code} | {text}'
        entry['detentionReason'] = 'DNV 2025 Top 18 圖表明確稱為 detainable deficiencies list / most frequently recorded detainable deficiencies。'
        defs.append(entry)
    cases.append(case(
        'dnv-top18-2025-detainable-focus-items', '2025-07-28', 'DNV Top 18 detainable deficiencies for 2025',
        '多船旗 / DNV-classed vessels', 'Multiple vessel types', 'Global / DNV detention focus list', 'Multiple PSC regimes',
        defs, source_title, source_url, 'narrative'
    ))


def add_dromon_more_2025_alerts():
    specs = [
        ('dromon-c25021-2025', '2025-04-08', root/'research_pages/dromon_2025_more/C25021_alert33.txt', 'Dromon Bureau of Shipping / C25021 Alert on Detainable Deficiencies', 'https://www.dromon.com/2025/04/08/alert-on-detainable-deficiencies-33/'),
        ('dromon-c25031-2025', '2025-06-11', root/'research_pages/dromon_2025_more/C25031_alert34.txt', 'Dromon Bureau of Shipping / C25031 Alert on Detainable Deficiencies', 'https://www.dromon.com/2025/06/11/alert-on-detainable-deficiencies-34/'),
        ('dromon-c25044-2025', '2025-08-25', root/'research_pages/dromon_2025_more/C25044_alert35.txt', 'Dromon Bureau of Shipping / C25044 Alert on Detainable Deficiencies', 'https://www.dromon.com/2025/08/25/alert-on-detainable-deficiencies-35/'),
        ('dromon-c25062-2025', '2025-11-06', root/'research_pages/dromon_2025_more/C25062_alert36.txt', 'Dromon Bureau of Shipping / C25062 Alert on Detainable Deficiencies', 'https://www.dromon.com/2025/11/06/alert-on-detainable-deficiencies-36/'),
    ]
    for source_id, date, path, source_title, source_url in specs:
        if not path.exists():
            continue
        groups = _parse_dromon_html_style(path)
        for heading, items in groups.items():
            _add_grouped_case(
                source_id, date, heading, items,
                source_title, source_url,
                'Global / Dromon detention alert', f'{source_id.upper()} detainable deficiencies'
            )


def _add_bilingual_grouped_case(source_id: str, date: str, heading: str, pairs: list[tuple[str, str]], source_title: str, source_url: str, region: str, vessel_prefix: str, evidence='narrative'):
    defs = []
    for en, cn in pairs:
        en = _clean_item(en)
        cn = _clean_item(cn)
        if len(en) < 8 and len(cn) < 8:
            continue
        entry = d(cn or f'英文原文：{en}', en or cn)
        entry['sourceQuote'] = f'{source_id} | {heading} | {en} | {cn}'
        entry['detentionReason'] = f'{source_id} 來源章節明確標示為 Detainable deficiencies / 可導致滯留的缺陷或典型滯留缺陷。'
        defs.append(entry)
    if not defs:
        return
    cases.append(case(
        f"{slug(source_id)}-{slug(heading)}",
        date,
        f"{vessel_prefix} — {heading}",
        '多船旗 / 未逐案披露',
        'Multiple vessel types',
        region,
        'Multiple PSC inspections',
        defs,
        source_title,
        source_url,
        evidence,
    ))


def _parse_xinde_bilingual_detainable_list(path: Path):
    text = path.read_text(encoding='utf-8', errors='ignore')
    start = text.find('Detainable deficiencies')
    end = text.find('b) Items to be inspected thoroughly')
    if start >= 0:
        text = text[start:end if end > start else None]
    groups = {}
    cur = None
    pending_en = None
    skip_heads = {'a) Detainable deficiencies可导致滞留的缺陷'}
    for raw in text.splitlines():
        line = _clean_item(raw)
        if not line:
            continue
        if line in skip_heads:
            continue
        if line.startswith('-'):
            line = _clean_item(line[1:])
        # Category headings are short non-sentence lines, often bilingual.
        if not re.search(r'[.!?。；;]$', line) and len(line) < 80 and not re.match(r'^[A-Z][a-z].{20,}$', line):
            if any(k in line for k in ['FIRE', 'ISM', 'Life Saving', 'Pollution', 'Certificate', 'Safety of Navigation', 'Others', '国际', '防污染', '救生', '证书', '航行', '其他']):
                cur = line.strip('- ')
                groups.setdefault(cur, [])
                pending_en = None
                continue
        if cur is None:
            continue
        # Pair English line followed by Chinese line when possible.
        has_cjk = bool(re.search(r'[\u4e00-\u9fff]', line))
        if not has_cjk:
            pending_en = line
        else:
            if pending_en:
                groups.setdefault(cur, []).append((pending_en, line))
                pending_en = None
            else:
                groups.setdefault(cur, []).append((line, line))
    return {h: pairs for h, pairs in groups.items() if pairs}


def add_xinde_tokyo_china_q1_2025():
    p = root/'research_pages/xinde_more/api/59470.txt'
    if p.exists():
        groups = _parse_xinde_bilingual_detainable_list(p)
        for heading, pairs in groups.items():
            _add_bilingual_grouped_case(
                'xinde-tokyo-mou-china-q1-2025', '2025-05-07', heading, pairs,
                '信德海事 / 2025第一季度PSC检查超多缺陷目录（TOKYO MOU-中国）',
                'https://www.xindemarinenews.com/topic/PSC/2025/0507/59470.html',
                'China / Tokyo MoU', 'Tokyo MoU China Q1 2025 detainable deficiencies', 'narrative'
            )


def add_xinde_zhoushan_new_ship_2025():
    source_title = '信德海事 / 舟山海事局：新船也被滞留！'
    source_url = 'https://xindemarine.com/topic/PSC/2025/0409/59085.html'
    items = [
        ('机舱应急吸口完全锈死无法打开', '机舱应急吸口完全锈死无法打开；检查时两名船员使用加力杆尚不能有效活络开。'),
        ('应急发电机启动电瓶充电装置未通过应急配电板保持', '应急发电机启动电瓶充电装置未通过应急配电板保持，主电源切断后可能无法保证自动启动能源。'),
        ('油漆间水喷淋装置在消防泵额定压力时不能维持供水量', '油漆间水喷淋装置在消防泵额定压力时不能维持供水量，一分钟多仅接到不足四分之一桶水。'),
    ]
    defs = []
    for en, cn in items:
        entry = d(cn, en)
        entry['sourceQuote'] = f'舟山海事局案例 | {cn}'
        entry['detentionReason'] = '來源明確寫明“对该船依法实施了滞留”，並列出三項嚴重缺陷。'
        entry['requiredRectification'] = '來源列明：拆解活絡應急吸口閥體；重新確認啟動電瓶浮充路徑；疏通清潔油漆間噴淋支路並增加噴頭。'
        defs.append(entry)
    cases.append(case(
        'xinde-zhoushan-new-ship-detained-2025-03-12', '2025-03-12', '華XX / 新造散貨船（舟山海事局）',
        '中國 / 船名匿名', 'Bulk carrier / dangerous goods capable', 'China / Tokyo MoU', 'Zhoushan PSC',
        defs, source_title, source_url, 'narrative'
    ))


def add_xinde_ballast_water_detention_examples_2025():
    p = root/'research_pages/xinde_more/api/61458.txt'
    if not p.exists():
        return
    pairs = [
        ('The BWMS not operated properly; the ship used bypass, no evidence showed challenging water situation, and no bypass alarm event was recorded in BWMS ballast water management.', '船舶使用 BWMS 旁通，無證據表明遭遇挑戰水質，且 BWMS 壓載水管理模塊未記錄旁通報警事件。'),
        ('Ship crew did not use ballast water treatment system; no evidence regarding BWTS; crew not familiar with ballast water management; BWTS switched off during inspection.', '船員未使用壓載水處理系統，缺少相關證據，不熟悉壓載水管理，且檢查期間關閉 BWTS。'),
    ]
    _add_bilingual_grouped_case(
        'xinde-ballast-water-detention-examples-2025', '2025-09-24', 'Ballast Water Management', pairs,
        '信德海事 / 2个压载水大检查典型滞留缺陷',
        'https://www.xindemarinenews.com/topic/PSC/2025/0924/61458.html',
        'China / Tokyo MoU', 'China PSC ballast water typical detention deficiencies', 'narrative'
    )


add_dromon_c25006_2025()
add_dromon_more_2025_alerts()
add_dromon_c26016_2026()
add_panama_uscg_2025()
add_dnv_top18_2025()
add_xinde_tokyo_china_q1_2025()
add_xinde_zhoushan_new_ship_2025()
add_xinde_ballast_water_detention_examples_2025()
