from pathlib import Path
import re, json, collections

root = Path('C:/Users/tuotu/Documents/Ship Inspection Case Finder')
html = Path('C:/Users/tuotu/Desktop/00 PSC - DASH.html').read_text(encoding='utf-8', errors='ignore')
raw = json.loads(re.search(r'let RAW_DATA = (\[.*?\]);\s*const CODE_EN', html, re.S).group(1))
fleet = json.loads(re.search(r'let FLEET_DATA = (\[.*?\]);', html, re.S).group(1))
fleet_by_imo = {str(f.get('imo')): f for f in fleet}

def code5(code):
    s = str(code or '').strip()
    return s.zfill(5) if s.isdigit() else s

def category_en_to_cn(cat, code=''):
    low = (cat or '').lower()
    p = code5(code)[:2]
    if 'ism' in low or code5(code) == '15150': return 'ISM／安全管理'
    if 'fire' in low: return '消防安全'
    if 'life saving' in low: return '救生設備'
    if 'navigation' in low: return '航行安全'
    if 'pollution' in low: return '防污染'
    if 'labour' in low or 'mlc' in low: return 'MLC／船員權益'
    if 'propulsion' in low or p == '13': return '主輔機／機艙'
    if 'water' in low or 'weathertight' in low: return '水密／風雨密'
    if 'certificate' in low or p == '01': return '證書／文件'
    if 'alarm' in low or p == '08': return '警報／監控'
    if 'structural' in low or p == '02': return '船體／結構'
    if p == '04': return '應急準備'
    return cat or '其他'

def translate_nature(nature):
    m = re.search(r'\(([^()]*)\)\s*(?:\([^()]*\))?$', nature or '')
    item = m.group(1) if m else nature
    item_cn = {
        'Magnetic compass':'磁羅經', 'Electrical':'電氣', 'Garbage management plan':'垃圾管理計劃',
        'Freeboard marks':'載重線標誌', 'Water, pipes, tanks':'水/管路/水艙', 'Provisions quantity':'食品供應數量',
        'Wages':'工資', 'Bilge pumping arrangements':'艙底水泵/管路佈置', 'Launching arrangements for survival craft':'救生艇筏降落裝置',
        'Rescue boats':'救助艇', 'Oil filtering equipment':'油水分離/濾油設備', 'Lights, shapes, sound-signals':'號燈/號型/聲號',
        'Ballast Water Record Book':'壓載水記錄簿', 'Fire-dampers':'防火風閘', 'Remote Means of control (opening,pumps,ventilation,etc.) Machinery spaces':'機艙遠程控制（開口、泵、通風等）',
        'Alternative arrangements (SOx)':'SOx 等效替代安排', 'Approval for exhaust gas cleaning system ':'廢氣清洗系統批准',
        'Ventilators, air pipes, casings':'通風筒/空氣管/圍壁', 'Propulsion main engine':'主機', 'Other (alarms)':'其他警報',
        'Scuppers, inlets and discharges':'排水口/進水口/排放口', 'ISM':'ISM 安全管理系統',
        'Charts':'海圖', 'Nautical publications':'航海出版物', 'Fire detection and alarm system':'火災探測與報警系統',
        'Emergency fire pump and its pipes':'應急消防泵及管路', 'Fire pumps and its pipes':'消防泵及管路',
        'Cleanliness of engine room':'機艙清潔', 'Oil record book':'油類記錄簿', 'Sewage treatment plant':'生活污水處理裝置',
    }.get(item, item)
    domain = (nature or '').split('(')[0].strip(' -')
    return f'{domain}：{item_cn}。'

def observed(nature, gfd):
    if re.search(r'\([0-9]{2}\.[0-9]{2}\.[0-9]{4}\)\s*$', nature or ''):
        return 'APCIS follow-up/複查行記錄了原缺陷日期；具體照片、整改驗證細節未在公開表格中披露。'
    if gfd == 'Yes':
        return 'APCIS 將此缺陷標示為 Ground for Detention；公開表格提供缺陷名稱/設備項，但未提供完整 PSCO 敘事。'
    return 'APCIS 公開表格提供缺陷代碼與 nature；不是完整 Form B，缺少照片、整改要求和釋放條件。'

def region_for(authority):
    if authority in {'China','Australia','Vietnam','Thailand','Philippines','Korea, Republic of','Indonesia','Japan'}:
        return f'{authority} / Tokyo MoU'
    return f'{authority} / PSC'

def flag_emoji(flag):
    table = {'Liberia':'🇱🇷','Taiwan, Province of China':'🇹🇼','Panama':'🇵🇦','Marshall Islands':'🇲🇭'}
    return table.get(flag, '⚓')

groups = collections.defaultdict(list)
for r in raw:
    if int(r.get('year') or 0) >= 2025:
        groups[r['uid']].append(r)

cases = []
for uid, rows in groups.items():
    rows = sorted(rows, key=lambda x: int(x.get('defNum') or 0))
    first = rows[0]
    imo = str(first.get('shipIMO') or '')
    f = fleet_by_imo.get(imo, {})
    gfd_count = sum(1 for r in rows if r.get('gfd') == 'Yes')
    detention = any(r.get('detention') == 'yes' for r in rows)
    status = 'detained' if detention or gfd_count else 'clear'
    ship_type = f.get('type1') or ('Bulk Carrier' if str(first.get('ship','')).startswith('FPMC B') else 'Tanker / other')
    deficiencies = []
    cats = []
    for r in rows:
        c = code5(r.get('code'))
        cat = category_en_to_cn(r.get('category'), c)
        cats.append(cat)
        nature = str(r.get('nature') or '')
        deficiencies.append({
            'code': c,
            'category': cat,
            'original': f"{c} — {nature}",
            'translation': translate_nature(nature),
            'observedCondition': observed(nature, r.get('gfd')),
            'inspectorFinding': nature,
            'detentionReason': 'APCIS 欄位 Ground for Detention = Yes。' if r.get('gfd')=='Yes' else 'APCIS 未將此項標示為 Ground for Detention；仍作為檢查缺陷納入趨勢。',
            'requiredRectification': '公開 APCIS 缺陷表未披露具體整改要求/驗證照片；需追 PSC Form A/B 或港口國文件。',
            'releaseCondition': '公開 APCIS 摘要未披露解除滯留條件。' if status=='detained' else '未涉及公開解除條件或為複查/非滯留缺陷。',
            'sourcePage': f'APCIS inspection UID {uid}',
            'sourceQuote': f"{c} | {nature} | Ground for Detention: {r.get('gfd')}",
            'detentionGround': True if r.get('gfd')=='Yes' else False,
        })
    topcats = '、'.join([x for x,_ in collections.Counter(cats).most_common(4)])
    source_url = f'https://apcis.tmou.org/public/?action=getshipinsp&UID={uid}'
    cases.append({
        'id': f"apcis-{uid.lower()}",
        'vessel': first.get('ship') or '',
        'imo': imo,
        'flag': first.get('flag') or '',
        'flagEmoji': flag_emoji(first.get('flag')),
        'shipType': ship_type,
        'built': None,
        'gt': f.get('grt') if f.get('grt') else None,
        'company': f.get('operator') or 'FPMC / APCIS company search',
        'classSociety': f.get('cls') or 'APCIS 未列明',
        'date': first.get('date') or '',
        'releaseDate': None,
        'port': first.get('port') or '',
        'mou': 'Tokyo MoU',
        'region': region_for(first.get('authority')),
        'deficiencyCount': len(rows),
        'detentionGroundCount': gfd_count,
        'status': status,
        'evidenceLevel': 'official-summary',
        'shortSummary': f"{first.get('authority')} PSC/APCIS {first.get('date')} 檢查 {first.get('ship')}，港口 {first.get('port')}，共 {len(rows)} 項缺陷，其中 {gfd_count} 項標示為 Ground for Detention；重點面向：{topcats or '未分類'}。",
        'narrative': [
            f"來源為 Tokyo MoU/APCIS 公開檢查資料（Inspection UID: {uid}）。",
            f"檢查類型：{first.get('type')}；Detention 欄位：{first.get('detention')}；港口國/Authority：{first.get('authority')}。",
            '本資料保留 APCIS 原始缺陷代碼與 nature，不把缺少細節的缺陷擴寫成未公開的現場敘事。',
        ],
        'deficiencies': deficiencies,
        'source': {
            'authority': 'Tokyo MoU / APCIS',
            'title': f"APCIS inspection detail — {first.get('ship')} — {first.get('date')} — {first.get('authority')}",
            'url': source_url,
            'publishedAt': first.get('date') or '',
            'sourceType': 'Tokyo MoU/APCIS 公開檢查缺陷表',
        },
        'evidenceNote': 'APCIS 屬官方/區域 MoU 公開檢查摘要：能提供 2025+ 具體缺陷代碼與設備/項目名稱，但不是完整 PSC Form B；整改要求、照片、解除條件需另追。',
    })

cases.sort(key=lambda x: (x['date'], x['vessel']), reverse=True)
content = "import type { InspectionCase } from '../types'\n\n"
content += "// 2025+ only. Seeded from Tokyo MoU/APCIS-derived FPMC PSC dashboard export and local APCIS inspection snapshots.\n"
content += "// Do not add pre-2025 records here; the user explicitly requested 2025 onward only.\n"
content += "export const inspectionCases: InspectionCase[] = " + json.dumps(cases, ensure_ascii=False, indent=2) + "\n\n"
content += "export const shipTypes = " + json.dumps(sorted({c['shipType'] for c in cases}), ensure_ascii=False) + "\n"
content += "export const categories = " + json.dumps(sorted({d['category'] for c in cases for d in c['deficiencies']}), ensure_ascii=False) + "\n"
(root/'src/data/cases.ts').write_text(content, encoding='utf-8')
print('generated cases', len(cases), 'deficiencies', sum(len(c['deficiencies']) for c in cases), 'detention/gfd cases', sum(1 for c in cases if c['status']=='detained'))
print('regions', sorted({c['region'] for c in cases}))
