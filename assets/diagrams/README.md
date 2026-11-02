# 手繪訓練圖（drillplot）

對於現有 `a`/`b`/`ball`/`move` 四個欄位畫不出來的情境（雙打邊線站位、三人以上、要標號的連續球路），用
[drillplot 線上編輯器](https://maikuru.github.io/drillplot/) 手動畫，再把匯出的 SVG 存到這個資料夾。

## 流程

1. 打開 <https://maikuru.github.io/drillplot/>
2. 用左側調色盤放球員（A~D＋教練）、錐筒、發球機、目標區，畫球路／移動箭頭
3. 右上「Get SVG」→「Copy SVG」
4. 存成這個資料夾裡的檔案，命名 `drill-<id>.svg`（`<id>` 對應 `content/drills.yaml` 裡的訓練項目編號）
5. 到 `content/drills.yaml` 該訓練項目底下加一行：
   ```yaml
   diagram_file: diagrams/drill-08.svg
   ```
   有這個欄位時會蓋過原本自動產生的 `diagram:` 簡易圖；`diagram:` 欄位可以留著不用刪。
6. `python3 build.py --output-dir /tmp/check` 本機確認圖有正常顯示

匯出的 SVG 本身帶著原始資料（存在 `<metadata>` 裡），之後要修改，直接把這個檔案的內容貼回編輯器的「Open from source」就能繼續編輯。
