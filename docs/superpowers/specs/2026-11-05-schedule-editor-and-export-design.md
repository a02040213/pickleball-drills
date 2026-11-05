# 課表編輯工具 + 課表文字匯出 設計文件

- 日期：2026-11-05
- 專案：`dev/pico`（匹克球雙人訓練菜單，靜態網站）
- 狀態：待 Willy 核准

## 背景與動機（Why）

`dev/pico` 是一個靜態網站專案：`content/drills.yaml`（課表大全／動作庫）與
`content/sessions.yaml`（單日課表）兩份 YAML，由 `build.py` 轉成
`public/` 底下的靜態頁面，push 到 `main` 後由 GitHub Actions
（`.github/workflows/deploy.yml`）build 一次並部署到 GitHub Pages。

目前新增/調整內容的流程：

1. 新增或修改單日課表、或在動作庫新增一個 drill，都要手動編輯 YAML。
2. 新 drill 如果要畫站位球路示意圖，另外要跑
   `tools/drillplot-bridge/save-server.py`，在
   [drillplot 線上編輯器](https://maikuru.github.io/drillplot/) 開
   DevTools 貼 console 腳本，才能把畫好的 SVG 存回
   `assets/diagrams/`。
3. 改完要自己確認 `build.py` 沒壞、自己 commit/push。

Willy 想要兩個功能，讓上面這套流程更快、更不容易手滑改錯 YAML：

1. 一個工具，可以新增/調整「單日課表」，也可以在「課表大全」新增項目。
2. 看課表的網頁上可以直接「複製文字」，貼到 LINE 記事本分享給球友。

## 目標（Goals）

### 功能 1：`tools/schedule-editor/`（內網本機網頁工具）

一個只在內網（同一台機器的 LAN IP）可連到的本機小網站，取代手動編輯
`content/sessions.yaml` 與 `content/drills.yaml`。涵蓋：

**單日課表管理**
- 列出現有 sessions（date + label）。
- 新增一天：可以從空白開始，也可以「複製現有某天的課表」當模板再改
  （日期、label、warmup、blocks 全部先帶入，再調整）。
- 調整既有某天：換某個 block 用的 drill、改這個 block 的時長、調整
  blocks 的順序（新增/刪除 block），也包含編輯這一天的 label、warmup
  （duration/note）、rotation_note——跟新增時是同一份表單欄位，只是帶入
  既有值。也支援「刪除整天」這個 session。
- 存檔時依 `date` 覆寫或新增進 `sessions.yaml`；如果存檔的日期跟另一筆
  既有 session 撞期（例如複製模板後忘記改日期），要先跳出確認「已經有
  這天的課表，要覆蓋嗎？」，不要無聲覆寫掉。

**課表大全（drills.yaml）新增項目**
- 選現有分類（category），或「新增分類」（填 code／title_zh／title_en／
  focus）。
- 填 title_zh、title_en、method（可新增/刪除多行步驟）、points（可新增/
  刪除多行重點）。
- drill id 自動抓目前最大 id + 1，顯示給 Willy 看，不用手動配號。
- 示意圖：整合 `drillplot-bridge` 的存檔邏輯到同一個工具裡（同一個
  server 多提供等同 `/list`、`/file` GET/POST 的端點，不用額外再跑一個
  save-server.py）。流程是「填完文字欄位、id 配好之後」，按鈕可以同時
  開啟 drillplot 編輯器分頁、並把已經填好這台機器位址的
  `console-bridge.js` 內容複製到剪貼簿；Willy 畫完貼上存檔後，回到表單
  按「重新檢查」確認 `assets/diagrams/drill-<id>.svg` 已經存在，才能把
  這個 drill 存進 `drills.yaml`。

**共用操作列（編輯器畫面上常駐）**
- Test build：執行 `python3 build.py --output-dir public`，把結果（成功
  或錯誤訊息）顯示出來。
- Diff：顯示 `git diff --stat` 加上內容，讓 Willy 看這次改了什麼。
- Commit & Push：只有在「上一次 Test build 通過」之後才可以按。有一個
  commit message 輸入框，預先帶一個依這次改動自動產生的預設文字（例如
  「新增 11/20 課表」或「新增 drill：長丁克對截擊」），Willy 可以直接用
  或自己改了再送出；按下去會把 `content/*.yaml` 與
  `assets/diagrams/*.svg` 加入並用這個 message commit、push 到目前
  分支。

### 功能 2：單日課表頁「複製文字」按鈕

- 在 `schedule/<date>.html` 頁面上加一顆按鈕，純前端用
  `navigator.clipboard.writeText()` 複製一段純文字（GitHub Pages 是靜態
  網站，不需要後端）。
- 文字內容是精簡版，格式大致是：

  ```
  （可設定的 header）
  熱身：... 
  1. 時長｜drill 標題｜一行重點
  2. ...
  （總時長）
  （可設定的 footer）
  ```

  不包含每個 drill 完整的 method 步驟（那是網頁版才有的細節），每個
  block 只取一行「重點」，預設抓該 drill `points` 的第一條。
- header／footer 可以在 `sessions.yaml` 設定：有一組全站預設值，單一
  session 也可以覆寫。
- 目標貼上情境是 LINE 記事本，風格以 emoji + 簡短文字為主，不是
  markdown。
- 這個「複製文字」功能只給單日課表用，課表大全（分類／單一 drill）不用
  支援匯出。

## 非目標（Non-goals）

- 不做帳號登入或多人權限控管 — 單一使用者（Willy），安全模型就是「只有
  內網連得到」，跟現有 `drillplot-bridge/save-server.py` 同等級。
- 不重做現有「程式自動畫示意圖」（`diagram: {a,b,ball,move}`）的渲染邏輯
  — `build.py` 裡那段程式碼不用動。但新增 drill 的表單**只走
  drillplot／SVG 這條路**，不另外做一個「填 a/b/ball/move 參數」的第二
  種流程；真的要用自動畫圖的 drill，還是手動編輯 YAML（這種情況預期很
  少發生，不值得為它多做一條表單路徑）。
- 不要求把 `export_note`（匯出用一行重點）一次補到現有 22 個 drill 上
  — 先用 `points[0]` 當預設，之後覺得哪個讀起來怪再個別補。
- 不處理「在內網以外的地方安全使用這個編輯器」— 設計上就是內網限定，
  不打算做成可以對外曝露也安全的程度。

## 反目標（Anti-goals）— 做出來但不算成功的情況

- 編輯器還是需要看懂 YAML 結構才會用（沒有達到「取代手動編輯」的目的）。
- Commit & Push 按鈕可以在 build 沒過的情況下照樣 push 壞掉的內容。
- 「複製文字」複製出來的是整個網頁內容的文字版（應該是精簡版，不是把
  method 細節整包塞進去）。

## 限制（Constraints）

- 不加新的 Python 套件，沿用 `http.server`（stdlib），跟
  `drillplot-bridge/save-server.py` 現有風格一致。
- `public/` 已經是 `.gitignore` 排除、由 CI 在 push 到 `main` 後重新
  build 一次 — 編輯器裡的「Test build」只是本機健檢，不需要、也不應該
  把 `public/` 加進 commit。
- Commit & Push 只動 `content/*.yaml` 與 `assets/diagrams/*.svg` 這兩類
  檔案。
- 新編輯器的 server 用跟 `drillplot-bridge`（8799）不同的 port（建議
  8800），但內建等同的存檔邏輯，畫圖流程不需要另外手動啟動
  `save-server.py`。
- 示意圖檔名限制沿用現有規則：只接受 `drill-<數字>.svg`，避免路徑穿越。

## 已經決定的「怎麼做」（Willy 的選擇）

- 編輯器做成內網網頁表單（不是 CLI，也不是單純請 Claude 手動改 YAML）。
- 「調整」單日課表＝可以換 drill、改時長、調 blocks 順序。
- 新增一天時要支援「複製現有課表當模板」。
- drill id 自動抓最大值 +1。
- 新 drill 一定要有分類，也要能新增分類。
- 畫示意圖要整合進同一個新增流程，不要是分開的手動步驟。
- 安全模型：內網連得到就好，不需要登入機制。
- Commit & Push 要在編輯器介面上，且要先 Test build 過才能按。
- 匯出目標是 LINE 記事本，emoji + 簡短文字為主。
- 匯出用網頁上的按鈕觸發（前端 clipboard），不是本機 script。
- 匯出內容精簡（時間＋標題＋一行重點），header/footer 可設定。
- 匯出只做單日課表，不含課表大全。

## 留給實作者決定的部分

- 編輯器畫面的實際排版／外觀（個人工具，功能優先於美觀）。
- 表單欄位的確切文案與排列順序。
- 編輯器前端 JS 與本機 Python server 之間的 API 細節（路由、JSON 格式）。
- 匯出純文字樣板的確切格式（emoji 選用、換行方式）— 先給一版合理預設，
  Willy 看過實際輸出後再微調。
- `sessions.yaml` 裡「全站預設 header/footer」要放在哪個 key 下面（例如
  頂層加一個 `export_defaults:`）— 只要是人可以直接編輯的 YAML 即可，
  實作者可以自行決定。
- Blocks 排序的操作方式用上下箭頭按鈕、還是拖拉排序 — 預設建議用上下
  箭頭（不需要額外 JS 套件），除非實作者覺得用 stdlib/純手刻拖拉排序也
  很簡單再做拖拉。
