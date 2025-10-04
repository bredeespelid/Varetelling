// app.js – strekkode-registrering (kamera + manuelt) m/ localStorage og CSV
(() => {
  const byId = (id) => document.getElementById(id);

  // Forventede elementer i index.html (se seksjon 5)
  const videoEl         = byId('video');
  const deviceSelectEl  = byId('cameraSelect');
  const startBtn        = byId('startScanBtn');
  const stopBtn         = byId('stopScanBtn');
  const manualInput     = byId('manualInput');
  const addBtn          = byId('addBtn');
  const exportBtn       = byId('exportCsvBtn');
  const clearBtn        = byId('clearAllBtn');
  const aggBody         = byId('aggBody');
  const logBody         = byId('logBody');
  const supportNote     = byId('supportNote');

  // Tilstand
  const state = {
    log: [],                 // [{ts, code}]
    agg: Object.create(null) // code -> {count, lastTs}
  };

  // Last evt. tidligere data
  try {
    const saved = JSON.parse(localStorage.getItem('gb_codes') || '{}');
    if (saved.log && saved.agg) { state.log = saved.log; state.agg = saved.agg; }
  } catch {}

  function persist() { localStorage.setItem('gb_codes', JSON.stringify(state)); }
  function nowISO()  { return new Date().toISOString(); }

  function render() {
    // Agg
    aggBody.innerHTML = '';
    const rows = Object.entries(state.agg).sort(([a],[b]) => a.localeCompare(b));
    if (!rows.length) {
      aggBody.innerHTML = `<tr><td colspan="3" class="muted">Ingen registrerte koder.</td></tr>`;
    } else {
      for (const [code, r] of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${code}</td><td>${r.count}</td><td>${new Date(r.lastTs).toLocaleString()}</td>`;
        aggBody.appendChild(tr);
      }
    }
    // Siste 20 i logg
    logBody.innerHTML = '';
    const last = state.log.slice(-20).reverse();
    if (!last.length) {
      logBody.innerHTML = `<tr><td colspan="2" class="muted">Tom logg.</td></tr>`;
    } else {
      for (const e of last) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(e.ts).toLocaleString()}</td><td>${e.code}</td>`;
        logBody.appendChild(tr);
      }
    }
  }

  function registerCode(raw) {
    const code = String(raw || '').trim();
    if (!code) return;
    const ts = nowISO();
    state.log.push({ ts, code });
    if (!state.agg[code]) state.agg[code] = { count: 0, lastTs: ts };
    state.agg[code].count += 1;
    state.agg[code].lastTs = ts;
    try { navigator.vibrate?.(16); } catch {}
    persist(); render();
  }

  // Manuelt
  addBtn?.addEventListener('click', () => {
    registerCode(manualInput.value);
    manualInput.value = '';
    manualInput.focus();
  });
  manualInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
  });

  // CSV-eksport og tøm
  exportBtn?.addEventListener('click', () => {
    const rows = [['timestamp','barcode']];
    state.log.forEach(e => rows.push([e.ts, e.code]));
    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'strekkoder_log.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  clearBtn?.addEventListener('click', () => {
    if (!state.log.length) return;
    if (confirm('Tømme alle registreringer?')) {
      state.log = []; state.agg = Object.create(null);
      persist(); render();
    }
  });

  // Kamera (ZXing)
  const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasMedia) {
    supportNote.textContent = 'Kamera ikke tilgjengelig i denne nettleseren.';
  } else {
    supportNote.textContent = 'Kamera støttes. Husk at HTTPS kreves for tilgang.';
  }

  let codeReader = null;
  let currentDeviceId = null;

  async function listCameras() {
    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    deviceSelectEl.innerHTML = '';
    if (!devices.length) {
      deviceSelectEl.innerHTML = `<option>Ingen kamera funnet</option>`;
      return;
    }
    devices.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Kamera ${i+1}`;
      deviceSelectEl.appendChild(opt);
    });
    // velg bak-kamera om mulig
    const back = devices.find(d => /back|rear|environment/i.test(d.label));
    deviceSelectEl.value = back?.deviceId || devices[0].deviceId;
    currentDeviceId = deviceSelectEl.value;
  }

  deviceSelectEl?.addEventListener('change', () => {
    currentDeviceId = deviceSelectEl.value;
  });

  startBtn?.addEventListener('click', async () => {
    if (!hasMedia) { alert('Kamera ikke tilgjengelig.'); return; }
    if (!currentDeviceId) await listCameras();

    // Stopp ev. tidligere
    stopScan();

    codeReader = new ZXing.BrowserMultiFormatReader();
    try {
      await codeReader.decodeFromVideoDevice(currentDeviceId, videoEl, (result, err, controls) => {
        if (result) {
          registerCode(result.getText());
          // “single-shot”: stopp etter første treff
          stopScan();
        }
      });
    } catch (e) {
      alert('Kunne ikke starte skann. Sjekk HTTPS og kameratilganger.');
      stopScan();
    }
  });

  function stopScan() {
    try { codeReader?.reset(); } catch {}
    try {
      const stream = videoEl?.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
    } catch {}
    videoEl.srcObject = null;
  }
  stopBtn?.addEventListener('click', stopScan);

  // init
  (async () => {
    render();
    if (hasMedia) await listCameras();
  })();

  // Service worker (PWA/offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
