// Paste this whole block into the DevTools Console on the drillplot
// editor page (https://maikuru.github.io/drillplot/), after starting
// save-server.py on the machine that holds this repo.
//
// Change BASE below to that machine's LAN IP (and port, if you changed
// it in save-server.py) before pasting.
(() => {
  const BASE = 'http://10.66.129.108:8799';
  const editor = document.querySelector('drillplot-editor');
  if (!editor) { console.error('drillplot: 找不到 <drillplot-editor> 元素'); return; }

  let currentFile = null;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;background:#fff;border:1px solid #888;padding:8px;font:12px sans-serif;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
  panel.innerHTML = `
    <div style="margin-bottom:4px">本機檔案橋接</div>
    <select id="dp-file" style="width:160px"></select>
    <button id="dp-load" type="button">載入</button>
    <div id="dp-status" style="margin-top:4px;color:#555"></div>
  `;
  document.body.appendChild(panel);

  const sel = panel.querySelector('#dp-file');
  const status = panel.querySelector('#dp-status');

  async function refreshList() {
    const r = await fetch(`${BASE}/list`);
    const { files } = await r.json();
    sel.innerHTML = files.map(f => `<option value="${f}">${f}</option>`).join('');
  }

  panel.querySelector('#dp-load').addEventListener('click', async () => {
    const name = sel.value;
    if (!name) return;
    status.textContent = `載入 ${name} ...`;
    try {
      const r = await fetch(`${BASE}/file?name=${encodeURIComponent(name)}`);
      const svg = await r.text();
      const res = editor.load(svg);
      if (res && res.ok === false) {
        status.textContent = `載入失敗：${JSON.stringify(res.errors)}`;
        return;
      }
      currentFile = name;
      status.textContent = `已載入 ${name}，Save 會存回這個檔案`;
    } catch (e) {
      status.textContent = `載入失敗：${e}`;
    }
  });

  editor.addEventListener('save', async (e) => {
    const svg = e.detail.svg;
    const url = currentFile ? `${BASE}/file?name=${encodeURIComponent(currentFile)}` : BASE + '/';
    status.textContent = '儲存中...';
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: svg
      });
      const data = await r.json();
      status.textContent = data.ok ? `已存到 ${data.path}` : `存檔失敗：${JSON.stringify(data)}`;
    } catch (err) {
      status.textContent = `存檔失敗（可能被瀏覽器擋 mixed content）：${err}`;
    }
  });

  refreshList();
  console.log('drillplot 本機橋接已掛載。選檔案按「載入」開始編輯，Ctrl/Cmd+S 或按 Save 會存回原檔。');
})();
