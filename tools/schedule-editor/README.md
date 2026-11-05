# 課表編輯器

內網網頁小工具，取代手動編輯 `content/sessions.yaml`／`content/drills.yaml`，
用來新增/調整單日課表、在課表大全新增訓練項目（含 drillplot 示意圖），
並在同一個畫面上跑 build 健檢、看 diff、commit + push。

## 用法

```bash
python3 tools/schedule-editor/server.py
```

預設監聽 `0.0.0.0:8800`（跟 `tools/drillplot-bridge/` 的 8799 分開）。打開
`http://<這台機器的內網 IP>:8800/` 開始用。

跟 `tools/drillplot-bridge/save-server.py` 一樣，只靠「只有內網連得到」擋存
取，沒有登入機制——同網段的人理論上也連得到這個工具。

## 單日課表

左邊依日期由新到舊列出現有的課表，每筆可以「編輯」（換 drill、改時長、
調順序、改訓練名稱/熱身/輪替說明、刪除整天）或「複製」當模板建立新的
一天（日期預設是現有最新一天往後推 7 天）。存檔時如果日期跟別的課表撞
期，會先跳出確認才覆蓋。

## 課表大全（分類區塊列出現有項目，可新增/編輯/複製）

列表依分類分區塊顯示，每個項目可以「編輯」既有內容，或「複製」當模板
建立新項目（文字欄位帶入、id 跟示意圖都是全新的）。

選現有分類或建立新分類，填中英文標題、簡述（選填——`複製文字`那段會優先
顯示這裡，沒填就退回顯示英文標題）、方法步驟、重點。新增時 id 自動配號
（目前最大值 + 1）。

示意圖編輯器（[drillplot](https://github.com/maikuru/drillplot)）直接內嵌
在頁面裡（`static/vendor/drillplot/`，MIT 授權，從其 GitHub Pages 的
`dist/` 原樣搬過來，同源執行，不用再手動開分頁貼 DevTools 腳本）：

- 新增／複製項目：編輯器一開始是空白畫布，畫完按編輯器內的「存檔示意圖」
  會直接存成 `assets/diagrams/drill-<新 id>.svg`，存成功後外層的「存檔」
  鈕才會打開。
- 編輯既有項目：編輯器會先載入目前的示意圖，畫完按「存檔示意圖」會直接
  覆蓋原本的檔案；這步驟是選填的，純改文字欄位不用管這裡。

`tools/drillplot-bridge/` 是另一個獨立小工具（透過瀏覽器分頁＋DevTools
console 腳本橋接），跟這裡內嵌的編輯器無關，保留著純粹是因為它原本就是
獨立運作的工具，沒有理由拿掉。

## 操作列（畫面下方，兩個分頁共用）

- **Test build**：跑 `python3 build.py --output-dir public` 本機健檢。
- **Diff**：看這次改了 `content/`、`assets/diagrams/` 底下哪些東西。
- **Commit & Push**：只有在最近一次 Test build 通過之後才能按，有訊息輸入
  框（預先帶一個依改動內容產生的預設文字，可以直接用或自己改），按下去
  會把 `content/*.yaml` 與 `assets/diagrams/*.svg` commit 並 push。任何
  一次新增/調整課表或新增 drill 之後，都要重新 Test build 一次才能再按
  Commit & Push。
