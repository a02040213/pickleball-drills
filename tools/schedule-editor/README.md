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

左邊列出現有的課表，每筆可以「編輯」（換 drill、改時長、調順序、改
label/熱身/輪替說明、刪除整天）或「複製成新的一天」當模板。存檔時如果
日期跟別的課表撞期，會先跳出確認才覆蓋。

## 課表大全（新增訓練項目）

選現有分類或建立新分類，填中英文標題、方法步驟、重點。id 自動配號
（目前最大值 + 1）。示意圖走 drillplot 流程：

1. 按「開啟 drillplot + 複製連動腳本」——會同時打開
   [drillplot 線上編輯器](https://maikuru.github.io/drillplot/)分頁，並把
   已經填好這台機器位址的連動腳本複製到剪貼簿。
2. 在 drillplot 頁面 F12 開 DevTools → Console → 貼上剛剛複製的腳本。
3. 畫完站位球路，Save（或 Ctrl/Cmd+S）會直接存回這個工具管理的
   `assets/diagrams/drill-<id>.svg`。
4. 回到課表編輯器按「重新檢查」，確認圖已經存在，才能按「存檔」。

`tools/drillplot-bridge/` 還是保留著，單純要**修改既有** drill 的示意圖
（不經過這個新增流程）時仍可以用那個獨立的 save-server.py。

## 操作列（畫面下方，兩個分頁共用）

- **Test build**：跑 `python3 build.py --output-dir public` 本機健檢。
- **Diff**：看這次改了 `content/`、`assets/diagrams/` 底下哪些東西。
- **Commit & Push**：只有在最近一次 Test build 通過之後才能按，有訊息輸入
  框（預先帶一個依改動內容產生的預設文字，可以直接用或自己改），按下去
  會把 `content/*.yaml` 與 `assets/diagrams/*.svg` commit 並 push。任何
  一次新增/調整課表或新增 drill 之後，都要重新 Test build 一次才能再按
  Commit & Push。
