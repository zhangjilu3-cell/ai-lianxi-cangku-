export const TRAINING_DUMMY_TEXTURE_SRC = "/training/scarecrow.png";

export function resetTrainingDamage(dummy) {
  if (!dummy) return;
  dummy.damageStats = { total: 0, hits: 0, last: 0, lastAt: null, source: "", samples: [], bySource: {} };
}

export function createTrainingDummy(id, x, y) {
  const dummy = { id, kind: "zombie", isTrainingDummy: true, x, y, anchorX: x, anchorY: y,
    health: 1000, maxHealth: 1000, radius: 20, speed: 0, damage: 0,
    attackCooldown: 0, shotCooldown: 0, hitFlash: 0, animationTime: 0,
    animationPhase: 0, attackAnimation: 0, hurtAnimation: 0, lastDamageSource: null,
    slowStatuses: [], damageOverTime: [], scoreMultiplier: 0 };
  resetTrainingDamage(dummy);
  return dummy;
}

export function ensureTrainingDummy(game) {
  let dummy = game.enemies.find(enemy => enemy.isTrainingDummy);
  if (!dummy) dummy = createTrainingDummy(game.nextId++, game.player.x + 180, game.player.y - 90);
  game.enemies = [dummy, ...game.enemies.filter(enemy => enemy.isRareButterfly && enemy.health > 0)];
  return dummy;
}

export function recordTrainingDamage(dummy, amount, source, time) {
  if (!dummy?.isTrainingDummy || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(time)) return false;
  const stats = dummy.damageStats;
  stats.total += amount; stats.hits++; stats.last = amount; stats.lastAt = time;
  stats.source = source || "unknown";
  stats.bySource[stats.source] = (stats.bySource[stats.source] ?? 0) + amount;
  stats.samples = stats.samples.filter(sample => sample.time > time - 5);
  stats.samples.push({ amount, time });
  dummy.lastDamageSource = source;
  dummy.hitFlash = 0.12;
  return true;
}

export function trainingDps(dummy, time) {
  const stats = dummy.damageStats;
  stats.samples = stats.samples.filter(sample => sample.time > time - 5 && sample.time <= time);
  return stats.samples.reduce((sum, sample) => sum + sample.amount, 0) / 5;
}

export function createTrainingLab(search, doc) {
  if (new URLSearchParams(search).get("modelLab") !== "1") return null;
  const panel = doc.createElement("aside");panel.id = "trainingDummyPanel";
  panel.style.cssText = "position:fixed;top:112px;left:20px;z-index:35;width:235px;padding:14px;border:1px solid #987aaf;background:#20192beb;color:#eee4f4;font:14px system-ui;border-radius:8px";
  panel.innerHTML = '<strong>稻草人伤害测试 · 不会损毁</strong><div data-damage style="line-height:1.9;margin:10px 0"></div><label><input type="checkbox" data-auto-fire> 设施自动开火</label><div style="margin-top:12px"><button type="button" data-reset>清零统计</button></div><small style="display:block;margin-top:10px">瞄准胸前靶心射击；近 5 秒 DPS 包含持续伤害。设施开火可测试炮台和坦克。</small>';
  doc.body.append(panel);
  return { panel, output: panel.querySelector("[data-damage]"), autoFire: panel.querySelector("[data-auto-fire]"), reset: panel.querySelector("[data-reset]"), lastPaint: -Infinity };
}

export function updateTrainingLab(lab, dummy, time, sourceName) {
  if (!lab || !dummy || time - lab.lastPaint < 0.1) return;
  lab.lastPaint = time;
  const stats = dummy.damageStats;
  lab.output.innerText = `单次伤害：${stats.last.toFixed(1)}\n累计伤害：${stats.total.toFixed(1)}\n近 5 秒 DPS：${trainingDps(dummy, time).toFixed(1)}\n命中次数：${stats.hits}\n最近来源：${sourceName || "—"}`;
}

export function drawTrainingDummy(context, image, dummy, time) {
  if (!image?.naturalWidth) return;
  context.save();context.translate(dummy.x, dummy.y);
  context.fillStyle = "#0006";context.beginPath();context.ellipse(0, 73, 22, 6, 0, 0, Math.PI * 2);context.fill();
  if (dummy.hitFlash > 0) context.filter = "brightness(1.35)";
  context.drawImage(image, -40, -40.5, 80, 120);
  context.filter = "none";context.textAlign = "center";context.font = "bold 13px system-ui";
  context.fillStyle = "#efe5bd";context.fillText("训练稻草人 · ∞", 0, 95);
  if (dummy.damageStats.lastAt !== null && time - dummy.damageStats.lastAt < 1) {
    context.fillStyle = "#ffdf80";context.font = "bold 18px system-ui";
    context.fillText(dummy.damageStats.last.toFixed(1), 0, -59);
  }
  context.restore();
}
