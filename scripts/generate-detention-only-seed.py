from pathlib import Path
import json, re

root = Path('C:/Users/tuotu/Documents/Ship Inspection Case Finder')

def cat(text):
    s=text.lower()
    if any(x in s for x in ['certificate', 'certificates', 'documentation', 'sart', 'gmdss', 'doc ', '證書']): return '證書／文件'
    if any(x in s for x in ['radar', 'chart', 'vdr', 'voyage', 'navigation', 'echo sounder', 'bnwas']): return '航行安全'
    if any(x in s for x in ['weathertight', 'water ballast', 'manhole', 'cargo hold', 'corrosion', 'holed', 'hatch', 'structural', 'ventilator', 'air vent']): return '水密／結構'
    if any(x in s for x in ['wage', 'accommodation', 'heating', 'ventilation systems', 'mlc', 'working and living', 'rest hour']): return 'MLC／船員權益'
    if any(x in s for x in ['fire', '消防', 'sprinkler', 'co2', 'extinguisher', 'damper']): return '消防安全'
    if any(x in s for x in ['lifeboat', 'rescue boat', '救生', '救助艇', 'embarkation']): return '救生設備'
    if any(x in s for x in ['garbage', 'ballast', 'ows', 'oil', 'pollution', '垃圾', '压载', '油水']): return '防污染'
    if any(x in s for x in ['emergency generator', 'emergency fire pump', '应急', 'emergency']): return '應急準備'
    if any(x in s for x in ['sms', 'ism', '安全管理']): return 'ISM／安全管理'
    if any(x in s for x in ['engine', '主机', '舵机', 'blower', 'g/e', 'steering']): return '主輔機／機艙'
    if any(x in s for x in ['drill', '演习', 'crew', 'familiar']): return '船員熟悉／演習'
    if any(x in s for x in ['cargo securing', 'lashing', 'gas detector', 'multigas', 'portable gas', 'equipment', 'apparatus', 'operational test', 'not operational', 'inoperative', 'out of order', 'not ready', 'not available']): return '操作／設備缺陷'
    if any(x in s for x in ['ballast water']): return '防污染'
    return '操作／設備缺陷'

def code_for(category):
    return {'消防安全':'07xxx','救生設備':'11xxx','防污染':'14xxx','應急準備':'04xxx','ISM／安全管理':'15150','主輔機／機艙':'13xxx','船員熟悉／演習':'04xxx','證書／文件':'01xxx','航行安全':'10xxx','水密／結構':'03xxx','MLC／船員權益':'18xxx','操作／設備缺陷':'99xxx'}.get(category,'未列明')

def d(original_cn, original_en):
    c=cat(original_en+' '+original_cn)
    return {
        'code': code_for(c),
        'category': c,
        'original': original_en,
        'translation': original_cn,
        'inspectorFinding': original_en,
        'detentionReason': '來源段落標明為「滯留缺陷」/ detainable deficiency。',
        'requiredRectification': '公開來源未披露完整整改驗證；需追 PSC Form A/B、港口國 detention notice 或官方資料庫。',
        'sourceQuote': f'{original_cn}（{original_en}）',
        'detentionGround': True,
    }

def case(id, date, vessel, flag, ship_type, region, port, defs, source_title, source_url, evidence='narrative'):
    top='、'.join(dict.fromkeys([x['category'] for x in defs]).keys())
    return {
        'id': id,
        'vessel': vessel,
        'imo': '待官方 Form A/B 補齊',
        'flag': flag,
        'flagEmoji': '⚓',
        'shipType': ship_type,
        'built': None,
        'gt': None,
        'company': '公開來源未披露',
        'classSociety': '公開來源未披露',
        'date': date,
        'releaseDate': None,
        'port': port,
        'mou': 'Other' if 'USCG' not in region and 'Paris' not in region else ('USCG' if 'USCG' in region else 'Paris MoU'),
        'region': region,
        'deficiencyCount': len(defs),
        'detentionGroundCount': len(defs),
        'status': 'detained',
        'evidenceLevel': evidence,
        'shortSummary': f'{date} {port} PSC 滯留案例，{ship_type} / {flag}，已收錄 {len(defs)} 項滯留缺陷；重點：{top}。',
        'narrative': [
            '本筆按用戶要求只保留滯留項目，非滯留缺陷不納入。',
            '船名/IMO 若公開來源未披露，先以港口國、日期、船旗和船型建立線索案，後續需用官方 Form A/B 或 MOU 資料庫補齊。',
        ],
        'deficiencies': defs,
        'source': {'authority': source_title.split(' / ')[0], 'title': source_title, 'url': source_url, 'publishedAt': date[:7], 'sourceType': '2025+ PSC 滯留缺陷線索 / 待官方複核' if 'Sohu' in source_title else '官方/準官方滯留缺陷來源'},
        'evidenceNote': '僅保留來源明確稱為滯留缺陷/grounds for detention 的項目；非滯留缺陷已排除。若來源非官方，頁面上保留來源標籤，後續需以官方 Form A/B 校核。',
    }

sohu_url='https://www.sohu.com/a/896984711_121124367'
source='PSCReady via Sohu / 2025 開年 10 大 PSC 滯留案例'
cases=[
case('psc-2025-0103-guangzhou-panama-bulk','2025-01-03','Panama bulk carrier detained by Guangzhou PSC','Panama','Bulk carrier','China / Tokyo MoU','Guangzhou',[
 d('船員不熟悉垃圾排放管理規程，存在違規將廚餘垃圾倒入海中的行為','Crew not familiar with management of Garbage discharge. Food waste were discharge overboard'),
 d('固定式火警探測系統顯示3個防火分區的探測器故障','The fixed fire detection and alarm system displayed 3 zones sensor fault.'),
 d('油漆間3處噴淋頭由於腐蝕堵塞而失效','Three sprinkler in paint store corroded and malfunction.'),
],source,sohu_url),
case('psc-2025-0106-shenzhen-liberia-container','2025-01-06','Liberia container ship detained by Shenzhen PSC','Liberia','Container ship','China / Tokyo MoU','Shenzhen',[
 d('棄船演習不符合 SOLAS 要求','Abandon ship drill not comply with the requirement'),
 d('右舷登乘站登乘梯牽繩斷裂','Embarkation ladder rope broken on starboard embarkation station'),
 d('3號副機燃油隔離閥卡死在開啟位置','No.3 G/E F.O. isolating valve stuck in open'),
 d('生活區與駕駛台穿艙件開口使用可燃材料封堵','Wire penetration between bridge to accommodation sealed with flammable materials'),
 d('機艙存在滅火器10米覆蓋盲區','In E/R floor, one point walking distance to any portable extinguisher more than 10 meters'),
 d('安全管理體系失效，需要開展附加審核','SMS failure'),
],source,sohu_url),
case('psc-2025-0107-bordeaux-korea-chemical-tanker','2025-01-07','Korean oil/chemical tanker detained at Bordeaux PSC','Korea','Oil/Chemical tanker','France / Paris MoU','Bordeaux',[
 d('輪機長未能成功演示應急發電機自動啟動程序','Chief engineer fails to demonstrate automatic emergency generator'),
 d('救生艇降落測試中自動脫鉤裝置失效','During test of lowering lifeboat, automatic release of the lashing was inoperative'),
 d('安全管理體系失效，需要開展附加審核','SMS failure'),
],source,sohu_url),
case('psc-2025-0122-shanghai-panama-bulk','2025-01-22','Panama bulk carrier detained by Shanghai PSC','Panama','Bulk carrier','China / Tokyo MoU','Shanghai',[
 d('1號主機輔助風機故障導致主機意外降速','M/E dead slow down occurred unexpectedly due to No.1 auxiliary blower malfunction of M/E'),
 d('主機操縱部位與駕駛台僅配備單套車鐘系統','Only one set of telegraph between bridge and local operation position'),
 d('應急消防泵軸封泄漏導致出水壓力不足','Delivery pressure of the emergency fire pump found insufficient due to the shaft seal leaking'),
],source,sohu_url),
case('psc-2025-0206-toyohashi-panama-cargo','2025-02-06','Panama cargo ship detained by Toyohashi PSC','Panama','Cargo ship','Japan / Tokyo MoU','Toyohashi',[
 d('駕駛台火警控制面板持續報故障','Fire alarm panel in navigation bridge kept activated fault alarm'),
],source,sohu_url),
case('psc-2025-0206-tangshan-liberia-bulk','2025-02-06','Liberia bulk carrier detained by Tangshan PSC','Liberia','Bulk carrier','China / Tokyo MoU','Tangshan',[
 d('油漆間噴淋頭堵塞','The spray nozzle blocked in the paint store'),
 d('救助艇發動機無法啟動','Rescue boat can not be started'),
],source,sohu_url),
case('psc-2025-0211-rizhao-liberia-bulk','2025-02-11','Liberia bulk carrier detained by Rizhao PSC','Liberia','Bulk carrier','China / Tokyo MoU','Rizhao',[
 d('救生艇殼體存在孔洞，影響水密性','Lifeboat can not be water tight due to one designed hole exist on shell'),
 d('救生艇降落絞車傳動機構異常','Gear handle rotating by moving parts of the lifeboat launching winch'),
],source,sohu_url),
case('psc-2025-0217-tuapse-panama-chemical-tanker','2025-02-17','Panama oil/chemical tanker detained by Tuapse PSC','Panama','Oil/Chemical tanker','Russia / PSC','Tuapse',[
 d('壓載水未按 D-2 標準處理','Ballast water was not treated'),
 d('壓載水處理系統故障且未向船旗國/港口國/RO 報告','BWTS inoperative and not informed to Flag/Port Authorities/RO'),
 d('船員不熟悉壓載水系統正確操作','Not familiar with proper operation'),
],source,sohu_url),
case('psc-2025-0218-qinzhou-panama-chemical-tanker','2025-02-18','Panama oil/chemical tanker detained by Qinzhou PSC','Panama','Oil/Chemical tanker','China / Tokyo MoU','Qinzhou',[
 d('火災報警系統故障','Fire alarm system malfunction'),
 d('1號舵機報警無法觸發','Alarm of No.1 steering gear can not be activated'),
 d('自由降落式救生艇舵系統不同步','Free-fall lifeboat not synchronize with rudder'),
 d('救助艇蓄能器壓力不足，不能釋放救助艇','Inflatable chamber of rescue boat not enough'),
 d('封閉處所進入及救援演習不滿足要求','Enclosed space entry and rescue drill not satisfactory'),
],source,sohu_url),
case('psc-2025-0219-banten-liberia-bulk','2025-02-19','Liberia bulk carrier detained by Banten PSC','Liberia','Bulk carrier','Indonesia / Tokyo MoU','Banten',[
 d('機艙焚燒爐水霧噴淋系統故障','Hypermist for engine room incinerator defective'),
 d('油水分離器功能失效','OWS defective'),
 d('救助艇吊機蓄能器油封損壞','Accumulator oil seal broken for rescue boat davit'),
 d('救助艇發動機故障','Rescue boat engine defective'),
],source,sohu_url),
]

# Add two official-indexed USCG 2025 examples already captured in prior project notes.
uscg='United States Coast Guard / CVC-2 SOLAS detention PDF indexed excerpt'
uscg_url='https://www.dco.uscg.mil/Our-Organization/Assistant-Commandant-for-Prevention-Policy-CG-5P/Inspections-Compliance-CG-5PC-/Commercial-Vessel-Compliance/Foreign-Offshore-Compliance-Division/Port-State-Control/Detentions/'
cases.append(case('uscg-2025-0927-emil-selmer','2025-09-27','EMIL SELMER','Madeira / Portugal','General cargo / cargo ship','USCG / United States','USCG port not exposed in indexed snippet',[
 d('應急消防泵未能向駕駛台翼消防水帶站供水','Emergency fire pump did not provide any water to the bridge wing fire hose station'),
 d('多條甲板消防水帶老化，存在針孔漏水和墊片失效','Multiple fire hoses are deteriorated; numerous pin hole leaks and gasket failures on hoses located on deck, including port and starboard bridge wings'),
],uscg,uscg_url,'full-dossier'))
cases.append(case('uscg-2025-0416-hanze-gendt','2025-04-16','HANZE GENDT','Netherlands / not confirmed','General cargo / cargo ship','USCG / United States','USCG port not exposed in indexed snippet',[
 d('VDR/S-VDR 相關設備未能滿足要求，需要整改','Voyage data recorder (VDR) / Simplified Voyage data recorder (S-VDR) — performance/equipment deficiency requiring corrective action'),
 d('公司未能及時採取整改行動，需要外部 SMS 稽核','Company responsibility and authority — failure to provide timely corrective action; external SMS audit required'),
],uscg,uscg_url,'full-dossier'))

# Add 2025 September multi-region PSC detention/action-code-30 items from a cached 8-country/11-port source.
# Only lines prefixed with action code 30 are imported; lines prefixed 16/17/99 are intentionally excluded.
p2_source = '52航海 / 大數跨境 2025年9月 8國11港口 PSC滯留與缺陷小結'
p2_url = 'https://www.10100.com/ （cached article title: 2025年9月份, 8国11个港口90+PSC缺陷）'

def split_bilingual(text):
    text = re.sub(r'^30\s+', '', text).strip()
    m = re.search(r'([\u4e00-\u9fff].*)', text)
    if m:
        return m.group(1).strip(' 。；;'), text[:m.start()].strip(' .；;')
    return '來源未提供中文翻譯，按英文原文保留', text

def p2_header_info(header):
    dm = re.search(r'2025\.9\.(\d{1,2})', header)
    date = f"2025-09-{int(dm.group(1)):02d}" if dm else '2025-09-01'
    if '上海' in header: return date, 'Shanghai', 'China / Tokyo MoU'
    if '舟山' in header: return date, 'Zhoushan', 'China / Tokyo MoU'
    if 'ULSAN' in header or '蔚山' in header: return date, 'Ulsan', 'Korea, Republic of / Tokyo MoU'
    if 'DONGHAE' in header or '东海' in header: return date, 'Donghae', 'Korea, Republic of / Tokyo MoU'
    if 'AMSTERDAM' in header or '阿姆斯特丹' in header: return date, 'Amsterdam', 'Netherlands / Paris MoU'
    if 'ROTTERDAM' in header or '鹿特丹' in header: return date, 'Rotterdam', 'Netherlands / Paris MoU'
    if 'BURGAS' in header or '布尔加斯' in header or date == '2025-09-10': return date, 'Burgas', 'Bulgaria / Paris MoU'
    if 'MERSIN' in header or '梅尔辛' in header: return date, 'Mersin', 'Türkiye / Mediterranean MoU'
    if 'TUTICORIN' in header or '图蒂科林' in header: return date, 'Tuticorin', 'India / Indian Ocean MoU'
    if 'VALPARAISO' in header or '瓦尔帕莱索' in header: return date, 'Valparaiso', 'Chile / Latin America MoU'
    if 'VERACRUZ' in header or '韦拉克鲁斯' in header: return date, 'Veracruz', 'Mexico / Latin America MoU'
    return date, 'Port not disclosed', 'Multi-region / PSC'

def add_p2_cases():
    p = root/'research_pages/p2.txt'
    if not p.exists():
        return
    lines = [ln.strip() for ln in p.read_text(encoding='utf-8', errors='ignore').splitlines() if ln.strip()]
    groups = {}
    context = ''
    current = ''
    for ln in lines:
        if re.match(r'^(30|17|16|99)\s+', ln):
            if ln.startswith('30 ') and current:
                groups.setdefault(current, []).append(ln)
            continue
        if re.match(r'^\d+\.\d+\s+', ln) or re.match(r'^\d+\.', ln):
            context = ln
            if '2025.9.' in ln:
                current = ln
            continue
        if re.match(r'^2025\.9\.\d+', ln):
            current = f"{context} {ln}" if context else ln
            continue
    for header, lines30 in groups.items():
        date, port, region = p2_header_info(header)
        defs = []
        for ln in lines30:
            zh, en = split_bilingual(ln)
            defs.append(d(zh, en))
            defs[-1]['sourceQuote'] = f"Action code 30 | {en} | {zh}"
            defs[-1]['detentionReason'] = '來源行首 Action Taken Code = 30；本 App 僅將此類行作為滯留項導入。'
        vessel = f"{port} PSC detention action-code-30 case group"
        cases.append(case(
            f"p2-2025-09-{slug(port)}-{len(lines30)}",
            date,
            vessel,
            '公開來源未披露',
            'Source did not disclose vessel type',
            region,
            port,
            defs,
            p2_source,
            p2_url,
            'narrative',
        ))

def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-') or 'port'

add_p2_cases()

# Add 2026 detainable deficiencies from Dromon C26031 cached article.
# The source explicitly states these were considered grounds for detention and all contributed to detentions.
def add_dromon_2026_cases():
    p = root/'research_pages/p15.txt'
    if not p.exists():
        return
    headings = {
        'Water/Weathertight Condition','Emergency Systems','Cargo Operations, including equipment','Radio Communications',
        'Fire Safety','Alarms','Safety of Navigation','Life-saving Appliances','Certificates & Documentation – Ship Certificates',
        'ISPS','ISM','Pollution Prevention – Ballast Water','MLC, 2006, Working and living conditions',
        'MLC, 2006 Conditions of employment','MLC, 2006 Accommodation, recreational facilities, food and catering',
    }
    lines = [ln.strip() for ln in p.read_text(encoding='utf-8', errors='ignore').splitlines()]
    groups = {}
    cur = None
    last = None
    in_section = False
    for line in lines:
        if line.startswith('These detainable deficiencies'):
            in_section = True
            continue
        if line.startswith('Act now'):
            break
        if not in_section or not line:
            continue
        if line in headings:
            cur = line
            groups.setdefault(cur, [])
            last = None
            continue
        if line.startswith('•') and cur:
            groups[cur].append(line.lstrip('•').strip())
            last = len(groups[cur]) - 1
        elif cur and last is not None and not line.startswith(('Previous', 'Next', 'Related Posts', 'Share')):
            groups[cur][last] += ' ' + line
    source_title = 'Dromon Bureau of Shipping / C26031 Alert on Detainable Deficiencies'
    source_url = 'https://www.dromon.com/2026/05/19/alert-on-detainable-deficiencies-38/'
    for heading, items in groups.items():
        if not items:
            continue
        defs = []
        for item in items:
            entry = d(f'英文原文：{item}', item)
            entry['sourceQuote'] = f"C26031 | {heading} | {item}"
            entry['detentionReason'] = 'Dromon C26031 明確說明該清單為 grounds for detention，且 all contributed to detentions。'
            defs.append(entry)
        cases.append(case(
            f"dromon-c26031-2026-{slug(heading)}",
            '2026-05-14',
            f"Dromon C26031 2026 detainable deficiencies — {heading}",
            '多船旗 / 未逐案披露',
            'Multiple vessel types',
            'Global / Dromon detention alert',
            'Multiple PSC inspections',
            defs,
            source_title,
            source_url,
            'narrative',
        ))

# Add concrete DNV Q1 2026 detainable deficiency examples.
def add_dnv_q1_2026_cases():
    source_title = 'DNV / Port State Control - Q1 2026 Detention review and other updates'
    source_url = 'https://www.dnv.com/news/2026/port-state-control-q1-2026-detention-review-and-other-updates/'
    examples = [
        ('07106', '消防安全', 'In engine room workshop found one smoke detector damaged and repaired with rubber tape.', '機艙工作間一個煙霧探測器損壞，並用橡膠帶修補。'),
        ('07105', '消防安全', 'Self-closing fire door from engine room to steering gear room not closing correct', '機艙至舵機間的自閉式防火門不能正確關閉。'),
        ('04102', '應急準備', 'The emergency fire pump unable to pressurize fire main.', '應急消防泵無法使消防總管加壓。'),
        ('04109', '船員熟悉／演習', 'During the fire drill, the firefighters were not wearing their VHF headsets correctly and one of them was not wearing his helmet.', '消防演習中，消防員未正確佩戴 VHF 耳機，其中一人未佩戴頭盔。'),
        ('04114', '應急準備', 'During a simulated blackout test, the emergency source of power in automatic mode failed to take load on the emergency switchboard. Several attempts were carried out with unsatisfactory results.', '模擬 blackout 測試中，應急電源自動模式未能向應急配電板帶載，多次嘗試結果均不滿意。'),
    ]
    defs = []
    for code, category, en, zh in examples:
        entry = d(zh, en)
        entry['code'] = code
        entry['category'] = category
        entry['sourceQuote'] = f"DNV Q1 2026 | {code} | {en}"
        entry['detentionReason'] = 'DNV Q1 2026 指明這些為 most frequently observed detainable deficiency sub-categories 的具體例子。'
        defs.append(entry)
    cases.append(case(
        'dnv-q1-2026-detainable-examples',
        '2026-04-29',
        'DNV Q1 2026 detainable deficiency examples',
        '多船旗 / DNV-classed vessels',
        'Container / bulk / general cargo majority',
        'Global / Paris MoU + Tokyo MoU majority',
        'Multiple PSC inspections',
        defs,
        source_title,
        source_url,
        'narrative',
    ))

add_dromon_2026_cases()
add_dnv_q1_2026_cases()
exec((root/'scripts/expanded_detention_imports.py').read_text(encoding='utf-8'), globals())

cases.sort(key=lambda c: (c['date'], c['vessel']), reverse=True)
content = "import type { InspectionCase } from '../types'\n\n"
content += "// 2025+ detention grounds only. No FPMC fleet records and no non-detainable deficiencies.\n"
content += "export const inspectionCases: InspectionCase[] = " + json.dumps(cases, ensure_ascii=False, indent=2) + "\n\n"
content += "export const shipTypes = " + json.dumps(sorted({c['shipType'] for c in cases}), ensure_ascii=False) + "\n"
content += "export const categories = " + json.dumps(sorted({d['category'] for c in cases for d in c['deficiencies']}), ensure_ascii=False) + "\n"
(root/'src/data/cases.ts').write_text(content, encoding='utf-8')
print('cases', len(cases), 'detention grounds', sum(len(c['deficiencies']) for c in cases), 'FPMC?', any('FPMC' in c['vessel'] for c in cases))
