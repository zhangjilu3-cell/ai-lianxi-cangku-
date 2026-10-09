
// World-space distance per six-frame walk cycle, response seconds and travel lean.
export const BOSS_LOCOMOTION = Object.freeze({
  zombie: [92, .14, .025], toxic: [78, .18, .018], runner: [126, .09, .055],
  brute: [112, .24, .012], exploder: [82, .2, .02], devil: [102, .15, .03],
});

export function advanceBossLocomotion(boss, dx, dy, dt, controlled = false, frozen = false) {
  if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(dx) || !Number.isFinite(dy) || frozen) return;
  const [stride, response] = BOSS_LOCOMOTION[boss.bossArchetype] ?? BOSS_LOCOMOTION.zombie;
  const gait = boss.bossLocomotion ??= { time: 0, blend: 0, direction: boss.bossFacing ?? 1 };
  const distance = controlled ? 0 : Math.hypot(dx, dy);
  const target = Math.min(1, distance / dt / Math.max(1, boss.speed ?? 100));
  gait.blend += (target - gait.blend) * (1 - Math.exp(-dt / response));
  if (gait.blend < .001) gait.blend = 0;
  if (distance > .0001) {
    gait.time = (gait.time + distance / (stride * (boss.bossScale ?? 1) / 1.8) * .6) % .6;
    if (Math.abs(dx) > .001) gait.direction = dx < 0 ? -1 : 1;
  } else if (!controlled) {
    const offset = gait.time > .3 ? gait.time - .6 : gait.time;
    gait.time = ((offset * Math.exp(-dt / .09)) + .6) % .6;
    if (Math.min(gait.time, .6 - gait.time) < .001) gait.time = 0;
  }
}

function bossTravelPose(boss) {
  const gait = boss.bossLocomotion;
  const amplitude = (BOSS_LOCOMOTION[boss.bossArchetype] ?? BOSS_LOCOMOTION.zombie)[2];
  return { lean: gait ? amplitude * gait.blend * gait.direction : 0, lift: 0, scaleX: 1, scaleY: 1 };
}
const BOSS_MOVE_ORDER = ["slash", "slam", "charge", "summon"];
export const BOSS_MOVES = Object.freeze({
  feint: { name: "侧闪扑杀", windup: .95, active: .45, recovery: 1.05, radius: 65, range: 165, damage: 19, pattern: "leap", color: "#87e5ea", pose: "feint" },
  pounce: { name: "掠空猎杀", windup: 1.5, active: .7, recovery: 1.65, radius: 85, range: 340, damage: 28, pattern: "leap", color: "#b7faff", pose: "leap" },
  spores: { name: "孢子三角阵", windup: 1.65, active: 1.05, recovery: 1.7, radius: 68, range: 380, damage: 8, pattern: "targets", color: "#a0e76c", pose: "cast", gas: true },
  orbit: { name: "旋狱火环", windup: 1.6, active: .4, recovery: 1.6, radius: 560, halfAngle: 2.4, damage: 16, pattern: "barrage", color: "#c69aff", pose: "orbit", bursts: 1, count: 13 },
  stomp: { name: "撼地践踏", windup: 1.1, active: .3, recovery: 1.2, radius: 155, damage: 22, pattern: "circle", color: "#e5bd77", pose: "slam" },
  plague: { name: "腐池投射", windup: 1.45, active: .35, recovery: 1.4, radius: 70, range: 440, damage: 8, pattern: "target", color: "#9cdb65", pose: "cast" },
  rush: { name: "猎杀突进", windup: 1, active: .48, recovery: 1.35, radius: 32, speed: 650, damage: 24, pattern: "dash", color: "#8be4ec", pose: "dash" },
  fissure: { name: "重锤裂地", windup: 1.4, active: .4, recovery: 1.5, radius: 30, range: 360, damage: 28, pattern: "line", color: "#e1aa64", pose: "slam" },
  bombard: { name: "定点爆破", windup: 1.6, active: .35, recovery: 1.5, radius: 100, range: 460, damage: 26, pattern: "target", color: "#ff9b60", pose: "cast" },
  barrage: { name: "三连炎弹", windup: 1.35, active: 1.05, recovery: 1.4, radius: 560, halfAngle: .6, damage: 14, pattern: "barrage", color: "#dca1ff", pose: "cast" },
  ring: { name: "墓土回震", windup: 1.6, active: .35, recovery: 1.5, radius: 235, innerRadius: 110, damage: 26, pattern: "ring", color: "#d4bd89", pose: "slam" },
  cross: { name: "十字裂隙", windup: 1.7, active: .35, recovery: 1.6, radius: 28, range: 290, damage: 28, pattern: "cross", color: "#dca65f", pose: "cast" },
  meteor: { name: "连锁轰炸", windup: 1.9, active: 1.05, recovery: 1.8, radius: 78, range: 480, damage: 30, pattern: "targets", color: "#ffc56f", pose: "slam" },
  toxicBurst: { name: "腐毒喷涌", windup: 1.3, active: 0.4, recovery: 1.5, radius: 164, damage: 8 },
  blast: { name: "蓄压爆破", windup: 1.4, active: 0.4, recovery: 1.6, radius: 244, damage: 32 },
  volley: { name: "恶魔散射", windup: 1.1, active: 0.4, recovery: 1.2, radius: 360, halfAngle: 0.65, damage: 18 },
  slash: { name: "裂地连斩", windup: 0.95, active: 1.05, recovery: 1, radius: 168, halfAngle: 1.05, damage: 22 },
  slam: { name: "震地重砸", windup: 1.2, active: 0.35, recovery: 1.3, radius: 138, damage: 30 },
  charge: { name: "猩红冲锋", windup: 1.15, active: 0.64, recovery: 1.25, radius: 42, speed: 590, damage: 28 },
  summon: { name: "血契召唤", windup: 1.3, active: 0.4, recovery: 1.1, radius: 110, damage: 0 },
});

// [sprite blend frames, movement unlock frames, recovery speed, body deformation gain].
// Skill recovery still gates the next cast; only locomotion unlocks early.
export const BOSS_RECOVERY_KEYS = Object.freeze({
  slash: [12, 16, .65, .65], stomp: [16, 20, .55, .3], ring: [20, 24, .5, .4],
  toxicBurst: [14, 18, .55, .55], plague: [12, 16, .65, .65], spores: [16, 20, .55, .6],
  rush: [10, 14, .75, .5], feint: [9, 12, .8, .5], pounce: [16, 20, .65, .45],
  slam: [22, 28, .4, .45], fissure: [20, 26, .45, .5], cross: [22, 28, .4, .45],
  blast: [18, 24, .5, .5], bombard: [14, 18, .6, .6], meteor: [18, 22, .55, .55],
  barrage: [14, 18, .6, .65], summon: [18, 22, .55, .65], orbit: [18, 22, .6, .6],
});

export function bossRecoveryFor(boss) {
  const state = boss.bossCombat;
  const [blendFrames, unlockFrames, speed, deformation] = BOSS_RECOVERY_KEYS[state?.move] ?? [16, 20, .55, .6];
  const duration = state?.move ? bossMoveFor(boss, state.move).recovery * (state.enraged ? .75 : 1) : 1;
  return { blend: Math.min(blendFrames / 60, duration * .65),
    unlock: Math.min(unlockFrames / 60, duration * .8), speed, deformation };
}

export function bossSpriteLayers(boss) {
  const state = boss.bossCombat;
  if (!state || state.phase === "idle") return [{ action: "walk", time: boss.bossLocomotion?.time ?? boss.animationTime ?? 0, alpha: 1 }];
  if (state.phase === "windup" && state.elapsed < .16) {
    const p = Math.max(0, state.elapsed / .16), alpha = p * p * (3 - 2 * p);
    return [{ action: "walk", time: state.entryWalkTime ?? 0, alpha: 1 - alpha },
      { action: "attack", time: 0, alpha }].filter(layer => layer.alpha > 0);
  }
  if (state.phase !== "recovery") {
    const time = state.phase === "windup"
      ? Math.max(0, (state.elapsed - .16) / (bossMoveFor(boss, state.move).windup - .16)) * .12
      : bossAnimationTime(boss);
    const frame = Math.max(0, Math.min(3, time <= .12 ? time / .12 : time <= .2 ? 1 + (time - .12) / .08 : 2 + (time - .2) / .1));
    const low = Math.floor(frame), fraction = frame - low;
    // Long anticipation uses body motion; limit atlas overlap to 90 ms to avoid
    // holding two silhouettes for most of the warning.
    const window = state.phase === "windup" ? Math.min(1, .09 / Math.max(.01, bossMoveFor(boss, state.move).windup - .16)) : 1;
    const p = Math.max(0, Math.min(1, (fraction - .5) / window + .5));
    const alpha = p * p * (3 - 2 * p);
    return [{ action: "attack", time: (low + .000001) / 12, alpha: 1 - alpha },
      { action: "attack", time: (Math.min(3, low + 1) + .000001) / 12, alpha }].filter(layer => layer.alpha > 0);
  }
  const recovery = bossRecoveryFor(boss);
  const p = Math.max(0, Math.min(1, state.elapsed / recovery.blend));
  const blend = p * p * (3 - 2 * p);
  const layers = [];
  if (blend < 1) layers.push({ action: "attack", time: .3, alpha: 1 - blend });
  if (blend > 0) layers.push({ action: "walk", time: boss.bossLocomotion?.time ?? Math.max(0, state.elapsed - recovery.blend), alpha: blend });
  return layers;
}

export function bossMoveFor(boss, name) {
  return { ...BOSS_MOVES[name], ...boss.bossMoveOverrides?.[name] };
}

export function bossStrikeTimes(boss) {
  const state = boss.bossCombat;
  if (!state?.move) return [];
  const move = bossMoveFor(boss, state.move);
  if (state.move === "charge" || move.pattern === "dash") return [];
  if (move.pattern === "leap") return [move.active];
  const count = state.move === "slash" ? (boss.bossSlashCount ?? 2) + (state.enraged ? 1 : 0)
    : move.pattern === "targets" ? state.marks.length : move.pattern === "barrage" ? (move.bursts ?? 3) : 1;
  return Array.from({ length: count }, (_, i) => {
    const start = i * .34, end = i < count - 1 ? start + .34 : move.active;
    return start + Math.max(0, end - start) * .22;
  });
}

function bossMoveUsable(boss, target, name, arena) {
  const move = bossMoveFor(boss, name), distance = Math.hypot(target.x - boss.x, target.y - boss.y);
  if (name === "summon") return true;
  const reach = move.range ?? (move.speed ? move.speed * move.active + move.radius : move.radius);
  if (distance > reach + (target.radius ?? 16)) return false;
  if (move.pattern === "ring" && distance < move.innerRadius - (target.radius ?? 16)) return false;
  if (!bossPathClear(boss, target, arena.obstacles ?? [], 0)) return false;
  if (name === "charge" || ["dash", "leap"].includes(move.pattern)) {
    const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
    const length = move.pattern === "leap" ? Math.min(distance, move.range) : move.speed * move.active;
    const end = clipBossMotion(boss, { x: boss.x + Math.cos(angle) * length, y: boss.y + Math.sin(angle) * length }, arena);
    if (Math.hypot(end.x - target.x, end.y - target.y) > move.radius + (target.radius ?? 16) && end.blocked) return false;
  }
  return true;
}

export function beginBossMove(boss, target, move, arena = {}) {
  const previous = boss.bossCombat;
  const entryPose = bossAttackPose(boss);
  boss.bossCombat = {
    phase: "windup", move, elapsed: 0, angle: Math.atan2(target.y - boss.y, target.x - boss.x),
    targetX: target.x, targetY: target.y, originX: boss.x, originY: boss.y, nextMove: previous?.nextMove ?? 0,
    enraged: previous?.enraged ?? false, effects: previous?.effects ?? [],
    entryPose, entryWalkTime: boss.bossLocomotion?.time ?? ((boss.animationTime ?? 0) + (boss.animationPhase ?? 0)),
    lastMove: move, repeatWait: 0, strikes: 0, dashHits: new Set(), cooldown: 0, moveCooldowns: previous?.moveCooldowns ?? {},
  };
  const def = bossMoveFor(boss, move);
  boss.bossFacing = Math.cos(boss.bossCombat.angle) < 0 ? -1 : 1;
  boss.bossReposition = null;
  if (boss.bossNavigation) { boss.bossNavigation.goal = null; boss.bossNavigation.cooldown = 0; }
  if (move === "charge" || def.pattern === "dash") {
    const end = clipBossMotion(boss, { x: boss.x + Math.cos(boss.bossCombat.angle) * def.speed * def.active,
      y: boss.y + Math.sin(boss.bossCombat.angle) * def.speed * def.active }, arena);
    boss.bossCombat.dashLength = Math.hypot(end.x - boss.x, end.y - boss.y);
  }
  const distance = Math.hypot(target.x - boss.x, target.y - boss.y);
  const reach = Math.min(distance, def.range ?? distance);
  const landingAngle = move === "feint" ? Math.atan2(target.y - boss.y, target.x - boss.x) : boss.bossCombat.angle;
  const cx = boss.x + Math.cos(landingAngle) * reach;
  const cy = boss.y + Math.sin(landingAngle) * reach;
  boss.bossCombat.marks = def.gas
    ? [0, 1, 2].map(i => ({ x: cx + Math.cos(i * Math.PI * 2 / 3) * 100, y: cy + Math.sin(i * Math.PI * 2 / 3) * 100 }))
    : def.pattern === "targets"
      ? [-1, 0, 1].map(i => ({ x: cx - Math.sin(boss.bossCombat.angle) * i * 190, y: cy + Math.cos(boss.bossCombat.angle) * i * 190 }))
      : [{ x: cx, y: cy }];
  for (const mark of boss.bossCombat.marks) {
    mark.x = Math.max(20, Math.min((arena.width ?? 1600) - 20, mark.x));
    mark.y = Math.max(20, Math.min((arena.height ?? 900) - 20, mark.y));
    if (def.pattern === "leap") Object.assign(mark, clipBossMotion(boss, mark, arena));
  }
  boss.bossCombat.impactTimes = bossStrikeTimes(boss);
  return boss.bossCombat;
}

function bossEffect(state, effect) {
  state.effects.push({ move: state.move, ...effect, life: 0.65, maxLife: 0.65 });
  if (state.effects.length > 10) state.effects.shift();
}

export function updateBossCombat(boss, target, dt, frozen = false, arena = {}) {
  if (boss.health <= 0) { boss.bossCombat = null; return { controlled: true, events: [] }; }
  if (!Number.isFinite(dt) || dt <= 0) return { controlled: frozen || (boss.bossCombat?.phase ?? "idle") !== "idle", events: [] };
  const state = boss.bossCombat ??= { phase: "idle", cooldown: 1.6, nextMove: 0, effects: [], enraged: false };
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter(effect => effect.life > 0);
  const events = [];
  if (boss.bossRageAllowed !== false && !state.enraged && boss.health <= boss.maxHealth * 0.5) {
    state.enraged = true;
    bossEffect(state, { kind: "rage", x: boss.x, y: boss.y, radius: 105, angle: 0 });
    if (state.move) state.impactTimes = bossStrikeTimes(boss);
    events.push({ type: "rage" });
  }
  if (frozen) return { controlled: true, events };
  state.moveCooldowns ??= {};
  for (const name of Object.keys(state.moveCooldowns)) state.moveCooldowns[name] = Math.max(0, state.moveCooldowns[name] - dt);
  if (state.phase === "idle") {
    state.cooldown -= dt;
    if (state.cooldown > 0) return { controlled: false, events };
    const order = boss.bossMoves ?? BOSS_MOVE_ORDER;
    if (!order.length) return { controlled: false, events };
    // Rotate from the last choice, skipping unusable ranges instead of waiting on a melee move.
    const distance = Math.hypot(target.x - boss.x, target.y - boss.y);
    const peers = arena.enemies ?? [];
    const partnerCasting = peers.some(other => other !== boss && other.kind === "boss" && other.health > 0 &&
      ["windup", "active"].includes(other.bossCombat?.phase));
    if (partnerCasting) return { controlled: false, events };
    state.repeatWait = (state.repeatWait ?? 0) + dt;
    let chosen = -1, bestScore = Infinity;
    for (let offset = 0; offset < order.length; offset++) {
      const index = (state.nextMove + offset) % order.length, name = order[index];
      if (state.moveCooldowns[name] > 0 || (boss.bossArchetype && !bossMoveUsable(boss, target, name, arena))) continue;
      const move = bossMoveFor(boss, name);
      const defensive = distance < (boss.radius ?? 16) + (target.radius ?? 16) + 55 &&
        (!move.pattern || move.pattern === "circle") && !["slash", "volley", "summon", "charge"].includes(name);
      if (name === state.lastMove && order.length > 1 && state.repeatWait < 1.2) continue;
      const score = offset * .2 - (defensive ? (state.lastMove ? .1 : .8) : 0) + (name === state.lastMove ? 2 : 0);
      if (score < bestScore) { chosen = index; bestScore = score; }
    }
    if (chosen < 0) return { controlled: false, events };
    const move = order[chosen];
    state.nextMove = (chosen + 1) % order.length;
    beginBossMove(boss, target, move, arena);
    return { controlled: true, events };
  }
  const move = bossMoveFor(boss, state.move);
  const before = state.elapsed;
  state.elapsed += dt;
  if (state.phase === "windup") {
    if (state.elapsed >= move.windup) {
      state.phase = "active"; state.elapsed = 0;
      events.push({ type: "attack" });
    }
    return { controlled: true, events };
  }
  if (state.phase === "active") {
    const hit = { x: boss.x, y: boss.y, angle: state.angle, radius: move.radius, damage: move.damage };
    if (state.move === "charge" || move.pattern === "dash") {
      const duration = Math.max(0, Math.min(dt, move.active - before));
      const x = boss.x, y = boss.y;
      const end = clipBossMotion(boss, { x: boss.x + Math.cos(state.angle) * move.speed * duration,
        y: boss.y + Math.sin(state.angle) * move.speed * duration }, arena);
      boss.x = end.x; boss.y = end.y;
      if (end.blocked) state.elapsed = move.active;
      events.push({ type: "hit", shape: "capsule", displaced: true, ...hit, x, y, endX: boss.x, endY: boss.y, hitIds: state.dashHits });
      if (Math.floor(before / 0.09) !== Math.floor(state.elapsed / 0.09)) bossEffect(state, { kind: "trail", ...hit, radius: 28 });
    } else if (move.pattern === "leap") {
      const p = Math.min(1, state.elapsed / move.active);
      const mark = state.marks[0];
      const end = clipBossMotion(boss, { x: state.originX + (mark.x - state.originX) * p,
        y: state.originY + (mark.y - state.originY) * p }, arena);
      boss.x = end.x; boss.y = end.y;
      if (Math.floor(before / .09) !== Math.floor(state.elapsed / .09) && p < 1) {
        bossEffect(state, { kind: "trail", x: boss.x, y: boss.y - Math.sin(p * Math.PI) * (state.move === "pounce" ? 65 : 15),
          angle: state.angle, radius: 24, color: move.color });
      }
      if (end.blocked || p >= 1) {
        state.elapsed = move.active;
        if (!state.strikes++) {
          events.push({ type: "hit", shape: "circle", ...hit, x: boss.x, y: boss.y });
          bossEffect(state, { kind: "slam", ...hit, x: boss.x, y: boss.y, color: move.color });
        }
      }
    } else if (move.pattern) {
      const count = move.pattern === "barrage" ? (move.bursts ?? 3) : move.pattern === "targets" ? state.marks.length : 1;
      while (state.strikes < count && state.elapsed >= (state.impactTimes ?? bossStrikeTimes(boss))[state.strikes]) {
        const strike = state.strikes++;
        const effect = { ...hit, color: move.color, kind: move.pattern, innerRadius: move.innerRadius, range: move.range };
        if (move.pattern === "barrage") {
          events.push({ type: "volley", ...hit, count: move.count ?? 5, halfAngle: move.halfAngle, color: move.color });
          bossEffect(state, { ...effect, kind: "slash", halfAngle: move.halfAngle, flip: strike % 2 });
        } else if (["target", "targets"].includes(move.pattern)) {
          for (const point of (move.pattern === "targets" ? [state.marks[strike]] : state.marks)) {
            events.push({ type: state.move === "plague" || move.gas ? "gas" : "hit", shape: "circle", ...hit, ...point });
            bossEffect(state, { ...effect, kind: state.move === "plague" || move.gas ? "toxic" : "impact", ...point });
          }
        } else if (["line", "cross"].includes(move.pattern)) {
          const hitIds = new Set();
          for (let i = 0; i < (move.pattern === "cross" ? 4 : 1); i++) {
            const angle = state.angle + i * Math.PI / 2;
            events.push({ type: "hit", shape: "capsule", displaced: false, ...hit, angle,
              endX: boss.x + Math.cos(angle) * move.range, endY: boss.y + Math.sin(angle) * move.range, hitIds });
            bossEffect(state, { ...effect, kind: "line", angle });
          }
        } else {
          events.push({ type: "hit", shape: move.pattern === "ring" ? "ring" : "circle", ...hit, innerRadius: move.innerRadius });
          bossEffect(state, { ...effect, kind: move.pattern === "ring" ? "ring" : "slam" });
        }
      }
    } else if (state.move === "slash") {
      const total = (boss.bossSlashCount ?? 2) + (state.enraged ? 1 : 0);
      while (state.strikes < total && state.elapsed >= (state.impactTimes ?? bossStrikeTimes(boss))[state.strikes]) {
        events.push({ type: "hit", shape: "sector", ...hit, halfAngle: move.halfAngle });
        bossEffect(state, { kind: "slash", ...hit, halfAngle: move.halfAngle, flip: state.strikes % 2 });
        state.strikes++;
      }
    } else if (state.strikes === 0 && state.elapsed >= (state.impactTimes ?? bossStrikeTimes(boss))[0]) {
      state.strikes++;
      if (state.move === "slam") {
        events.push({ type: "hit", shape: "circle", ...hit }, { type: "wave", ...hit });
        bossEffect(state, { kind: "slam", ...hit });
      } else if (state.move === "toxicBurst") {
        events.push({ type: "gas", ...hit });
        bossEffect(state, { kind: "toxic", ...hit });
      } else if (state.move === "blast") {
        events.push({ type: "hit", shape: "circle", ...hit });
        bossEffect(state, { kind: "slam", ...hit });
      } else if (state.move === "volley") {
        events.push({ type: "volley", ...hit, count: state.enraged ? 7 : 5, halfAngle: move.halfAngle });
        bossEffect(state, { kind: "slash", ...hit, halfAngle: move.halfAngle });
      } else {
        events.push({ type: "summon", count: state.enraged ? 4 : 3 });
        bossEffect(state, { kind: "summon", ...hit });
      }
    }
    if (state.elapsed >= move.active) {
      state.moveCooldowns[state.move] = move.recovery * (state.enraged ? .75 : 1) + (state.enraged ? .65 : 1.1) + 1.2;
      state.phase = "recovery"; state.elapsed = 0;
      boss.bossReposition = null;
      if (boss.bossNavigation) { boss.bossNavigation.goal = null; boss.bossNavigation.cooldown = 0; }
    }
  } else {
    const recovery = bossRecoveryFor(boss);
    if (state.elapsed >= move.recovery * (state.enraged ? .75 : 1)) {
      // Keep the walk clock continuous when the skill clock hands control back.
      boss.animationTime = boss.bossLocomotion?.time ?? Math.max(0, state.elapsed - recovery.blend);
      boss.animationPhase = 0;
      state.phase = "idle"; state.cooldown = state.enraged ? .65 : 1.1; state.elapsed = 0;
      return { controlled: false, movementScale: 1, events };
    }
    if (state.elapsed >= recovery.unlock) return { controlled: false, movementScale: recovery.speed, events };
  }
  return { controlled: true, events };
}

export function bossStrikeTouches(hit, target) {
  const radius = target.radius ?? 16;
  if (hit.shape === "capsule") {
    const dx = hit.endX - hit.x, dy = hit.endY - hit.y;
    const length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((target.x - hit.x) * dx + (target.y - hit.y) * dy) / length2)) : 0;
    return Math.hypot(target.x - hit.x - dx * t, target.y - hit.y - dy * t) <= hit.radius + radius;
  }
  const distance = Math.hypot(target.x - hit.x, target.y - hit.y);
  if (distance > hit.radius + radius) return false;
  if (hit.shape === "ring" && distance + radius < hit.innerRadius) return false;
  if (hit.shape !== "sector" || distance <= radius) return true;
  const angle = Math.atan2(target.y - hit.y, target.x - hit.x) - hit.angle;
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= hit.halfAngle + Math.asin(Math.min(1, radius / distance));
}

// Per-move key poses: anticipation, strike, and the start of recovery.
const BOSS_POSE_KEYS = {
  slash: [[-.2, -3, .97, 1.04], [.3, 2, 1.12, .94], [.07, 0, 1.02, .98]],
  stomp: [[-.08, -18, .94, 1.12], [.12, 10, 1.17, .82], [.03, 3, 1.04, .96]],
  ring: [[-.15, -10, 1.08, .9], [.16, 8, 1.2, .8], [.04, 2, 1.06, .95]],
  toxicBurst: [[-.17, -3, 1.2, 1.08], [.22, 4, .92, .9], [.05, 0, 1.04, .97]],
  plague: [[-.24, -8, 1.08, 1.04], [.3, 3, 1.08, .92], [.06, 0, 1, .98]],
  spores: [[-.08, -12, 1.15, 1.1], [.13, -4, 1.03, .93], [.02, -2, 1.02, 1]],
  rush: [[-.22, 6, 1.08, .78], [.36, 0, 1.16, .83], [.15, 3, 1.08, .9]],
  feint: [[-.3, 4, .94, .84], [.27, 0, 1.12, .9], [.1, 5, 1.08, .87]],
  pounce: [[-.12, 9, 1.12, .72], [.2, 0, .96, 1.08], [.12, 9, 1.16, .8]],
  slam: [[-.14, -28, .9, 1.16], [.22, 12, 1.23, .76], [.06, 4, 1.06, .94]],
  fissure: [[-.28, -19, .94, 1.12], [.33, 8, 1.16, .83], [.09, 2, 1.04, .97]],
  cross: [[-.05, -22, 1.1, 1.1], [.08, 11, 1.25, .8], [0, 4, 1.06, .95]],
  blast: [[0, -5, 1.26, 1.18], [-.1, 3, .86, .87], [0, 1, .98, .96]],
  bombard: [[-.19, -13, 1.12, 1.1], [.24, 4, .94, .9], [.03, 1, 1, .98]],
  meteor: [[-.1, -18, 1.2, 1.12], [.18, 5, .92, .9], [.04, 0, 1.02, .98]],
  barrage: [[-.16, -14, 1.04, 1.08], [.2, -7, 1.1, .94], [.03, -5, 1, 1]],
  summon: [[0, -24, 1.12, 1.1], [-.07, -16, 1.2, 1.04], [0, -9, 1.05, 1.02]],
  orbit: [[-.18, -18, .95, 1.15], [.18, -12, 1.15, .97], [.04, -7, 1.03, 1]],
};

function mixBossPose(from, to, progress) {
  const t = progress * progress * (3 - 2 * progress);
  return from.map((value, i) => value + (to[i] - value) * t);
}

export function bossAttackPose(boss) {
  const state = boss.bossCombat;
  if (!state || state.phase === "idle") return bossTravelPose(boss);
  const move = bossMoveFor(boss, state.move);
  if (boss.bossArchetype && BOSS_POSE_KEYS[state.move]) {
    const [ready, impact, settle] = BOSS_POSE_KEYS[state.move];
    const recovery = bossRecoveryFor(boss);
    const duration = move[state.phase] * (state.phase === "recovery" && state.enraged ? .75 : 1);
    const p = Math.max(0, Math.min(1, state.elapsed / duration));
    let pose;
    const direction = Math.cos(state.angle) < 0 ? -1 : 1;
    const entry = state.entryPose ?? { lean: 0, scaleX: 1, scaleY: 1 };
    const travel = bossTravelPose(boss);
    if (state.phase === "windup") pose = mixBossPose([entry.lean * direction, 0, 1, 1], ready, p);
    else if (state.phase === "recovery") pose = mixBossPose(settle, [travel.lean * direction, 0, 1, 1], Math.min(1, state.elapsed / recovery.blend));
    else {
      const repeated = state.move === "slash" || move.pattern === "targets" || move.pattern === "barrage";
      const count = state.move === "slash" ? (boss.bossSlashCount ?? 2) + (state.enraged ? 1 : 0)
        : move.pattern === "targets" ? state.marks.length : (move.bursts ?? 3);
      const cycle = repeated ? Math.min(count - 1, Math.floor(state.elapsed / .34)) : 0;
      const start = cycle * .34, end = repeated && cycle < count - 1 ? start + .34 : move.active;
      const q = Math.max(0, Math.min(1, (state.elapsed - start) / Math.max(.01, end - start)));
      const strike = [...impact];
      if (state.move === "slash" && cycle % 2) strike[0] *= -1;
      const from = cycle ? settle : ready;
      pose = q < .22 ? mixBossPose(from, strike, q / .22) : mixBossPose(strike, settle, (q - .22) / .78);
      if (state.move === "orbit") pose[0] += Math.sin(p * Math.PI * 2) * .22;
    }
    return { lean: pose[0] * (Math.cos(state.angle) < 0 ? -1 : 1), lift: move.pattern === "leap" && state.phase === "active" ? -(Math.sin(p * Math.PI) ** 2) * (state.move === "pounce" ? 65 : 15) : 0, scaleX: 1 + (pose[2] - 1) * recovery.deformation,
      scaleY: 1 + (pose[3] - 1) * recovery.deformation };
  }
  if (move.pose) {
    const progress = Math.min(1, state.elapsed / (move[state.phase] || 1));
    const pulse = Math.sin(progress * Math.PI);
    const direction = Math.cos(state.angle) < 0 ? -1 : 1;
    if (state.phase === "windup") return { lean: -direction * progress * (move.pose === "dash" ? .23 : .1),
      lift: move.pose === "slam" ? -progress * 22 : -pulse * 5, scaleX: 1 + progress * .08, scaleY: 1 - progress * .12 };
    if (state.phase === "active") return { lean: direction * (move.pose === "dash" ? .28 : pulse * .2),
      lift: move.pose === "slam" ? 8 * (1 - progress) : -pulse * 6, scaleX: 1 + pulse * .13, scaleY: 1 - pulse * .13 };
    return { lean: direction * .08 * (1 - progress), lift: 0, scaleX: 1, scaleY: 1 - .06 * (1 - progress) };
  }
  const direction = Math.cos(state.angle) < 0 ? -1 : 1;
  if (state.phase === "windup") {
    const p = Math.min(1, state.elapsed / move.windup);
    return { lean: -direction * p * 0.12, lift: state.move === "slam" ? -p * 15 : 0, scaleX: 1 + p * 0.07, scaleY: 1 - p * 0.08 };
  }
  if (state.phase === "active") {
    const swingProgress = state.move === "slash" ? (state.elapsed % 0.34) / 0.34 : Math.min(1, state.elapsed / move.active);
    const swing = Math.sin(swingProgress * Math.PI);
    return { lean: direction * (state.move === "charge" ? 0.19 : swing * 0.18), lift: state.move === "slam" ? 7 : 0, scaleX: 1 + swing * 0.07, scaleY: 1 - swing * 0.06 };
  }
  const p = Math.max(0, 1 - state.elapsed / move.recovery);
  return { lean: direction * p * 0.08, lift: 0, scaleX: 1, scaleY: 1 - p * 0.05 };
}

// Segment/ellipse intersection is shared by pursuit routing and swept dash clipping.
function bossObstacleEntry(start, end, obstacle, padding) {
  const rx = Math.max(1, obstacle.rx + padding), ry = Math.max(1, obstacle.ry + padding);
  const sx = (start.x - obstacle.x) / rx, sy = (start.y - obstacle.y) / ry;
  const dx = (end.x - start.x) / rx, dy = (end.y - start.y) / ry;
  const a = dx * dx + dy * dy, c = sx * sx + sy * sy - 1;
  if (c < -0.0001) return 0;
  if (a < 1e-12) return null;
  const b = 2 * (sx * dx + sy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

export function bossPathClear(start, end, obstacles = [], padding = 0) {
  return obstacles.every(obstacle => bossObstacleEntry(start, end, obstacle, padding) === null);
}

// A position is accepted only if the full Boss body fits both the arena and
// every obstacle. Never resolve one overlap by creating another wall overlap.
export function findBossFreePosition(boss, requested, arena = {}, clearance = 12) {
  const radius = boss.radius ?? 16, width = arena.width ?? 1600, height = arena.height ?? 900;
  const obstacles = arena.obstacles ?? [], margin = radius + 2;
  if (width <= margin * 2 || height <= margin * 2) return null;
  const clampPoint = point => ({ x: Math.max(margin, Math.min(width - margin, point.x)),
    y: Math.max(margin, Math.min(height - margin, point.y)) });
  const origin = clampPoint(requested);
  const clear = point => bossPathClear(point, point, obstacles, radius + clearance);
  if (clear(origin)) return origin;
  const candidates = [];
  for (const obstacle of obstacles) {
    const rx = obstacle.rx + radius + clearance + 2, ry = obstacle.ry + radius + clearance + 2;
    const angle = Math.atan2((origin.y - obstacle.y) / ry, (origin.x - obstacle.x) / rx);
    for (let i = 0; i < 16; i++) {
      const turn = angle + i * Math.PI / 8;
      const point = clampPoint({ x: obstacle.x + Math.cos(turn) * rx, y: obstacle.y + Math.sin(turn) * ry });
      if (clear(point)) candidates.push(point);
    }
  }
  // Deterministic fallback for overlapping props or props pressed against walls.
  if (!candidates.length) {
    const spacing = Math.max(32, radius);
    const columns = Math.ceil((width - margin * 2) / spacing), rows = Math.ceil((height - margin * 2) / spacing);
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      const point = { x: margin + (width - margin * 2) * x / columns,
        y: margin + (height - margin * 2) * y / rows };
      if (clear(point)) candidates.push(point);
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
  return candidates[0] ?? null;
}

export function resolveBossPosition(boss, arena = {}, clearance = 2) {
  const point = findBossFreePosition(boss, boss, arena, clearance);
  if (!point) return false;
  const dx = point.x - boss.x, dy = point.y - boss.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-7) return false;
  boss.x = point.x; boss.y = point.y;
  if (boss.bossNavigation) boss.bossNavigation.cooldown = 0;
  if (boss.bossCombat && ["windup", "active"].includes(boss.bossCombat.phase)) {
    if (Number.isFinite(boss.bossCombat.originX)) boss.bossCombat.originX += dx;
    if (Number.isFinite(boss.bossCombat.originY)) boss.bossCombat.originY += dy;
  }
  return true;
}

export function chooseBossSpawnPosition(boss, requested, arena = {}) {
  const radius = boss.radius ?? 16, width = arena.width ?? 1600, height = arena.height ?? 900;
  const margin = Math.max(42, radius + 14), obstacles = arena.obstacles ?? [];
  if (width <= margin * 2 || height <= margin * 2) return null;
  const center = findBossFreePosition(boss, { x: width / 2, y: height / 2 }, arena);
  if (!center) return null;
  const candidates = [{ x: Math.max(margin, Math.min(width - margin, requested.x)),
    y: Math.max(margin, Math.min(height - margin, requested.y)) }];
  for (const [span, horizontal] of [[width - margin * 2, true], [height - margin * 2, false]]) {
    const count = Math.ceil(span / 48);
    for (let i = 0; i <= count; i++) {
      const along = margin + span * i / count;
      for (const side of [margin, (horizontal ? height : width) - margin]) {
        candidates.push(horizontal ? { x: along, y: side } : { x: side, y: along });
      }
    }
  }
  candidates.sort((a, b) => Math.hypot(a.x - requested.x, a.y - requested.y) - Math.hypot(b.x - requested.x, b.y - requested.y));
  const peers = (arena.enemies ?? []).filter(peer => peer !== boss && peer.kind === "boss" && peer.health > 0);
  for (const point of candidates) {
    if (!bossPathClear(point, point, obstacles, radius + 12)) continue;
    if (peers.some(peer => Math.hypot(point.x - peer.x, point.y - peer.y) < radius + (peer.radius ?? 16) + 24)) continue;
    if (bossRoute(point, center, obstacles, radius, width, height).length) return point;
  }
  return null;
}

export function clipBossMotion(boss, end, arena = {}) {
  let fraction = 1;
  const padding = boss.radius ?? 16;
  for (const obstacle of arena.obstacles ?? []) {
    const entry = bossObstacleEntry(boss, end, obstacle, padding + 2);
    if (entry !== null) fraction = Math.min(fraction, Math.max(0, entry - .001));
  }
  for (const [axis, limit] of [["x", arena.width], ["y", arena.height]]) {
    if (!Number.isFinite(limit)) continue;
    const delta = end[axis] - boss[axis];
    if (delta > 0 && end[axis] > limit - padding) fraction = Math.min(fraction, Math.max(0, (limit - padding - boss[axis]) / delta));
    if (delta < 0 && end[axis] < padding) fraction = Math.min(fraction, Math.max(0, (padding - boss[axis]) / delta));
  }
  return { x: boss.x + (end.x - boss.x) * fraction, y: boss.y + (end.y - boss.y) * fraction, blocked: fraction < 1 };
}

function bossRoute(start, goal, obstacles, radius, width, height) {
  const padding = radius + 12;
  if (!bossPathClear(start, start, obstacles, padding) || !bossPathClear(goal, goal, obstacles, padding)) return [];
  if (bossPathClear(start, goal, obstacles, padding)) return [goal];
  const nodes = [start, goal];
  for (const obstacle of obstacles) {
    for (const [sx, sy] of [[-1,-1], [0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0]]) {
      const point = { x: obstacle.x + sx * (obstacle.rx + padding + 8), y: obstacle.y + sy * (obstacle.ry + padding + 8) };
      if (point.x >= radius + 2 && point.x <= width - radius - 2 && point.y >= radius + 2 && point.y <= height - radius - 2 &&
          bossPathClear(point, point, obstacles, padding)) nodes.push(point);
    }
  }
  const distances = nodes.map(() => Infinity), parents = nodes.map(() => -1), visited = new Set();
  distances[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current < 0 || distances[i] < distances[current])) current = i;
    if (current < 0 || !Number.isFinite(distances[current])) break;
    if (current === 1) {
      const path = [];
      for (let i = 1; i > 0; i = parents[i]) path.unshift(nodes[i]);
      return path;
    }
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !bossPathClear(nodes[current], nodes[i], obstacles, padding)) continue;
      const length = distances[current] + Math.hypot(nodes[i].x - nodes[current].x, nodes[i].y - nodes[current].y);
      if (length < distances[i]) { distances[i] = length; parents[i] = current; }
    }
  }
  return [];
}

export function steerBoss(boss, target, dt, speed, arena = {}) {
  if (!(dt > 0) || !(speed > 0) || boss.health <= 0) return;
  const radius = boss.radius ?? 16, width = arena.width ?? 1600, height = arena.height ?? 900;
  const obstacles = arena.obstacles ?? [];
  const free = findBossFreePosition(boss, boss, arena);
  if (!free) return;
  if (Math.hypot(free.x - boss.x, free.y - boss.y) > 1e-7) {
    boss.x = free.x; boss.y = free.y;
    if (boss.bossNavigation) boss.bossNavigation.cooldown = 0;
  }
  const distance = Math.hypot(target.x - boss.x, target.y - boss.y);
  const state = boss.bossCombat;
  const reposition = !!state?.lastMove && ["idle", "recovery"].includes(state.phase);
  const nextName = boss.bossMoves?.[state?.nextMove ?? 0];
  const next = nextName ? bossMoveFor(boss, nextName) : null;
  const basePreferred = boss.bossPreferredRange ?? 75;
  const skillReach = next?.range ?? (next?.speed ? next.speed * next.active + next.radius : next?.radius);
  const preferred = reposition && nextName !== "summon" && Number.isFinite(skillReach)
    ? Math.max(radius + (target.radius ?? 16) + 12,
      next.pattern === "ring" ? (next.innerRadius + next.radius) / 2 : Math.min(basePreferred, skillReach * .72))
    : basePreferred;
  const angle = Math.atan2(boss.y - target.y, boss.x - target.x);
  const ranged = preferred > 150;
  // Ranged casters keep space; the hunter flanks while heavy bosses close directly.
  const offset = boss.bossArchetype === "runner" && distance > 170 ? ((boss.id ?? 0) % 2 ? .38 : -.38) : 0;
  const reach = reposition || ranged ? preferred : Math.min(preferred, radius + (target.radius ?? 16) + 8);
  const directions = ranged ? [0, .6, -.6, 1.2, -1.2, Math.PI]
    : [offset, offset + Math.PI / 3, offset - Math.PI / 3, offset + Math.PI / 2,
      offset - Math.PI / 2, offset + Math.PI * 2 / 3, offset - Math.PI * 2 / 3, Math.PI];
  if (reposition) {
    const plan = boss.bossReposition;
    if (!plan || Math.hypot(target.x - plan.targetX, target.y - plan.targetY) > 40) {
      const turn = (boss.id % 2 ? 1 : -1) * (boss.bossArchetype === "runner" ? .95 : .55);
      boss.bossReposition = { angle: angle + turn, targetX: target.x, targetY: target.y };
      if (boss.bossNavigation) { boss.bossNavigation.goal = null; boss.bossNavigation.cooldown = 0; }
    }
  }
  const goalAngle = reposition ? boss.bossReposition.angle : angle;
  const goals = directions.map(turn => ({
    x: Math.max(radius + 3, Math.min(width - radius - 3, target.x + Math.cos(goalAngle + turn) * reach)),
    y: Math.max(radius + 3, Math.min(height - radius - 3, target.y + Math.sin(goalAngle + turn) * reach)),
  }));
  const nearbyBosses = (arena.enemies ?? []).filter(peer => peer !== boss && peer.kind === "boss" && peer.health > 0);
  const crowded = nearbyBosses.some(peer => Math.hypot(peer.x - boss.x, peer.y - boss.y) < radius + (peer.radius ?? 16) + 28);
  if (!reposition && ranged && Math.abs(distance - preferred) < 22 && !crowded && bossPathClear(boss, target, obstacles, 0)) return;
  const score = point => Math.abs(Math.hypot(point.x - target.x, point.y - target.y) - reach) * 4 +
    Math.hypot(point.x - boss.x, point.y - boss.y) * .15 +
    (reposition ? Math.hypot(point.x - (target.x + Math.cos(goalAngle) * reach), point.y - (target.y + Math.sin(goalAngle) * reach)) : 0) +
    (bossPathClear(point, point, obstacles, radius + 12) ? 0 : 1000) +
    (ranged && !bossPathClear(point, target, obstacles, 0) ? 500 : 0) +
    nearbyBosses.reduce((sum, peer) => sum + Math.max(0, radius + (peer.radius ?? 16) + 40 - Math.hypot(point.x - peer.x, point.y - peer.y)) * 3, 0);
  goals.sort((a, b) => score(a) - score(b));
  const nav = boss.bossNavigation ??= { cooldown: 0, path: [] };
  nav.cooldown -= dt;
  const movedTarget = !nav.target || Math.hypot(target.x - nav.target.x, target.y - nav.target.y) > 40;
  const keepGoal = !movedTarget && !crowded && nav.goal &&
    Math.abs(Math.hypot(nav.goal.x - target.x, nav.goal.y - target.y) - reach) < 20 &&
    bossPathClear(nav.goal, nav.goal, obstacles, radius + 12) &&
    nearbyBosses.every(peer => Math.hypot(peer.x - nav.goal.x, peer.y - nav.goal.y) > radius + (peer.radius ?? 16) + 24);
  // Preserve the chosen attack side while traversing a detour. A moving angle
  // must not flip between the top and bottom of the same static prop every tick.
  if (keepGoal) goals.unshift(nav.goal);
  const goal = goals[0];
  const movedGoal = !nav.goal || Math.hypot(goal.x - nav.goal.x, goal.y - nav.goal.y) > 80;
  if (nav.cooldown <= 0 || movedGoal || movedTarget) {
    nav.path = [];
    for (const candidate of goals) {
      const path = bossRoute(boss, candidate, obstacles, radius, width, height);
      if (path.length) { nav.path = path; nav.goal = candidate; break; }
    }
    nav.target = { x: target.x, y: target.y };
    nav.cooldown = .55;
  }
  while (nav.path.length && Math.hypot(nav.path[0].x - boss.x, nav.path[0].y - boss.y) < 6) nav.path.shift();
  let point = nav.path[0];
  if (!point) return;
  let dx = point.x - boss.x, dy = point.y - boss.y;
  for (const peer of arena.enemies ?? []) {
    if (peer === boss || peer.kind !== "boss" || peer.health <= 0) continue;
    const length = Math.hypot(boss.x - peer.x, boss.y - peer.y);
    const gap = radius + (peer.radius ?? 16) + 28;
    if (length < gap) {
      const sign = (boss.id ?? 0) < (peer.id ?? 0) ? -1 : 1;
      dx += length > .01 ? (boss.x - peer.x) / length * (gap - length) : sign * gap;
      dy += length > .01 ? (boss.y - peer.y) / length * (gap - length) : 0;
    }
  }
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const travel = Math.min(length, speed * dt);
  const end = clipBossMotion(boss, { x: boss.x + dx / length * travel, y: boss.y + dy / length * travel }, arena);
  if (Math.abs(end.x - boss.x) > .01) boss.bossFacing = end.x < boss.x ? -1 : 1;
  boss.x = end.x; boss.y = end.y;
  if (end.blocked) nav.cooldown = 0;
}

export function bossAnimationTime(boss) {
  const state = boss.bossCombat;
  if (!state || state.phase === "idle") return boss.bossLocomotion?.time ?? boss.animationTime ?? 0;
  const move = bossMoveFor(boss, state.move);
  if (state.phase === "windup") return Math.min(.12, state.elapsed / move.windup * .12);
  if (state.phase === "recovery") return .3;
  const repeats = state.move === "slash" || move.pattern === "barrage" || move.pattern === "targets";
  const clock = q => q < .22 ? .12 + q / .22 * .08 : .2 + (q - .22) / .78 * .1;
  if (repeats) {
    const times = state.impactTimes ?? bossStrikeTimes(boss);
    const cycle = Math.min(times.length - 1, Math.floor(state.elapsed / .34));
    const start = cycle * .34, end = cycle < times.length - 1 ? start + .34 : move.active;
    const q = Math.max(0, Math.min(1, (state.elapsed - start) / Math.max(.01, end - start)));
    if (cycle > 0 && q < .22) {
      const p = q / .22;
      return .3 - .1 * p * p * (3 - 2 * p);
    }
    return clock(q);
  }
  return clock(Math.min(1, state.elapsed / move.active));
}
