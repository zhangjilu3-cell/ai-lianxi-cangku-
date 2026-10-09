export const SPIKE_TRAP_MIN_WAVE = 31;
export const SPIKE_TRAP_COUNT = 3;
export const SPIKE_TRAP_RADIUS = 36;
export const SPIKE_TRAP_PLAYER_DAMAGE = 18;
export const SPIKE_TRAP_ENEMY_DAMAGE = 45;
export const MUD_TRAP_MIN_WAVE = 41;
export const VINE_TRAP_MIN_WAVE = 51;
export const MUD_SLOW_AMOUNT = 0.55;
export const VINE_BIND_SECONDS = 5;
export const VINE_REARM_SECONDS = 7;

const TERRAIN_CYCLE = 8;
const TERRAIN_TYPES = Object.freeze([
  Object.freeze({ kind: "mud", minWave: MUD_TRAP_MIN_WAVE, count: 2, radius: 104, offset: 0, activeTime: 3 }),
  Object.freeze({ kind: "vine", minWave: VINE_TRAP_MIN_WAVE, count: 2, radius: 44, offset: 4, activeTime: 2 }),
]);

const EDGE_MARGIN = 92;
const PLAYER_CLEARANCE = 128;
const STRUCTURE_CLEARANCE = 94;
const TRAP_SPACING = 128;
const OBSTACLE_PADDING = 18;
const RANDOM_ATTEMPTS = 48;
const PHASES = Object.freeze([
  Object.freeze({ name: "warning", duration: 1 }),
  Object.freeze({ name: "active", duration: 0.5 }),
  Object.freeze({ name: "retracted", duration: 1.5 }),
]);
const SAFE_POINTS = Object.freeze([
  Object.freeze([0.22, 0.5]),
  Object.freeze([0.78, 0.5]),
  Object.freeze([0.5, 0.22]),
  Object.freeze([0.5, 0.78]),
  Object.freeze([0.2, 0.22]),
  Object.freeze([0.8, 0.78]),
  Object.freeze([0.8, 0.22]),
  Object.freeze([0.2, 0.78]),
]);

export function isSpikeTrapWave(wave) {
  return Number.isFinite(wave) && Number.isInteger(wave) && wave >= SPIKE_TRAP_MIN_WAVE;
}

function safeRandom(random) {
  if (typeof random !== "function") return null;
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
}

function isFinitePoint(value) {
  return value !== null && typeof value === "object" &&
    Number.isFinite(value.x) && Number.isFinite(value.y);
}

function clearsObstacle(position, obstacle, radius = SPIKE_TRAP_RADIUS) {
  if (!isFinitePoint(obstacle) || !Number.isFinite(obstacle.rx) || !Number.isFinite(obstacle.ry)) {
    return true;
  }
  const rx = Math.max(0, obstacle.rx) + radius + OBSTACLE_PADDING;
  const ry = Math.max(0, obstacle.ry) + radius + OBSTACLE_PADDING;
  return Math.hypot(
    (position.x - obstacle.x) / rx,
    (position.y - obstacle.y) / ry,
  ) >= 1;
}

function isValidPosition(position, context, accepted, radius = SPIKE_TRAP_RADIUS) {
  if (!isFinitePoint(position)) return false;
  if (
    position.x < Math.max(EDGE_MARGIN, radius + 14) ||
    position.x > context.width - Math.max(EDGE_MARGIN, radius + 14) ||
    position.y < Math.max(EDGE_MARGIN, radius + 14) ||
    position.y > context.height - Math.max(EDGE_MARGIN, radius + 14)
  ) return false;
  const center = { x: context.width / 2, y: context.height / 2 };
  if (Math.hypot(position.x - center.x, position.y - center.y) < PLAYER_CLEARANCE) return false;
  if (
    isFinitePoint(context.player) &&
    Math.hypot(position.x - context.player.x, position.y - context.player.y) < PLAYER_CLEARANCE
  ) return false;
  if (!context.obstacles.every((obstacle) => clearsObstacle(position, obstacle, radius))) return false;
  if (context.structures.some((structure) =>
    isFinitePoint(structure) &&
    Math.hypot(position.x - structure.x, position.y - structure.y) < STRUCTURE_CLEARANCE)) {
    return false;
  }
  return accepted.every((trap) =>
    Math.hypot(position.x - trap.x, position.y - trap.y) >= Math.max(TRAP_SPACING, radius + (trap.radius ?? SPIKE_TRAP_RADIUS) + 38));
}

function collectValidPositions(context, count = SPIKE_TRAP_COUNT, occupied = [], radius = SPIKE_TRAP_RADIUS) {
  const accepted = [];
  const spanX = context.width - EDGE_MARGIN * 2;
  const spanY = context.height - EDGE_MARGIN * 2;
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS && accepted.length < count; attempt += 1) {
    const randomX = safeRandom(context.random);
    const randomY = safeRandom(context.random);
    if (randomX === null || randomY === null) continue;
    const candidate = {
      x: EDGE_MARGIN + randomX * spanX,
      y: EDGE_MARGIN + randomY * spanY,
    };
    if (isValidPosition(candidate, context, [...occupied, ...accepted], radius)) accepted.push({ ...candidate, radius });
  }
  for (const [xRatio, yRatio] of SAFE_POINTS) {
    if (accepted.length >= count) break;
    const candidate = { x: context.width * xRatio, y: context.height * yRatio };
    if (isValidPosition(candidate, context, [...occupied, ...accepted], radius)) accepted.push({ ...candidate, radius });
  }
  return accepted;
}

function phaseStateAtOffset(offset) {
  let remaining = ((offset % 3) + 3) % 3;
  for (const phase of PHASES) {
    if (remaining < phase.duration) {
      return { phase: phase.name, phaseTime: remaining };
    }
    remaining -= phase.duration;
  }
  return { phase: "warning", phaseTime: 0 };
}

export function createSpikeTraps({
  wave,
  width,
  height,
  obstacles = [],
  structures = [],
  player,
  random = Math.random,
  active = false,
  count = SPIKE_TRAP_COUNT,
} = {}) {
  if (
    !isSpikeTrapWave(wave) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= EDGE_MARGIN * 2 ||
    height <= EDGE_MARGIN * 2
  ) return [];
  const context = {
    width,
    height,
    obstacles: Array.isArray(obstacles) ? obstacles : [],
    structures: Array.isArray(structures) ? structures : [],
    player,
    random,
  };
  return collectValidPositions(context, count).map(({ x, y }, index) => {
    const state = active
      ? phaseStateAtOffset(index)
      : { phase: "retracted", phaseTime: 0 };
    return {
      x,
      y,
      radius: SPIKE_TRAP_RADIUS,
      wave,
      armed: Boolean(active),
      phase: state.phase,
      phaseTime: state.phaseTime,
      phaseOffset: index,
      hitIds: new Set(),
    };
  });
}

function normalizeTrap(trap) {
  if (!isFinitePoint(trap)) return null;
  const phase = PHASES.find((entry) => entry.name === trap.phase) ?? PHASES[2];
  const phaseTime = Number.isFinite(trap.phaseTime) && trap.phaseTime >= 0
    ? Math.min(trap.phaseTime, phase.duration)
    : 0;
  return {
    ...trap,
    radius: Number.isFinite(trap.radius) && trap.radius > 0
      ? trap.radius
      : SPIKE_TRAP_RADIUS,
    armed: trap.armed === true,
    phase: phase.name,
    phaseTime,
    hitIds: trap.hitIds instanceof Set ? new Set(trap.hitIds) : new Set(),
  };
}

function enterNextPhase(trap) {
  const index = PHASES.findIndex((entry) => entry.name === trap.phase);
  const next = PHASES[(index + 1) % PHASES.length];
  trap.phase = next.name;
  trap.phaseTime = 0;
  if (next.name === "active") trap.hitIds.clear();
}

export function activateSpikeTraps(traps) {
  if (!Array.isArray(traps)) return [];
  return traps.map((trap) => {
    const safe = normalizeTrap(trap);
    if (!safe) return null;
    const state = phaseStateAtOffset(
      Number.isFinite(safe.phaseOffset) ? safe.phaseOffset : 0,
    );
    safe.armed = true;
    safe.phase = state.phase;
    safe.phaseTime = state.phaseTime;
    safe.hitIds.clear();
    return safe;
  }).filter(Boolean);
}

export function advanceSpikeTrap(trap, dt) {
  const safe = normalizeTrap(trap);
  if (!safe || !safe.armed || !Number.isFinite(dt) || dt <= 0) return safe;
  let remaining = dt;
  while (remaining > 0) {
    const phase = PHASES.find((entry) => entry.name === safe.phase);
    const available = Math.max(0, phase.duration - safe.phaseTime);
    if (available === 0) {
      enterNextPhase(safe);
      continue;
    }
    const step = Math.min(remaining, available);
    safe.phaseTime += step;
    remaining -= step;
    if (safe.phaseTime >= phase.duration) enterNextPhase(safe);
  }
  return safe;
}

function isFiniteCircle(value) {
  return isFinitePoint(value) && Number.isFinite(value.radius) && value.radius >= 0;
}

export function isSpikeTrapTouching(trap, target) {
  if (!isFiniteCircle(trap) || !isFiniteCircle(target) || trap.phase !== "active") {
    return false;
  }
  return Math.hypot(trap.x - target.x, trap.y - target.y) <= trap.radius + target.radius;
}


export function createTerrainTraps({
  wave, width, height, obstacles = [], structures = [], player,
  occupied = [], random = Math.random, active = false, kinds = null,
} = {}) {
  if (!Number.isInteger(wave) || !Number.isFinite(width) || !Number.isFinite(height) ||
      width <= EDGE_MARGIN * 2 || height <= EDGE_MARGIN * 2) return [];
  const context = {
    width, height,
    obstacles: Array.isArray(obstacles) ? obstacles : [],
    structures: Array.isArray(structures) ? structures : [],
    player, random,
  };
  const traps = [];
  for (const type of TERRAIN_TYPES) {
    if (wave < type.minWave) continue;
    const count = Array.isArray(kinds)
      ? kinds.filter((kind) => kind === type.kind).length : type.count;
    if (count === 0) continue;
    const positions = collectValidPositions(context, count, [...occupied, ...traps], type.radius);
    positions.forEach((position, index) => {
      const phaseOffset = type.offset + index * 0.8;
      traps.push({ ...position, kind: type.kind, radius: type.radius, wave,
        armed: Boolean(active), phase: active && (type.kind === "vine" || phaseOffset < type.activeTime) ? "active" : "dormant",
        cycleTime: 0, rearmTime: 0, phaseOffset, activeTime: type.activeTime,
        hitIds: new Set(),
      });
    });
  }
  return traps;
}

export function activateTerrainTraps(traps) {
  if (!Array.isArray(traps)) return [];
  return traps.map((trap) => ({ ...trap, armed: true, cycleTime: 0, rearmTime: 0,
    phase: trap.kind === "vine" || trap.phaseOffset < trap.activeTime ? "active" : "dormant",
    hitIds: new Set() }));
}

export function advanceTerrainTrap(trap, dt) {
  if (!trap || !Number.isFinite(dt) || dt <= 0 || !trap.armed) return trap;
  if (trap.kind === "vine") {
    const rearmTime = Math.max(0, (trap.rearmTime ?? 0) - dt);
    return { ...trap, rearmTime, phase: rearmTime > 0 ? "dormant" : "active" };
  }
  if (trap.kind === "mud") return trap.phase === "active" ? trap : { ...trap, phase: "active" };
  const cycleTime = ((trap.cycleTime + dt) % TERRAIN_CYCLE + TERRAIN_CYCLE) % TERRAIN_CYCLE;
  const phase = (cycleTime + trap.phaseOffset) % TERRAIN_CYCLE < trap.activeTime
    ? "active" : "dormant";
  return { ...trap, cycleTime, phase,
    hitIds: phase === "active" && trap.phase !== "active" ? new Set() : trap.hitIds };
}

export function isTerrainTrapTouching(trap, target) {
  return trap?.armed === true && trap.phase === "active" &&
    isFiniteCircle(trap) && isFiniteCircle(target) &&
    Math.hypot(trap.x - target.x, trap.y - target.y) <= trap.radius + target.radius;
}


export function trapKindsForWave(wave, random = Math.random) {
  if (!isSpikeTrapWave(wave)) return [];
  if (wave === SPIKE_TRAP_MIN_WAVE) return ["spike"];
  if (wave === MUD_TRAP_MIN_WAVE) return ["mud"];
  if (wave === VINE_TRAP_MIN_WAVE) return ["vine"];
  const available = ["spike"];
  if (wave >= MUD_TRAP_MIN_WAVE) available.push("mud");
  if (wave >= VINE_TRAP_MIN_WAVE) available.push("vine");
  const count = (safeRandom(random) ?? 0) < 0.5 ? 1 : 2;
  const chosen = [];
  for (let index = 0; index < count; index += 1) {
    const pool = available.filter((kind) => !chosen.includes(kind));
    const choices = pool.length ? pool : available;
    const roll = safeRandom(random) ?? 0;
    chosen.push(choices[Math.floor(roll * choices.length)]);
  }
  return chosen;
}

export function createWaveTraps(options = {}) {
  const kinds = trapKindsForWave(options.wave, options.random);
  const spikeTraps = createSpikeTraps({
    ...options, count: kinds.filter((kind) => kind === "spike").length,
  });
  const terrainTraps = createTerrainTraps({
    ...options, occupied: spikeTraps,
    kinds: kinds.filter((kind) => kind !== "spike"),
  });
  return { spikeTraps, terrainTraps };
}
