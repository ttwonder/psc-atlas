# PSC Atlas

PSC 滯留深度案例 App。案例資料保留官方原文、中文整理、滯留依據、事件經過、整改結果、來源及證據完整度。

## 執行

```bash
npm install
npm run dev
```

如果 5173 已被其他本地 App 使用，Vite 會自動切到下一個端口；也可以手動指定：

```bash
npm run dev -- --port 5175
```

## 目前已完成

- **按鈕獲取最新缺失**：點擊「獲取最新缺失」後，從 GOV.UK / UK MCA 官方 API 抓取最近外國船舶 PSC 滯留公告，解析船名、IMO、港口、滯留日期、解除日期、缺陷代碼、Nature of defect、Ground for Detention。
- **累積保存**：資料保存在瀏覽器 localStorage；再次更新會合併新案例，舊案例不刪除；相同船名/IMO/日期會合併，避免重複。
- **時間段趨勢**：支援最近 3 個月、6 個月、1 年、全部時間。
- **地區篩選**：目前已支持 UK / Paris MoU、Germany / Paris MoU；後續可擴充 Tokyo MoU、USCG、AMSA、Canada 等 connector。
- **主動查詢**：可按地區、時間段、船型、缺陷分類、仍在滯留狀態、船名/IMO/摘要搜尋。
- **地區性總結報告**：缺陷分析頁自動生成近期檢查重點、主要缺陷類別、典型扣船案例、船舶督導自查清單、船上自查自糾清單、來源網址。
- **Excel 匯出**：匯出 Excel 可打開的 `psc-detention-dossiers.xls` SpreadsheetML 工作簿，包含「案例總清單」「缺陷詳情清單」「網址清單」「代表性來源地圖」「總結報告」多個 sheet；不再依賴有安全告警的 `xlsx` 套件。
- **完整網址清單**：資料來源頁列出所有採集來源 URL，並支持手動添加網址作備忘；同頁新增 Paris MoU、UK MCA、Tokyo MoU/APCIS、USCG、AMSA、Transport Canada 和 PSC Form A/B 申請路徑的代表性官方來源地圖。
- **案例總清單 + 詳情清單**：案例庫中點擊單個案例，右側打開快速摘要與完整逐項缺陷詳情；完整詳情保留官方原文、中文整理、檢查員認定、滯留理由、整改/解除欄位。
- **快速摘要**：每個案例有短摘要，方便快速理解滯留主因。

## 雲端資料庫版（Supabase）

這個 App 現在支援兩種模式：

- 未設定 Supabase：使用內建資料 + 瀏覽器本機保存，適合本地查看或展示。
- 設定 Supabase：公開訪客可讀取雲端案例/來源；登入使用者可新增來源、同步資料、把更新寫入雲端，其他人重新打開同一網址即可看到。

### 1. 建立 Supabase 專案

1. 打開 https://supabase.com/ 並登入。
2. 建立一個新 project。
3. 到 Project Settings → API，複製：
   - Project URL
   - anon public key
4. 到 SQL Editor，執行本專案的：

```text
supabase/schema.sql
```

這會建立：

- `psc_cases`：雲端案例表，保留完整 JSON 卷宗和日期/地區索引欄位。
- `psc_sources`：雲端來源表，保留手動來源和來源地圖。
- `psc_sync_events`：後續同步紀錄表。
- RLS 權限：公開可讀；只有 authenticated users 可寫入。

### 2. 本機設定環境變數

複製 `.env.example` 成 `.env.local`：

```bash
cp .env.example .env.local
```

填入：

```text
VITE_SUPABASE_URL=https://你的-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=你的 anon public key
```

然後啟動：

```bash
npm run dev
```

進入「資料來源」頁會看到「雲端資料庫同步」面板。輸入 email 後會收到 Supabase magic link，登入後即可按「同步目前資料到雲端」。

### 3. 發佈到 GitHub Pages 時設定 secrets

在 GitHub repo：

```text
Settings → Secrets and variables → Actions → New repository secret
```

新增兩個 secrets：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

本專案 `.github/workflows/deploy-pages.yml` 會在 build 時讀取這兩個 secrets。沒有設定時網站仍能展示，但雲端同步會停用。

### 4. 發佈到 Vercel 時設定 Environment Variables

如果使用 Vercel，請在 Project → Settings → Environment Variables 新增：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PSC_REFRESH_TOKEN
```

用途：

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`：前端讀取公開資料、登入、普通寫入。
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`：Vercel 後端 API 寫入資料庫；不要暴露給瀏覽器。
- `PSC_REFRESH_TOKEN`：授權後端刷新用的密碼；只給你信任的編輯者。

重新 Deploy 後，網站就會連到雲端資料庫，並啟用：

```text
/api/refresh
```

在 App 內進入：

```text
資料來源 → 自動抓取策略 → Vercel 後端刷新
```

輸入 `PSC_REFRESH_TOKEN` 後點「由後端獲取最新缺失」，Vercel Function 會在伺服器端抓取 GOV.UK/MCA + Paris MoU current detentions，過濾為 2025+ detention-only / GFD，然後寫入 Supabase。其他人重新打開同一網址即可看到最新雲端資料。

如果前端不在同一個 Vercel project，而是放在 GitHub Pages，則還要設定：

```text
VITE_REFRESH_API_URL=https://你的-vercel-project.vercel.app/api/refresh
```

### 權限模型

目前預設：

- 所有人：可查看案例和來源。
- 登入使用者：可新增/更新案例與來源。

如果你之後想改成「只有指定 email 可寫入」，可以在 Supabase `profiles` / `allowed_editors` 表上加白名單 RLS。

## 測試與構建

```bash
npm test
npm run build
```

已驗證：

- `npm test`：17 tests passed。
- `npm run build`：TypeScript + Vite build 成功；靜態 HTTP server 驗證正常。
- `npm run lint`：ESLint 10 flat config 通過。
- `npm audit --json`：0 vulnerabilities。
- 瀏覽器驗證：資料來源頁顯示代表性官方來源地圖；點擊「獲取最新缺失」成功從 GOV.UK/MCA 抓取並累積案例；Excel 匯出無控制台錯誤。

## 證據邊界

部分官方月報只公開滯留缺失摘要，例如 `Not as required`。App 會保留原文和來源 URL，但不會把摘要擴寫成未經來源支持的現場細節。真正完整卷宗仍應優先接入 PSC Form A/B、detention notice、release notice、官方 Caught in the Net case report 或 FOIA/資料申請文件。
