export const SCOREBOARD_KEY = "clocktower-leaderboard-v1";
export function cleanScoreEntries(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  return value.filter(e => {
    if (!e || typeof e.id !== "string" || e.id.length > 100 || ids.has(e.id) || !["normal", "practice"].includes(e.mode)) return false;
    if (![e.score, e.wave, e.kills].every(n => Number.isSafeInteger(n) && n >= 0) || (typeof e.date !== "string" || e.date.length > 40 || !Number.isFinite(Date.parse(e.date)))) return false;
    ids.add(e.id); return true;
  }).map(e => ({ id: e.id, mode: e.mode, score: e.score, wave: e.wave, kills: e.kills, date: e.date }))
    .sort((a,b) => b.score-a.score || b.wave-a.wave || b.kills-a.kills || a.date.localeCompare(b.date));
}
export function addScoreEntry(entries, entry) {
  const all = cleanScoreEntries([...entries, entry]);
  return ["normal", "practice"].flatMap(mode => all.filter(e => e.mode === mode).slice(0,20));
}
export function createDemoScores(random = Math.random, now = new Date()) {
  return cleanScoreEntries(Array.from({ length: 20 }, (_, index) => {
    const score = Math.round((8000 + random() * 280000) / 50) * 50;
    const wave = Math.max(1, Math.min(99, Math.floor(score / 3500 + random() * 12)));
    return { id: `demo-${index}`, mode: "normal", score, wave,
      kills: Math.floor(score / 110 + random() * 120),
      date: new Date(now.getTime() - index * 86400000).toISOString() };
  }));
}

export function createScoreboard(doc, storage) {
  let entries = [], storageAvailable = Boolean(storage), currentId = null;
  const recorded = new WeakSet();
  let demoEntries = createDemoScores();
  try { entries = cleanScoreEntries(JSON.parse(storage?.getItem(SCOREBOARD_KEY) || "[]")); } catch { storageAvailable = false; }
  const dialog = doc.createElement("dialog"); dialog.id = "scoreLeaderboard";
  dialog.setAttribute("aria-labelledby", "scoreLeaderboardTitle");
  dialog.innerHTML = `<div class="scoreboard-shell">
    <header class="scoreboard-heading"><div><small>钟塔档案 / HALL OF HUNTERS</small><h2 id="scoreLeaderboardTitle">猎人荣誉榜</h2><p>钟声落幕，战绩留名。</p></div><button type="button" class="scoreboard-close" data-close aria-label="关闭排行榜">×</button></header>
    <div class="scoreboard-toolbar"><div class="scoreboard-tabs" role="group" aria-label="排行榜类型"><button type="button" data-mode="normal">生存战绩<span>普通局</span></button><button type="button" data-mode="practice">演练档案<span>调试局</span></button><button type="button" data-mode="demo">模拟榜<span>随机战绩</span></button></div><button type="button" class="scoreboard-reroll" data-reroll hidden>重新随机 ↻</button><span class="scoreboard-limit">TOP <b>20</b></span></div>
    <div class="scoreboard-podium" aria-label="前三名战绩"></div>
    <div class="scoreboard-vacant" data-empty><div class="scoreboard-empty-seal" aria-hidden="true">Ⅻ<span>Ⅵ</span></div><h3>首席猎人，虚位以待</h3><p>完成一局猎杀，让你的第一份战绩刻上钟塔。</p></div>
    <div class="scoreboard-summary" hidden><div><span>最高得分</span><strong data-best>—</strong></div><div><span>最远抵达</span><strong data-wave>—</strong></div><div><span>已收录战绩</span><strong data-count>—</strong></div></div>
    <div class="scoreboard-list-heading"><h3>战绩档案</h3><span>得分优先 · 同分比较波次与击杀</span></div>
    <div class="scoreboard-scroll"><table><thead><tr><th scope="col">名次</th><th scope="col">猎杀得分</th><th scope="col">抵达波次</th><th scope="col">击杀</th><th scope="col">记录日期</th></tr></thead><tbody></tbody></table></div>
    <footer class="scoreboard-footer"><span class="scoreboard-status-dot" aria-hidden="true"></span><p data-note></p></footer>
  </div>`;
  doc.body.append(dialog);
  const result = doc.createElement("p"); result.id = "scoreRankResult"; result.setAttribute("role", "status");
  doc.querySelector("#restartButton").before(result);
  let mode = new URLSearchParams(globalThis.location?.search ?? "").get("leaderboardDemo") === "1" ? "demo" : "normal";
  function render() {
    dialog.querySelector("[data-note]").textContent = mode === "demo" ? "模拟数据 · 随机生成，仅供预览，不计入真实排行榜" : storageAvailable ? "仅保存在本机浏览器 · 每榜保留最高 20 条记录" : "浏览器无法保存记录，当前排行榜仅在本次页面有效";
    for (const button of dialog.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    dialog.querySelector("[data-reroll]").hidden = mode !== "demo";
    const rows = mode === "demo" ? demoEntries : entries.filter(e => e.mode === mode).slice(0,20), body = dialog.querySelector("tbody"); body.replaceChildren();
    dialog.querySelector("[data-empty]").hidden = rows.length > 0;
    const podium = dialog.querySelector(".scoreboard-podium"); podium.replaceChildren(); podium.hidden = rows.length === 0;
    dialog.querySelector(".scoreboard-summary").hidden = rows.length === 0;
    dialog.querySelector(".scoreboard-list-heading").hidden = rows.length === 0;
    dialog.querySelector(".scoreboard-scroll").hidden = rows.length === 0;
    dialog.querySelector("[data-best]").textContent = rows[0]?.score.toLocaleString("zh-CN") ?? "—";
    dialog.querySelector("[data-wave]").textContent = rows.length ? `第 ${Math.max(...rows.map(e => e.wave))} 波` : "—";
    dialog.querySelector("[data-count]").textContent = `${rows.length} / 20`;
    for (let index = 0; index < 3; index++) {
      const entry = rows[index], card = doc.createElement("article");
      card.className = `scoreboard-podium-card podium-${index + 1}${entry ? "" : " podium-unclaimed"}`;
      card.setAttribute("aria-label", `第 ${index + 1} 名${entry ? "" : "暂无记录"}`);
      const medal = doc.createElement("div"); medal.className = "scoreboard-medal"; medal.setAttribute("aria-hidden", "true");
      const numeral = doc.createElement("span"); numeral.textContent = ["Ⅰ", "Ⅱ", "Ⅲ"][index]; medal.append(numeral); card.append(medal);
      const title = doc.createElement("h3"); title.textContent = ["首席猎人", "银徽猎人", "铜徽猎人"][index]; card.append(title);
      const score = doc.createElement("strong"); score.className = "scoreboard-podium-score"; score.textContent = entry ? entry.score.toLocaleString("zh-CN") : "待留名"; card.append(score);
      const detail = doc.createElement("p"); detail.textContent = entry ? `第 ${entry.wave} 波  /  ${entry.kills} 击杀` : "下一份荣誉，等你赢取"; card.append(detail);
      const ribbon = doc.createElement("span"); ribbon.className = "scoreboard-podium-ribbon"; ribbon.textContent = entry?.id === currentId ? "本局战绩" : entry ? ["最高纪录", "第二名", "第三名"][index] : "席位空缺"; card.append(ribbon);
      podium.append(card);
    }
    rows.forEach((entry,index) => {
      const row = doc.createElement("tr"); if (entry.id === currentId) row.className = "scoreboard-current";
      const date = new Date(entry.date);
      const values = [String(index+1), entry.score.toLocaleString("zh-CN"), String(entry.wave), String(entry.kills), `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`];
      for (const value of values) { const cell = doc.createElement("td"); cell.textContent = value;
        if (row.children.length === 0) { cell.className = "scoreboard-rank"; if (entry.id === currentId) { const tag = doc.createElement("small"); tag.textContent = "本局"; cell.append(tag); } }
        row.append(cell); }
      body.append(row);
    });
  }
  function open() { render(); if (!dialog.open) dialog.showModal(); }
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  for (const button of dialog.querySelectorAll("[data-mode]")) button.addEventListener("click", () => { mode = button.dataset.mode; render(); });
  for (const id of ["startButton", "resumeButton", "restartButton"]) {
    const button = doc.createElement("button"); button.type = "button"; button.className = "text-button scoreboard-open"; button.textContent = "分数排行榜";
    button.addEventListener("click", open); doc.querySelector(`#${id}`).after(button);
  }
  dialog.querySelector("[data-reroll]").addEventListener("click", () => { demoEntries = createDemoScores(); render(); });
  if (mode === "demo") queueMicrotask(open);
  return {
    get isOpen() { return dialog.open; },
    record(game, assisted) {
      if (recorded.has(game)) return;
      recorded.add(game); mode = assisted ? "practice" : "normal";
      const entry = { id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, mode,
        score: Math.max(0, Math.floor(game.score)), wave: Math.max(0, Math.floor(game.wave)), kills: Math.max(0, Math.floor(game.kills)), date: new Date().toISOString() };
      entries = addScoreEntry(entries, entry); currentId = entry.id;
      try { if (!storage) throw Error("storage unavailable"); storage.setItem(SCOREBOARD_KEY, JSON.stringify(entries)); storageAvailable = true; } catch { storageAvailable = false; }
      const rank = entries.filter(e => e.mode === mode).findIndex(e => e.id === currentId) + 1;
      result.textContent = `${assisted ? "调试局" : "普通局"} · ${rank ? `本局排名第 ${rank} 名` : "本局未进入前 20 名"}${storageAvailable ? "" : "（未能持久保存）"}`;
    },
  };
}
