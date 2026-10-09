import { bossMoveFor } from "./boss-combat.js";

function bossSectorPath(ctx, radius, halfAngle) {
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, -halfAngle, halfAngle); ctx.closePath();
}


const BOSS_PALETTE = { zombie: "#d4bd89", toxic: "#9fdf6a", runner: "#8de5ec", brute: "#dca65f", exploder: "#ff9960", devil: "#c897ff" };

export const BOSS_SKILL_GLYPHS = Object.freeze({
  slash: { lines: [[[5,24],[11,11],[15,6]],[[12,26],[18,12],[22,7]],[[20,25],[25,15],[28,9]]] },
  stomp: { lines: [[[10,5],[18,5],[18,16],[25,19],[25,23],[8,23],[8,15],[10,5]],[[4,27],[12,27],[16,30],[20,27],[28,27]]] },
  ring: { circles: [[16,17,13],[16,17,7]], lines: [[[13,19],[13,12],[19,12],[19,19]],[[14,15],[18,15]]] },
  toxicBurst: { circles: [[7,7,2],[25,9,2]], lines: [[[16,3],[9,14],[9,20],[13,24],[19,24],[23,20],[23,14],[16,3]],[[5,19],[2,23]],[[27,19],[30,23]],[[11,28],[21,28]]] },
  plague: { lines: [[[17,3],[13,10],[13,13],[17,16],[21,13],[21,10],[17,3]],[[4,20],[7,26],[25,26],[28,20]],[[8,20],[24,20]],[[3,29],[29,29]]] },
  spores: { circles: [[16,6,4],[6,24,4],[26,24,4]], lines: [[[13,10],[8,19]],[[10,24],[22,24]],[[24,19],[19,10]]] },
  rush: { lines: [[[10,5],[23,16],[10,27]],[[19,5],[30,16],[19,27]],[[2,11],[10,11]],[[2,21],[10,21]]] },
  feint: { lines: [[[3,25],[12,25],[12,9],[26,9]],[[20,3],[27,9],[20,15]],[[4,15],[8,11],[4,7]]] },
  pounce: { lines: [[[3,24],[6,12],[13,5],[20,7],[27,20]],[[20,17],[27,22],[29,14]],[[19,28],[30,28]]] },
  slam: { lines: [[[6,4],[25,4],[25,13],[6,13],[6,4]],[[13,13],[13,23],[18,23],[18,13]],[[4,27],[11,25],[16,29],[22,25],[28,27]]] },
  fissure: { lines: [[[18,2],[11,11],[20,14],[12,22],[17,24],[13,30]],[[3,12],[8,15],[3,22]],[[27,8],[23,14],[29,20]]] },
  cross: { lines: [[[14,2],[18,10],[14,16],[18,23],[15,30]],[[2,15],[9,12],[16,17],[23,13],[30,16]]] },
  blast: { circles: [[16,16,5]], lines: [[[16,2],[16,7]],[[16,25],[16,30]],[[2,16],[7,16]],[[25,16],[30,16]],[[5,5],[9,9]],[[23,23],[27,27]],[[5,27],[9,23]],[[23,9],[27,5]]] },
  bombard: { circles: [[16,16,10],[16,16,3]], lines: [[[16,1],[16,9]],[[16,23],[16,31]],[[1,16],[9,16]],[[23,16],[31,16]]] },
  meteor: { circles: [[9,22,4],[23,25,3],[21,12,3]], lines: [[[3,3],[7,14]],[[14,2],[18,7]],[[14,10],[21,19]]] },
  barrage: { lines: [[[5,27],[2,21],[6,14],[10,21],[8,27],[5,27]],[[14,23],[11,16],[16,5],[21,16],[18,23],[14,23]],[[24,27],[22,21],[26,14],[30,21],[27,27],[24,27]]] },
  summon: { lines: [[[6,28],[6,12],[11,7],[21,7],[26,12],[26,28]],[[11,27],[11,16],[16,12],[21,16],[21,27]],[[11,7],[7,2]],[[21,7],[25,2]],[[3,30],[29,30]]] },
  orbit: { circles: [[16,16,9],[16,16,3]], lines: [[[4,12],[4,5],[12,5]],[[20,27],[28,27],[28,20]],[[4,5],[9,10]],[[23,22],[28,27]]] },
  volley: { lines: [[[16,28],[3,9]],[[16,28],[16,3]],[[16,28],[29,9]],[[2,15],[3,9],[9,10]],[[11,8],[16,3],[21,8]],[[23,10],[29,9],[30,15]]] },
  charge: { lines: [[[3,13],[20,13],[20,5],[30,16],[20,27],[20,19],[3,19]],[[6,7],[13,7]],[[6,25],[13,25]]] },
});

export function drawBossSkillIcon(ctx, move, x, y, size = 32, color = "#f5e5be") {
  const glyph = BOSS_SKILL_GLYPHS[move];
  if (!glyph || !Number.isFinite(size) || size <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 32, size / 32);
  ctx.strokeStyle = color; ctx.lineWidth = 2.3; ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const points of glyph.lines ?? []) {
    ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.stroke();
  }
  for (const [cx, cy, radius] of glyph.circles ?? []) {
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

export function bossSkillBadgeLayout(boss, canvasWidth = 1600) {
  const width = 200, height = 58;
  const arenaWidth = Number.isFinite(canvasWidth) ? canvasWidth : 1600;
  return { x: Math.max(8, Math.min(arenaWidth - width - 8, boss.x - width / 2)),
    y: Math.max(30, boss.y - Math.max(132, boss.radius * 2 + 48) - height - 8), width, height };
}

export function drawBossSkillBadge(ctx, boss) {
  const state = boss.bossCombat;
  if (!state || !["windup", "active"].includes(state.phase) || !BOSS_SKILL_GLYPHS[state.move]) return;
  const move = bossMoveFor(boss, state.move);
  const color = move.color ?? BOSS_PALETTE[boss.bossArchetype] ?? "#edc283";
  const duration = move[state.phase];
  const progress = Math.max(0, Math.min(1, state.elapsed / duration));
  const fill = state.phase === "active" ? 1 : progress;
  const { x, y, width, height } = bossSkillBadgeLayout(boss, ctx.canvas?.width);
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(width - 7, 0); ctx.lineTo(width, 7);
  ctx.lineTo(width, height - 7); ctx.lineTo(width - 7, height); ctx.lineTo(7, height);
  ctx.lineTo(0, height - 7); ctx.lineTo(0, 7); ctx.closePath();
  ctx.fillStyle = "#111b23f2"; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#26333d"; ctx.fillRect(7, 7, 44, 44);
  ctx.strokeStyle = "#46535c"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(29, 29, 20, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = state.phase === "active" ? "#fff0cb" : color;
  if (fill > 0) { ctx.beginPath(); ctx.arc(29, 29, 20, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2); ctx.stroke(); }
  drawBossSkillIcon(ctx, state.move, 15, 15, 28, color);
  ctx.textAlign = "left"; ctx.font = "bold 17px 'Microsoft YaHei',sans-serif";
  ctx.fillStyle = "#fff3d9"; ctx.fillText(move.name, 62, 23);
  ctx.font = "12px 'Microsoft YaHei',sans-serif";
  ctx.fillStyle = state.phase === "active" ? "#fff0cb" : "#bfcbd2";
  const label = state.phase === "windup" ? `蓄力 · ${Math.max(0, duration - state.elapsed).toFixed(1)}s`
    : "释放中";
  ctx.fillText(label, 62, 40);
  ctx.fillStyle = "#35434e"; ctx.fillRect(62, 47, 126, 3);
  ctx.fillStyle = color; ctx.fillRect(62, 47, 126 * fill, 3);
  ctx.restore();
}

function bossLanePath(ctx, length, radius) {
  ctx.beginPath(); ctx.moveTo(0, -radius); ctx.lineTo(length, -radius);
  ctx.arc(length, 0, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(0, radius); ctx.arc(0, 0, radius, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
}

export function bossWarningProgress(state, move, index = 0) {
  const delay = state.impactTimes?.[index] ?? (move.pattern === "targets" ? index * .34 : move.pattern === "leap" ? move.active : 0);
  const age = state.phase === "windup" ? state.elapsed : move.windup + state.elapsed;
  return Math.max(0, Math.min(1, age / (move.windup + delay)));
}

// Ground motifs share the damage path's clip, including safe annulus centers.
// Animate from combat time only: pausing a cast also pauses its warning.
function drawBossWarningTexture(ctx, boss, move, p, geometry) {
  const kind = boss.bossArchetype;
  const t = boss.bossCombat.elapsed, radius = move.radius;
  const lane = geometry.length !== undefined, length = geometry.length ?? radius * 2;
  const urgency = Math.max(0, (p - .72) / .28);
  const pulse = .5 + .5 * Math.sin(t * (8 + urgency * 12));
  const reach = radius * (.88 - p * .22);
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  ctx.strokeStyle = move.color; ctx.fillStyle = move.color;
  ctx.globalAlpha = .25 + p * .25;
  if (kind === "runner") {
    // Traveling blades show dash direction; contracting brackets mark landings.
    for (let i = 0; i < 6; i++) {
      const flow = (i / 6 + t * .65) % 1;
      const x = lane ? flow * length : (flow - .5) * radius * 2;
      const width = lane ? Math.min(22, radius * .65) : radius * .48;
      ctx.lineWidth = 2 + p * 2; ctx.beginPath();
      ctx.moveTo(x - 18, -width); ctx.lineTo(x, 0); ctx.lineTo(x - 18, width); ctx.stroke();
      ctx.globalAlpha = .08 + p * .12;
      bossFxPolygon(ctx, [[x - 32, -width], [x, 0], [x - 32, width], [x - 20, 0]], move.color);
      ctx.globalAlpha = .25 + p * .25;
    }
    if (!lane) for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      ctx.beginPath(); ctx.arc(0, 0, radius * (1 - p * .55), angle + .12, angle + .62); ctx.stroke();
    }
  } else if (kind === "brute" || kind === "zombie") {
    // Fractures grow toward the strike instead of covering the whole arena at once.
    const count = kind === "brute" ? 6 : 5;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count + .25;
      const growth = .2 + p * .8, inner = move.innerRadius ?? 16;
      const x = lane ? length * (i + .5) / count : Math.cos(angle) * inner;
      const y = lane ? 0 : Math.sin(angle) * inner;
      const dx = lane ? 22 : Math.cos(angle) * (radius - inner) * growth;
      const dy = lane ? (i % 2 ? -1 : 1) * radius * growth : Math.sin(angle) * (radius - inner) * growth;
      for (const [color, width] of [["#201b18", 7], [move.color, 2]]) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + dx * .4 - dy * .14, y + dy * .4 + dx * .14);
        ctx.lineTo(x + dx * .7 + dy * .08, y + dy * .7 - dx * .08);
        ctx.lineTo(x + dx, y + dy); ctx.stroke();
      }
      ctx.fillStyle = kind === "brute" ? "#ffd196" : "#e8d3a5";
      const float = Math.sin(t * 3 + i) * (2 + p * 4);
      bossFxPolygon(ctx, [[x + dx - 5, y + dy - float], [x + dx, y + dy - 8 - float],
        [x + dx + 6, y + dy - 2 - float], [x + dx + 2, y + dy + 3 - float]], ctx.fillStyle);
    }
  } else if (kind === "toxic") {
    // Organic membrane lobes and expanding spore bubbles accompany the vines.
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const r = radius * (.38 + i * .18 + Math.sin(t * 4 + i) * .035);
      ctx.beginPath();
      for (let j = 0; j <= 24; j++) {
        const angle = j * Math.PI / 12;
        const lobe = r * (1 + .09 * Math.sin(angle * 5 + t * 2 + i));
        const x = Math.cos(angle) * lobe, y = Math.sin(angle) * lobe;
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.39996, cycle = (t * .45 + i * .17) % 1;
      const x = Math.cos(angle) * radius * .66, y = Math.sin(angle) * radius * .66;
      ctx.globalAlpha = (.2 + p * .4) * (1 - cycle);
      ctx.beginPath(); ctx.arc(x, y, 3 + cycle * (7 + p * 6), 0, Math.PI * 2); ctx.stroke();
      dot(x - 2, y - 2, 2);
    }
  } else if (kind === "exploder") {
    // A segmented burning fuse surrounds converging embers and a hot core.
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6 + t * .25;
      ctx.globalAlpha = .2 + p * .3 + (i / 12 < p ? .15 : 0);
      ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, radius * .78, angle, angle + .3); ctx.stroke();
      const cycle = (t * (.3 + p * .3) + i / 12) % 1;
      const r = radius * (.18 + (1 - cycle) * .72);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      ctx.lineTo(Math.cos(angle) * (r + 15), Math.sin(angle) * (r + 15)); ctx.stroke();
      ctx.fillStyle = i % 3 ? move.color : "#fff0ba";
      dot(Math.cos(angle) * r, Math.sin(angle) * r, 2 + p * 2);
    }
    ctx.globalAlpha = .15 + p * .35; ctx.fillStyle = "#ffce8c";
    dot(0, 0, 8 + p * 14 + pulse * urgency * 5);
  } else if (kind === "devil") {
    // Counter-rotating ritual circles, hexagram spokes and floating rune diamonds.
    ctx.lineWidth = 2;
    for (let ring = 0; ring < 2; ring++) {
      ctx.beginPath(); ctx.arc(0, 0, radius * (.38 + ring * .3), 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + t * (ring ? -.18 : .3);
        const r = radius * (.38 + ring * .3);
        const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
        const next = angle + Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.cos(next) * r, Math.sin(next) * r); ctx.stroke();
        if (ring) bossFxPolygon(ctx, [[x - 5, y], [x, y - 9], [x + 5, y], [x, y + 9]], move.color);
      }
    }
  }
  // Three inward wave fronts speed up near release; clipped to the exact hit area.
  ctx.strokeStyle = "#fff1ce";
  for (let i = 0; i < 3; i++) {
    const cycle = (t * (.35 + urgency * .45) + i / 3) % 1;
    ctx.globalAlpha = (.05 + p * .12 + urgency * .1) * (1 - cycle);
    ctx.lineWidth = 2 + urgency * 2;
    ctx.beginPath();
    if (lane) { const x = length * cycle; ctx.moveTo(x, -radius); ctx.lineTo(x, radius); }
    else ctx.arc(0, 0, Math.max(2, reach * (1 - cycle)), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBossSkillWarning(ctx, boss, move) {
  const state = boss.bossCombat;
  const strike = state.phase === "active" ? state.strikes : 0;
  const progress = state.phase === "active" && !["target", "targets", "leap"].includes(move.pattern)
    ? Math.max(0, Math.min(1, (state.elapsed - (state.impactTimes?.[strike - 1] ?? 0)) /
      Math.max(.01, (state.impactTimes?.[strike] ?? move.active) - (state.impactTimes?.[strike - 1] ?? 0))))
    : bossWarningProgress(state, move);
  ctx.save();
  ctx.fillStyle = move.color; ctx.strokeStyle = move.color; ctx.lineWidth = 2;
  const paint = (path, geometry = {}, p = progress) => {
    path(); ctx.fillStyle = move.color;
    ctx.globalAlpha = .1 + p * .14; ctx.fill("evenodd");
    ctx.save(); ctx.clip("evenodd");
    drawBossWarningTexture(ctx, boss, move, p, geometry);
    ctx.restore();
    // Canvas save/restore does not restore paths; rebuild before drawing the boundary.
    path();
    const urgency = Math.max(0, (p - .72) / .28);
    const pulse = .5 + .5 * Math.sin(state.elapsed * (8 + urgency * 12));
    ctx.globalAlpha = .12 + urgency * pulse * .15;
    ctx.strokeStyle = move.color; ctx.lineWidth = 12 + urgency * 4; ctx.stroke();
    ctx.globalAlpha = .9; ctx.strokeStyle = "#201c28"; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = move.color; ctx.lineWidth = p > .85 ? 3 : 2; ctx.stroke();
  };
  if (["target", "targets", "leap"].includes(move.pattern)) {
    const marks = move.pattern === "targets" ? state.marks.slice(state.strikes) : state.marks;
    for (const [index, mark] of marks.entries()) {
      const p = bossWarningProgress(state, move, index + (move.pattern === "targets" ? state.strikes : 0));
      ctx.save(); ctx.translate(mark.x, mark.y);
      paint(() => { ctx.beginPath(); ctx.arc(0, 0, move.radius, 0, Math.PI * 2); }, {}, p);
      ctx.restore(); ctx.globalAlpha = .9; ctx.fillStyle = move.color;
      ctx.strokeStyle = "#fff1ce"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(mark.x, mark.y, move.radius, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = move.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mark.x, mark.y, Math.max(4, move.radius * (1 - p)), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mark.x - 10, mark.y); ctx.lineTo(mark.x + 10, mark.y);
      ctx.moveTo(mark.x, mark.y - 10); ctx.lineTo(mark.x, mark.y + 10); ctx.stroke();
      if (move.pattern === "targets") { ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(String(index + state.strikes + 1), mark.x, mark.y - 17); }
    }
    if (move.pattern === "leap") {
      ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(boss.x, boss.y); ctx.lineTo(state.marks[0].x, state.marks[0].y); ctx.stroke();
    }
  } else {
    ctx.translate(boss.x, boss.y); ctx.rotate(state.angle);
    if (["line", "cross", "dash"].includes(move.pattern)) {
      const length = move.pattern === "dash" ? (state.dashLength ?? move.speed * move.active) : move.range;
      for (let i = 0; i < (move.pattern === "cross" ? 4 : 1); i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        paint(() => bossLanePath(ctx, length, move.radius), { length });
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length * progress, 0); ctx.stroke();
        ctx.globalAlpha = .6; ctx.lineWidth = 2; ctx.strokeStyle = "#fff1ce";
        for (let x = 28; x < length - 12; x += 65) {
          const y = Math.min(10, move.radius * .35);
          ctx.beginPath(); ctx.moveTo(x - 9, -y); ctx.lineTo(x, 0); ctx.lineTo(x - 9, y); ctx.stroke();
        }
        ctx.restore();
      }
    } else if (["barrage", "sector"].includes(move.pattern)) {
      paint(() => bossSectorPath(ctx, move.radius, move.halfAngle));
      const count = move.pattern === "sector" ? 3 : (move.count ?? 5);
      for (let i = 0; i < count; i++) {
        const angle = -move.halfAngle + i * move.halfAngle * 2 / (count - 1);
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
        ctx.lineTo(Math.cos(angle) * move.radius, Math.sin(angle) * move.radius); ctx.stroke();
      }
      ctx.strokeStyle = "#fff1ce"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, move.radius, -move.halfAngle, -move.halfAngle + move.halfAngle * 2 * progress); ctx.stroke();
    } else {
      paint(() => {
        ctx.beginPath(); ctx.arc(0, 0, move.radius, 0, Math.PI * 2);
        if (move.innerRadius) { ctx.moveTo(move.innerRadius, 0); ctx.arc(0, 0, move.innerRadius, 0, Math.PI * 2, true); }
      });
      ctx.strokeStyle = "#fff1ce"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, move.radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();
}

function bossFxPolygon(ctx, points, color) {
  ctx.fillStyle = color; ctx.beginPath();
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath(); ctx.fill();
}

export function drawBossVines(ctx, radius, progress, opacity = 1, variant = "plague", warning = false) {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(progress) || !Number.isFinite(opacity)) return;
  const p = Math.max(0, Math.min(1, progress)), alpha = Math.max(0, Math.min(1, opacity));
  if (p === 0 || alpha === 0) return;
  const count = variant === "toxicBurst" ? 6 : variant === "spores" ? 3 : 4;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const growth = Math.max(0, Math.min(1, (p - i * .025) / .8));
    if (!growth) continue;
    const points = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8 * growth;
      const angle = i * Math.PI * 2 / count + (variant === "spores" ? t * 2.4 : Math.sin(t * 5 + i) * .22);
      const reach = radius * (variant === "plague" ? .8 - t * .55 : .12 + t * .7);
      points.push([Math.cos(angle) * reach, Math.sin(angle) * reach * (warning ? 1 : .7) - (warning ? 0 : Math.sin(t * Math.PI) * radius * .24)]);
    }
    for (const [color, width] of warning ? [["#355732", 3], ["#88b95c", 1]]
      : [["#1b3521", 8], ["#4c8a39", 5], ["#b1e66b", 1.5]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); points.forEach(([x, y], j) => j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
    if (warning) continue;
    for (const j of [3, 6]) {
      const [x, y] = points[j], [px, py] = points[j - 1];
      const angle = Math.atan2(y - py, x - px) + (j % 2 ? 1 : -1) * 1.1;
      const size = (variant === "spores" ? 10 : 8) * growth;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      bossFxPolygon(ctx, [[0, 0], [size * .6, -size * .45], [size * 1.5, 0], [size * .6, size * .45]], i % 2 ? "#8dcb53" : "#619d41");
      ctx.strokeStyle = "#d5ee94"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(size * 1.2, 0); ctx.stroke();
      ctx.restore();
    }
    const [x, y] = points.at(-1);
    ctx.fillStyle = variant === "spores" ? "#d2f591" : "#a4df5c";
    ctx.beginPath(); ctx.arc(x, y, (variant === "spores" ? 4 : 2) * growth, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBossVineWarning(ctx, boss, move) {
  const state = boss.bossCombat;
  if (boss.bossArchetype !== "toxic" || !["windup", "active"].includes(state.phase)) return;
  const marks = state.move === "toxicBurst" ? [{ x: boss.x, y: boss.y }]
    : state.move === "spores" ? state.marks.slice(state.strikes) : state.phase === "windup" ? state.marks : [];
  for (const [index, mark] of marks.entries()) {
    ctx.save(); ctx.translate(mark.x, mark.y);
    drawBossVines(ctx, move.radius, bossWarningProgress(state, move, index + (state.move === "spores" ? state.strikes : 0)), .34, state.move, true);
    ctx.restore();
  }
}

function drawBossSignatureEffect(ctx, boss, effect, p, fade) {
  const kind = boss.bossArchetype;
  if (!kind || effect.kind === "rage") return;
  const radius = effect.radius, pulse = Math.sin(p * Math.PI), color = BOSS_PALETTE[kind];
  ctx.save(); ctx.globalAlpha = fade; ctx.strokeStyle = color; ctx.lineWidth = 2;
  if (kind === "zombie") {
    if (effect.kind === "slash") {
      for (let i = 0; i < 3; i++) {
        const r = radius * (.64 + i * .12), sweep = (effect.flip ? -1 : 1) * p * .2;
        ctx.beginPath(); ctx.arc(0, 0, r, -effect.halfAngle + sweep, effect.halfAngle + sweep);
        ctx.arc(0, 0, r - (10 - i * 2) * fade, effect.halfAngle + sweep, -effect.halfAngle + sweep, true);
        ctx.closePath(); ctx.fillStyle = i === 1 ? "#fff1d1" : "#d2af7a"; ctx.fill();
      }
    } else {
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.39996, r = effect.kind === "ring"
          ? effect.innerRadius + (radius - effect.innerRadius) * (.3 + p * .65) : radius * (.35 + p * .6);
        const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .75 - pulse * 24;
        bossFxPolygon(ctx, [[x - 5, y], [x - 3, y - 8 * fade], [x + 5, y - 5 * fade], [x + 7, y + 2]], i % 2 ? "#bea077" : "#746047");
      }
    }
  } else if (kind === "toxic") {
    ctx.globalAlpha = fade * .22; ctx.fillStyle = "#68a536";
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * .4, r = radius * .36;
      ctx.beginPath(); ctx.ellipse(Math.cos(angle) * r, Math.sin(angle) * r * .65, radius * .48, radius * .26, angle, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = fade;
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.39996, r = radius * (.2 + p * .65);
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r * .65 - pulse * (28 + i % 3 * 12);
      ctx.fillStyle = i % 3 ? "#9bd44f" : "#e0f994";
      ctx.beginPath(); ctx.ellipse(x, y, (3 + i % 3) * fade + .5, (6 + i % 3) * fade + .5, angle * .2, 0, Math.PI * 2); ctx.fill();
    }
    drawBossVines(ctx, radius, Math.min(1, p / .4), fade, effect.move ?? "plague");
  } else if (kind === "runner") {
    if (effect.kind === "trail") {
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * 12, reach = 36 + i * 13;
        ctx.globalAlpha = fade * (.48 - i * .09);
        bossFxPolygon(ctx, [[10, y - 3], [-reach, y - 1], [-reach - 18, y + 3], [8, y + 5]], i === 1 ? "#e2ffff" : "#68d5e8");
      }
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.lineWidth = 4 - i; ctx.strokeStyle = i === 0 ? "#ddffff" : color;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * (.45 + p * .5 + i * .06), radius * (.17 + p * .19 + i * .02), 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * radius * .35, Math.sin(angle) * radius * .2);
        ctx.lineTo(Math.cos(angle) * radius * .9, Math.sin(angle) * radius * .5); ctx.stroke();
      }
    }
  } else if (kind === "brute") {
    const line = effect.kind === "line";
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996, r = radius * (.3 + p * .6);
      const x = line ? effect.range * (i + .5) / 9 : Math.cos(angle) * r;
      const baseY = line ? (i % 2 ? -1 : 1) * radius * .5 : Math.sin(angle) * r * .7;
      ctx.strokeStyle = "#39291d"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(line ? x - 10 : 0, 0); ctx.lineTo(x, baseY); ctx.lineTo(x + 9, baseY + 12); ctx.stroke();
      const y = baseY - pulse * (16 + i % 3 * 12), size = (5 + i % 4) * fade;
      bossFxPolygon(ctx, [[x - size, y], [x, y - size * 1.4], [x + size, y - 2], [x + size * .4, y + size]], i % 2 ? "#b99c75" : "#71614d");
      ctx.strokeStyle = "#ffd095"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x, y - size * 1.4); ctx.stroke();
    }
  } else if (kind === "exploder") {
    ctx.globalAlpha = fade * .22; ctx.fillStyle = "#402e2a";
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * .4, r = radius * (.25 + p * .5);
      ctx.beginPath(); ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r * .7 - p * 30, radius * (.17 + p * .13), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = fade * .85;
    const points = Array.from({ length: 24 }, (_, i) => {
      const angle = i * Math.PI / 12, r = radius * (i % 2 ? .3 : .65) * (1 - p * .55);
      return [Math.cos(angle) * r, Math.sin(angle) * r * .85];
    });
    bossFxPolygon(ctx, points, "#ff7c30");
    ctx.globalAlpha = fade; ctx.fillStyle = "#ffe7a0";
    ctx.beginPath(); ctx.arc(0, 0, Math.max(1, radius * .22 * (1 - p)), 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.39996, r = radius * (.4 + p * .5);
      ctx.strokeStyle = i % 2 ? "#ffac53" : "#ffe1a2"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * r * .75, Math.sin(angle) * r * .75);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r - pulse * 16); ctx.stroke();
    }
  } else if (kind === "devil") {
    const summon = effect.kind === "summon", r = summon ? radius * .8 : Math.min(radius * .26, 90);
    ctx.lineWidth = 2; ctx.strokeStyle = "#c989ff";
    for (const factor of [1, .76]) { ctx.beginPath(); ctx.ellipse(0, 0, r * factor, r * .48 * factor, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + p * .8, x = Math.cos(angle) * r, y = Math.sin(angle) * r * .48;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.cos(angle + Math.PI * 2 / 3) * r, Math.sin(angle + Math.PI * 2 / 3) * r * .48); ctx.stroke();
      const rise = (summon ? 55 : 24) * pulse;
      bossFxPolygon(ctx, [[x - 4, y], [x - 7, y - rise * .5], [x + 2, y - rise], [x + 6, y - rise * .3], [x + 4, y]], i % 2 ? "#a96bf1" : "#e5c6ff");
    }
  }
  ctx.restore();
}

export function drawBossCombat(ctx, boss) {
  const state = boss.bossCombat;
  if (!state || boss.health <= 0) return;
  ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (boss.bossName) {
    const top = Math.max(20, boss.y - Math.max(132, boss.radius * 2 + 20));
    ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.font = "bold 15px 'Microsoft YaHei',sans-serif";
    ctx.fillStyle = "#ffe2ad"; ctx.fillText(boss.bossName, boss.x, top);
  }
  if (state.enraged) {
    ctx.strokeStyle = "#ef425d"; ctx.globalAlpha = 0.55; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(boss.x, boss.y, 72, 27, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + boss.animationTime * 0.5;
      ctx.fillStyle = i % 2 ? "#ffcd78" : "#ff5370";
      ctx.fillRect(boss.x + Math.cos(angle) * 70 - 2, boss.y + Math.sin(angle) * 24 - 2, 4, 4);
    }
  }
  const currentMove = state.move ? bossMoveFor(boss, state.move) : null;
  if (currentMove) drawBossVineWarning(ctx, boss, currentMove);
  if (currentMove) {
    const pending = (state.impactTimes?.length ?? 0) > state.strikes;
    if (state.phase === "windup" || (state.phase === "active" && (pending || currentMove.pattern === "leap"))) {
      const pattern = currentMove.pattern ?? ({ slash: "sector", volley: "barrage", charge: "dash" }[state.move] ?? "circle");
      drawBossSkillWarning(ctx, boss, { ...currentMove, pattern,
        color: currentMove.color ?? BOSS_PALETTE[boss.bossArchetype] ?? "#e5bd77" });
      if (state.move === "slam") {
        ctx.save(); ctx.globalAlpha = .38; ctx.lineWidth = 2; ctx.strokeStyle = BOSS_PALETTE.brute;
        ctx.beginPath(); ctx.arc(boss.x, boss.y, 380, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
  }
  if (["windup", "active"].includes(state.phase) && boss.bossArchetype) {
    ctx.save(); ctx.translate(boss.x, boss.y); ctx.strokeStyle = BOSS_PALETTE[boss.bossArchetype];
    ctx.fillStyle = ctx.strokeStyle; ctx.globalAlpha = .65; ctx.lineWidth = 2;
    const age = state.elapsed;
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + age * 2;
      if (boss.bossArchetype === "toxic") {
        ctx.beginPath(); ctx.arc(Math.cos(angle) * 30, -30 - (i * 9 + age * 35) % 65, 3 + i % 3, 0, Math.PI * 2); ctx.stroke();
      } else if (boss.bossArchetype === "runner") {
        ctx.beginPath(); ctx.moveTo(-Math.cos(state.angle) * (20 + i * 5), -8 - i * 4);
        ctx.lineTo(-Math.cos(state.angle) * (40 + i * 7), -8 - i * 4); ctx.stroke();
      } else if (boss.bossArchetype === "devil") {
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 55, Math.sin(angle) * 20 - 50);
        ctx.lineTo(Math.cos(angle + .6) * 55, Math.sin(angle + .6) * 20 - 50); ctx.stroke();
      } else {
        const r = boss.bossArchetype === "exploder" ? 30 + Math.sin(age * 8) * 8 : 45;
        ctx.fillRect(Math.cos(angle) * r, Math.sin(angle) * 15 - (boss.bossArchetype === "brute" ? 70 : 5), 3, 3);
      }
    }
    ctx.restore();
  }
  for (const effect of state.effects) {
    const p = Math.min(1, 1 - effect.life / effect.maxLife), fade = 1 - p;
    ctx.save(); ctx.translate(effect.x, effect.y); ctx.rotate(effect.angle ?? 0);
    ctx.globalAlpha = fade; ctx.strokeStyle = effect.color ?? BOSS_PALETTE[boss.bossArchetype] ?? "#ffb954"; ctx.lineWidth = 9 * fade + 1;
    if (effect.kind === "line") {
      ctx.lineWidth = effect.radius * 2; ctx.globalAlpha = fade * .3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(effect.range, 0); ctx.stroke();
      ctx.globalAlpha = fade; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let i = 1; i <= 9; i++) ctx.lineTo(effect.range * i / 9, i % 2 ? -8 : 8);
      ctx.stroke();
    } else if (effect.kind === "ring") {
      ctx.lineWidth = 4 + fade * 5;
      for (const radius of [effect.innerRadius, effect.radius]) { ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * effect.innerRadius, Math.sin(angle) * effect.innerRadius);
        ctx.lineTo(Math.cos(angle) * effect.radius, Math.sin(angle) * effect.radius); ctx.stroke();
      }
    } else if (effect.kind === "impact") {
      ctx.lineWidth = 5 * fade + 1;
      ctx.beginPath(); ctx.moveTo(-25 * fade, -150 * fade); ctx.lineTo(0, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, effect.radius * (.6 + p * .4), 0, Math.PI * 2); ctx.stroke();
    } else if (effect.kind === "slash") {
      const sweep = effect.flip ? 1 : -1;
      ctx.beginPath(); ctx.arc(0, 0, effect.radius * (0.78 + p * 0.22), -effect.halfAngle + sweep * p * 0.15, effect.halfAngle + sweep * p * 0.15); ctx.stroke();
      ctx.strokeStyle = "#fff1bf"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, effect.radius * 0.9, -effect.halfAngle, effect.halfAngle); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 0, effect.radius * (0.4 + p * 0.7), effect.radius * (effect.kind === "trail" ? 0.28 : 0.65) * (0.4 + p * 0.7), 0, 0, Math.PI * 2); ctx.stroke();
      if (effect.kind === "slam") {
        ctx.strokeStyle = "#ffdb9b"; ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, r = effect.radius * (0.5 + p * 0.5);
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
          ctx.lineTo(Math.cos(a + 0.1) * r * 0.6, Math.sin(a + 0.1) * r * 0.6);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
        }
      }
    }
    drawBossSignatureEffect(ctx, boss, effect, p, fade);
    const count = effect.kind === "trail" ? 5 : 16;
    ctx.fillStyle = effect.color ?? BOSS_PALETTE[boss.bossArchetype] ?? "#ffe4a3";
    for (let i = 0; i < count; i++) {
      const a = effect.kind === "slash" ? -effect.halfAngle + i / (count - 1) * effect.halfAngle * 2 : i * 2.399963;
      const r = effect.radius * (0.5 + p * 0.7) + (i % 3) * 8;
      const size = (2 + i % 3) * fade;
      ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r - Math.sin(p * Math.PI) * 22, size, size);
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawBossShockwave(ctx, wave) {
  const fade = Math.max(0, wave.life / wave.maxLife);
  const radius = wave.radius ?? 20;
  ctx.save();
  for (const [color, width, alpha] of [["#be2846", 18, 0.23], ["#ffb74e", 7, 0.9], ["#fff0bb", 2, 1]]) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = fade * alpha;
    ctx.beginPath(); ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = "#ffd17e";
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.399963, r = radius + 10 + i % 4 * 3;
    const size = (2 + i % 3) * fade;
    ctx.fillRect(wave.x + Math.cos(angle) * r, wave.y + Math.sin(angle) * r, size, size);
  }
  ctx.restore();
}
