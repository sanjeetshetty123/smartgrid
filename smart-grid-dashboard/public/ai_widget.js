/* =====================================================================
 * GridMind - AI Assistant floating widget
 * ---------------------------------------------------------------------
 * Drop-in for your existing React dashboard. Adds a floating "Ask AI"
 * bubble (bottom-right) that opens a chat panel talking to ai_brain.py.
 *
 * It does NOT touch your React components or build. It just injects a
 * button + panel into the page and calls http://localhost:5005.
 *
 * HOW TO ADD (2 steps):
 *   1. Put this file in:   smart-grid-dashboard/public/ai_widget.js
 *   2. In smart-grid-dashboard/public/index.html, add this ONE line
 *      just before the closing </body> tag:
 *          <script src="%PUBLIC_URL%/ai_widget.js"></script>
 *   3. (ai_brain.py must be running on port 5005.)
 * ===================================================================== */
(function () {
  const API = "http://localhost:5005";

  // ---- styles ----
  // Matches the dashboard's own visual language (see App.js / AgentForecastPanels.js):
  // near-black glass panels, amber "healthy grid" accent, red for anomalies,
  // uppercase tracked monospace labels, soft glow borders.
  const css = `
  @keyframes aiw-pulse{0%{box-shadow:0 0 0 0 rgba(234,179,8,.45),0 8px 28px rgba(0,0,0,.55)}
    70%{box-shadow:0 0 0 14px rgba(234,179,8,0),0 8px 28px rgba(0,0,0,.55)}
    100%{box-shadow:0 0 0 0 rgba(234,179,8,0),0 8px 28px rgba(0,0,0,.55)}}
  @keyframes aiw-pulse-alert{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55),0 8px 28px rgba(0,0,0,.55)}
    70%{box-shadow:0 0 0 16px rgba(239,68,68,0),0 8px 28px rgba(0,0,0,.55)}
    100%{box-shadow:0 0 0 0 rgba(239,68,68,0),0 8px 28px rgba(0,0,0,.55)}}
  @keyframes aiw-rise{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}

  #aiw-btn{position:fixed;right:22px;bottom:22px;width:58px;height:58px;
    border-radius:50%;background:radial-gradient(circle at 32% 28%,#fde68a,#eab308 60%,#92650a);
    color:#1a1203;border:1px solid rgba(234,179,8,.6);
    font-size:24px;cursor:pointer;z-index:99999;
    display:flex;align-items:center;justify-content:center;
    animation:aiw-pulse 2.6s ease-out infinite;
    transition:transform .15s ease}
  #aiw-btn:hover{transform:scale(1.08)}
  #aiw-btn.aiw-alert{background:radial-gradient(circle at 32% 28%,#fecaca,#ef4444 60%,#7f1d1d);
    border-color:rgba(239,68,68,.65);color:#2a0a0a;animation:aiw-pulse-alert 1.4s ease-out infinite}

  #aiw-panel{position:fixed;right:22px;bottom:92px;width:360px;height:530px;
    background:rgba(5,6,8,.86);border:1px solid rgba(255,255,255,.1);border-radius:18px;
    display:none;flex-direction:column;overflow:hidden;z-index:99999;
    backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
    box-shadow:0 0 44px rgba(234,179,8,.10),0 20px 50px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.05);
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  #aiw-panel.open{display:flex;animation:aiw-rise .28s cubic-bezier(.22,1,.36,1)}
  #aiw-panel::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;
    background:linear-gradient(90deg,transparent,rgba(234,179,8,.5),transparent)}

  #aiw-head{position:relative;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.1);
    color:rgba(255,255,255,.88);font-weight:800;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
    display:flex;justify-content:space-between;align-items:center;
    text-shadow:0 0 18px rgba(234,179,8,.35)}
  #aiw-head .live{font-size:10px;letter-spacing:.08em;color:#fde68a;font-weight:700;
    border:1px solid rgba(234,179,8,.4);background:rgba(234,179,8,.08);
    border-radius:999px;padding:3px 9px;margin-left:10px;text-transform:none}
  #aiw-head .live.aiw-alert{color:#fca5a5;border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.1)}
  #aiw-x{cursor:pointer;color:rgba(255,255,255,.4);font-size:16px;background:none;border:none;
    transition:color .15s}
  #aiw-x:hover{color:rgba(255,255,255,.85)}

  #aiw-chat{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
  .aiw-msg{max-width:84%;padding:10px 13px;border-radius:12px;font-size:12.5px;line-height:1.55}
  .aiw-me{align-self:flex-end;background:linear-gradient(135deg,#fde68a,#eab308);
    color:#1a1203;font-weight:600}
  .aiw-ai{align-self:flex-start;background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.82)}

  #aiw-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 10px}
  .aiw-chip{font-size:10.5px;letter-spacing:.02em;color:#fde68a;
    border:1px solid rgba(234,179,8,.3);border-radius:999px;
    padding:5px 10px;cursor:pointer;background:rgba(234,179,8,.06);
    transition:background .15s,border-color .15s}
  .aiw-chip:hover{background:rgba(234,179,8,.14);border-color:rgba(234,179,8,.55)}

  #aiw-bar{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.1);
    background:rgba(255,255,255,.02)}
  #aiw-q{flex:1;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);border-radius:9px;
    padding:9px 11px;color:rgba(255,255,255,.9);font-size:12.5px;outline:none;
    font-family:inherit;transition:border-color .15s}
  #aiw-q:focus{border-color:rgba(234,179,8,.55)}
  #aiw-send{background:linear-gradient(135deg,#fde68a,#eab308);border:none;border-radius:9px;
    padding:0 16px;color:#1a1203;font-weight:800;font-size:12px;letter-spacing:.04em;
    text-transform:uppercase;cursor:pointer;transition:filter .15s}
  #aiw-send:hover{filter:brightness(1.08)}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- DOM ----
  const btn = document.createElement("button");
  btn.id = "aiw-btn"; btn.title = "Ask the AI assistant"; btn.innerHTML = "⚡";

  const panel = document.createElement("div");
  panel.id = "aiw-panel";
  panel.innerHTML = `
    <div id="aiw-head">
      <div>⚡ AI Assistant <span class="live" id="aiw-live"></span></div>
      <button id="aiw-x">✕</button>
    </div>
    <div id="aiw-chat">
      <div class="aiw-msg aiw-ai">Hi! I can see your home's live power. Ask me anything.</div>
    </div>
    <div id="aiw-chips">
      <div class="aiw-chip">Why is my power high right now?</div>
      <div class="aiw-chip">How can I reduce my bill?</div>
      <div class="aiw-chip">Explain the last alert</div>
    </div>
    <div id="aiw-bar">
      <input id="aiw-q" placeholder="Ask about your energy...">
      <button id="aiw-send">Send</button>
    </div>`;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  // ---- behaviour ----
  const chat = panel.querySelector("#aiw-chat");
  const input = panel.querySelector("#aiw-q");

  btn.onclick = () => panel.classList.toggle("open");
  panel.querySelector("#aiw-x").onclick = () => panel.classList.remove("open");

  function add(text, who) {
    const m = document.createElement("div");
    m.className = "aiw-msg " + (who === "me" ? "aiw-me" : "aiw-ai");
    m.textContent = text;
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
    return m;
  }

  async function send(text) {
    const t = (text || input.value).trim();
    if (!t) return;
    input.value = "";
    add(t, "me");
    const w = add("…", "ai");
    try {
      const r = await fetch(API + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t }),
      });
      const d = await r.json();
      w.textContent = d.reply;
    } catch (e) {
      w.textContent = "Can't reach the AI brain. Is ai_brain.py running on port 5005?";
    }
  }

  panel.querySelector("#aiw-send").onclick = () => send();
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  panel.querySelectorAll(".aiw-chip").forEach((c) =>
    c.addEventListener("click", () => send(c.textContent)));

  // live power in the header
  async function poll() {
    try {
      const r = await fetch(API + "/state");
      const d = await r.json();
      const p = d.live.total_power;
      const live = panel.querySelector("#aiw-live");
      if (p != null) live.textContent = p + " W";
      const anomaly = !!d.live.is_anomaly;
      live.classList.toggle("aiw-alert", anomaly);
      btn.classList.toggle("aiw-alert", anomaly);
    } catch (e) {}
  }
  setInterval(poll, 2000); poll();
})();
