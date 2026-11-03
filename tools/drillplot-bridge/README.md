# drillplot 存檔橋接

[drillplot 線上編輯器](https://maikuru.github.io/drillplot/)本身的 Save／Get SVG
只會把 SVG 準備好給你複製，不會寫檔。這兩個檔案讓它直接讀寫這個 repo 裡
`assets/diagrams/` 的 svg，省去手動複製貼上。

## 用法

1. 在這台放 repo 的機器上跑：`python3 tools/drillplot-bridge/save-server.py`
   （預設監聽 `0.0.0.0:8799`）
2. 打開 drillplot 頁面 → F12 開 DevTools → Console → 貼上
   `console-bridge.js` 的內容（先把裡面的 `BASE` 改成上面那台機器目前的
   IP，跟 save-server.py 不同機器時尤其要改）
3. 右上角會冒出一個小面板：下拉選檔案 →「載入」→ 編輯 → Save（或
   Ctrl/Cmd+S）就會直接存回對應的 `drill-XX.svg`

存檔是直接覆寫，檔案都在 git 版控下，存壞了 `git checkout` 就能復原。

跨機器（LAN 上另一台電腦開瀏覽器）用的話要注意：
- drillplot 頁面是 https，fetch 打內網 http IP 屬於 mixed content，少數瀏覽器/情境可能被擋
- `save-server.py` 只認 `drill-<數字>.svg` 這個檔名格式，其他一律拒絕（防止路徑穿越）
