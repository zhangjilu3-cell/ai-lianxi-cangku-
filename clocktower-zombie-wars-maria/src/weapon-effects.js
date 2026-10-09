function validTarget(enemy) {
  return (
    enemy !== null &&
    typeof enemy === "object" &&
    enemy.health > 0 &&
    Number.isFinite(enemy.x) &&
    Number.isFinite(enemy.y) &&
    (typeof enemy.id === "string" || Number.isFinite(enemy.id))
  );
}

function bucketKey(x, y, size) {
  return `${Math.floor(x / size)},${Math.floor(y / size)}`;
}

function buildSpatialBuckets(enemies, size) {
  const buckets = new Map();
  for (const enemy of enemies) {
    const key = bucketKey(enemy.x, enemy.y, size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(enemy);
  }
  return buckets;
}

function compareTargetIds(left, right) {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  const textOrder = String(left).localeCompare(String(right));
  if (textOrder !== 0) return textOrder;
  return typeof left === "number" ? -1 : 1;
}

function lightningNoise(seed) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function buildLightningArcGeometry(arc = {}) {
  const x1 = Number.isFinite(arc.x1) ? arc.x1 : 0;
  const y1 = Number.isFinite(arc.y1) ? arc.y1 : 0;
  const x2 = Number.isFinite(arc.x2) ? arc.x2 : x1;
  const y2 = Number.isFinite(arc.y2) ? arc.y2 : y1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const measuredLength = Math.hypot(dx, dy);
  const length = measuredLength || 1;
  const tangentX = dx / length;
  const tangentY = dy / length;
  const normalX = -tangentY;
  const normalY = tangentX;
  const seed = x1 * 0.071 + y1 * 0.113 + x2 * 0.037 + y2 * 0.053;
  const amplitude = Math.min(11, 4 + measuredLength * 0.025);
  const points = [{ x: x1, y: y1 }];

  for (let index = 1; index < 8; index += 1) {
    const ratio = index / 8;
    const jitter = lightningNoise(seed + index * 1.917) * amplitude;
    points.push({
      x: x1 + dx * ratio + normalX * jitter,
      y: y1 + dy * ratio + normalY * jitter,
    });
  }
  points.push({ x: x2, y: y2 });

  const branchCount = Math.max(3, Math.min(7, Math.round(measuredLength / 35)));
  const branches = [];
  for (let index = 0; index < branchCount; index += 1) {
    const anchorIndex = 1 + Math.min(
      6,
      Math.floor(((index + 1) * 7) / (branchCount + 1)),
    );
    const anchor = points[anchorIndex];
    const side = lightningNoise(seed + index * 4.113) >= 0 ? 1 : -1;
    const branchLength = 10 + (lightningNoise(seed + index * 7.271) + 1) * 9;
    const drift = lightningNoise(seed + index * 9.731) * 7;
    const elbow = {
      x: anchor.x + normalX * side * branchLength * 0.55 + tangentX * drift,
      y: anchor.y + normalY * side * branchLength * 0.55 + tangentY * drift,
    };
    const tipDrift = drift + lightningNoise(seed + index * 11.417) * 5;
    const tip = {
      x: anchor.x + normalX * side * branchLength + tangentX * tipDrift,
      y: anchor.y + normalY * side * branchLength + tangentY * tipDrift,
    };
    branches.push([anchor, elbow, tip]);
  }

  return { points, branches };
}

function nearestChainTargets(current, buckets, range, hit, limit) {
  const cellX = Math.floor(current.x / range);
  const cellY = Math.floor(current.y / range);
  const rangeSquared = range * range;
  const candidates = [];

  for (let y = cellY - 1; y <= cellY + 1; y += 1) {
    for (let x = cellX - 1; x <= cellX + 1; x += 1) {
      for (const candidate of buckets.get(`${x},${y}`) ?? []) {
        if (candidate.kind === "boss" || hit.has(candidate.id)) continue;
        const dx = candidate.x - current.x;
        const dy = candidate.y - current.y;
        const distance = dx * dx + dy * dy;
        if (distance > rangeSquared) continue;
        candidates.push({ candidate, distance });
      }
    }
  }
  candidates.sort((left, right) =>
    left.distance - right.distance ||
    compareTargetIds(left.candidate.id, right.candidate.id));
  return candidates.slice(0, limit).map(({ candidate }) => candidate);
}

export function buildLightningNetwork(first, enemies, options = {}) {
  const damage = Number(options.damage);
  const range = Number(options.range);
  const retention = Number(options.retention);
  const floorRatio = Number(options.floorRatio);
  if (
    !validTarget(first) ||
    !Array.isArray(enemies) ||
    !(damage > 0) ||
    !(range > 0) ||
    !(retention > 0) ||
    !Number.isFinite(damage) ||
    !Number.isFinite(range) ||
    !Number.isFinite(retention) ||
    !Number.isFinite(floorRatio) ||
    floorRatio < 0
  ) {
    return { hits: [], segments: [], endpoints: [] };
  }

  const alive = enemies.filter(validTarget);
  const firstTarget = alive.find((enemy) => enemy.id === first.id);
  if (!firstTarget) return { hits: [], segments: [], endpoints: [] };
  const buckets = buildSpatialBuckets(alive, range);
  const hit = new Set([firstTarget.id]);
  const hits = [{ targetId: firstTarget.id, from: null, damage, depth: 0 }];
  const segments = [];
  const outgoing = new Map();
  const queue = [{ enemy: firstTarget, node: hits[0] }];
  const killedIds = options.killedIds instanceof Set
    ? options.killedIds
    : new Set();
  const floor = damage * floorRatio;
  let queueIndex = 0;

  const enqueue = (parent, target, nextDamage, killArc = false) => {
    const node = {
      targetId: target.id,
      from: parent.enemy.id,
      damage: nextDamage,
      depth: parent.node.depth + 1,
      ...(killArc ? { killArc: true } : {}),
    };
    hit.add(target.id);
    hits.push(node);
    segments.push({
      from: parent.enemy.id,
      to: target.id,
      damage: nextDamage,
      depth: node.depth,
      ...(killArc ? { killArc: true } : {}),
    });
    outgoing.set(parent.enemy.id, (outgoing.get(parent.enemy.id) ?? 0) + 1);
    queue.push({ enemy: target, node });
  };

  while (queueIndex < queue.length && hit.size < alive.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    const expansionCount = current.node.depth === 0 && options.fork ? 2 : 1;
    const normalDamage = Math.max(floor, current.node.damage * retention);
    const nextTargets = nearestChainTargets(
      current.enemy,
      buckets,
      range,
      hit,
      expansionCount,
    );
    for (const target of nextTargets) enqueue(current, target, normalDamage);

    if (options.killArc && killedIds.has(current.enemy.id) && hit.size < alive.length) {
      const [continuation] = nearestChainTargets(
        current.enemy,
        buckets,
        range,
        hit,
        1,
      );
      if (continuation) enqueue(current, continuation, floor, true);
    }
  }
  return {
    hits,
    segments,
    endpoints: hits.filter(({ targetId }) => !outgoing.has(targetId)),
  };
}

export function buildLightningChain(first, enemies, options = {}) {
  return buildLightningNetwork(first, enemies, options).hits;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function shotgunPelletAngles(angle, count = 5, spread = 0.055) {
  if (
    !Number.isFinite(angle) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    !Number.isFinite(spread) ||
    spread < 0
  ) return [];
  const center = (count - 1) / 2;
  const spacing = count > 1 ? (spread * 4) / (count - 1) : 0;
  return Array.from(
    { length: count },
    (_unused, index) => angle + (index - center) * spacing,
  );
}

export function selectLightningTarget(
  origin,
  angle,
  enemies,
  { range, halfAngle } = {},
) {
  if (
    !Number.isFinite(origin?.x) ||
    !Number.isFinite(origin?.y) ||
    !Number.isFinite(angle) ||
    !Array.isArray(enemies) ||
    !(range > 0) ||
    !(halfAngle > 0)
  ) return null;
  const ax = Math.cos(angle);
  const ay = Math.sin(angle);
  return enemies
    .filter(validTarget)
    .map((enemy) => {
      const dx = enemy.x - origin.x;
      const dy = enemy.y - origin.y;
      const distance = Math.hypot(dx, dy);
      return {
        enemy,
        distance,
        alignment: distance === 0 ? 1 : (dx * ax + dy * ay) / distance,
      };
    })
    .filter((item) =>
      item.distance <= range && item.alignment >= Math.cos(halfAngle))
    .sort((left, right) =>
      left.distance - right.distance ||
      compareTargetIds(left.enemy.id, right.enemy.id))[0]?.enemy ?? null;
}

export function freezeTargetClass(enemy) {
  if (!enemy || typeof enemy !== "object") return "invalid";
  if (enemy.kind === "boss") return "boss";
  if (
    enemy.kind === "brute" ||
    (Number.isFinite(enemy.scoreMultiplier) && enemy.scoreMultiplier > 1)
  ) return "elite";
  return ["zombie", "runner", "exploder", "toxic", "devil"].includes(enemy.kind)
    ? "ordinary"
    : "invalid";
}

export function freezeDamageMultiplier(amount, crackShot) {
  return crackShot === true && Number.isFinite(amount) && amount >= 0.5 ? 1.5 : 1;
}

export function applyFreezeStatus(status = {}, kind, now, options = {}) {
  const timestamp = finiteOr(now, 0);
  const configuredPerHit = finiteOr(options.perHit, 0.25);
  const configuredCap = finiteOr(options.cap, 0.6);
  const configuredDuration = finiteOr(options.duration, 2.5);
  const bossMultiplier = kind === "boss" ? 0.5 : 1;
  const perHit = Math.max(0, configuredPerHit) * bossMultiplier;
  const cap = Math.max(0, configuredCap) * bossMultiplier;
  const previous = Math.max(0, finiteOr(status?.amount, 0));
  const amount = Math.min(cap, previous + perHit);
  return {
    status: {
      amount,
      expiresAt: timestamp + Math.max(0, configuredDuration),
    },
    reachedCap:
      kind !== "boss" &&
      cap > 0 &&
      previous < cap &&
      amount >= cap,
  };
}

export function strongestSlow(now, statuses = []) {
  if (!Number.isFinite(now) || !Array.isArray(statuses)) return 0;
  let strongest = 0;
  for (const status of statuses) {
    if (
      status?.expiresAt > now &&
      Number.isFinite(status.amount) &&
      status.amount > strongest
    ) {
      strongest = status.amount;
    }
  }
  return strongest;
}

export function watermelonChargeWindow(level = 0) {
  const safeLevel = Number.isInteger(level) && level > 0 ? level : 0;
  return {
    minimum: 0.3,
    maximum: Math.max(0.8, 1.5 * 0.88 ** safeLevel),
  };
}

export function watermelonMovementMultiplier(level = 0) {
  const safeLevel = Number.isInteger(level) && level > 0 ? level : 0;
  return 1 - Math.max(0, 0.2 - safeLevel * 0.04);
}

export function buildSeedAngles(count, offset = 0) {
  if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(offset)) return [];
  return Array.from(
    { length: count },
    (_unused, index) => offset + index * Math.PI * 2 / count,
  );
}

export function buildWatermelonSliceAngles(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
  const seed = x * 0.071 + y * 0.113;
  return Array.from({ length: 8 }, (_unused, index) => {
    const base = index * Math.PI * 2 / 8;
    const offset = Math.sin(seed + index * 12.9898) * 0.08;
    return base + offset;
  });
}

export function watermelonChargeStats(seconds, options = {}) {
  const minimum = finiteOr(options.minimum, 0.3);
  const maximum = finiteOr(options.maximum, 1.5);
  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < 0 ||
    maximum <= minimum ||
    seconds < minimum
  ) {
    return { ready: false, full: false };
  }
  const ratio = Math.min(1, Math.max(0, (seconds - minimum) / (maximum - minimum)));
  const interpolate = (start, end) => start + (end - start) * ratio;
  return {
    ready: true,
    full: ratio === 1,
    ratio,
    damage: interpolate(90, 320),
    radius: interpolate(100, 230),
    projectileRadius: interpolate(12, 28),
    speed: interpolate(360, 520),
  };
}

export function rayArenaIntersection(origin, direction, bounds = {}) {
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  const originX = Number(origin?.x);
  const originY = Number(origin?.y);
  const directionX = Number(direction?.x);
  const directionY = Number(direction?.y);
  const length = Math.hypot(directionX, directionY);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    originX < 0 ||
    originX > width ||
    originY < 0 ||
    originY > height ||
    !Number.isFinite(length) ||
    length <= 0
  ) {
    return null;
  }
  const dx = directionX / length;
  const dy = directionY / length;
  const candidates = [];
  if (dx > 0) candidates.push({ distance: (width - originX) / dx, boundary: "right" });
  if (dx < 0) candidates.push({ distance: -originX / dx, boundary: "left" });
  if (dy > 0) candidates.push({ distance: (height - originY) / dy, boundary: "bottom" });
  if (dy < 0) candidates.push({ distance: -originY / dy, boundary: "top" });
  const distance = Math.min(
    ...candidates
      .map((candidate) => candidate.distance)
      .filter((candidateDistance) => candidateDistance >= 0),
  );
  if (!Number.isFinite(distance)) return null;
  const tolerance = 1e-8 * Math.max(1, distance);
  return {
    x: originX + dx * distance,
    y: originY + dy * distance,
    distance,
    boundaries: candidates
      .filter((candidate) => Math.abs(candidate.distance - distance) <= tolerance)
      .map((candidate) => candidate.boundary),
  };
}

export function reflectRayAtBoundary(direction, intersection) {
  const x = Number(direction?.x);
  const y = Number(direction?.y);
  const boundaries = intersection?.boundaries;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    Math.hypot(x, y) <= 0 ||
    !Array.isArray(boundaries) ||
    boundaries.length === 0
  ) {
    return null;
  }
  const reflectedX = boundaries.some((side) => side === "left" || side === "right")
    ? -x
    : x;
  const reflectedY = boundaries.some((side) => side === "top" || side === "bottom")
    ? -y
    : y;
  return {
    x: Object.is(reflectedX, -0) ? 0 : reflectedX,
    y: Object.is(reflectedY, -0) ? 0 : reflectedY,
  };
}


// Preview, falling arrows and damage share the same ground-space footprint.
export function arrowRainChargeStats(seconds, options = {}) {
  const ratio = Math.max(0, Math.min(1, Number.isFinite(seconds) ? seconds / 2 : 0));
  const scale = Math.max(1, Math.min(1.5, Number.isFinite(options.areaScale) ? options.areaScale : 1));
  const extra = Math.max(0, Math.min(24, Math.round(Number.isFinite(options.extraArrows) ? options.extraArrows : 0)));
  return { ratio, count: 8 + Math.floor(ratio * 40) + extra,
    depth: (140 + ratio * 160) * scale,
    nearWidth: (80 + ratio * 80) * scale, farWidth: (160 + ratio * 200) * scale };
}

export function buildArrowRainLayout(origin, target, seconds, options = {}) {
  const stats = arrowRainChargeStats(seconds, options);
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const angle = distance > 0.001 ? Math.atan2(dy, dx) : (options.angle ?? 0);
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  const side = { x: -forward.y, y: forward.x };
  const reach = Math.min(distance, options.range ?? 900);
  const center = { x: origin.x + forward.x * reach, y: origin.y + forward.y * reach };
  const localPoint = (along, across) => ({ x: center.x + forward.x * along + side.x * across,
    y: center.y + forward.y * along + side.y * across });
  const corners = [localPoint(-stats.depth / 2, -stats.nearWidth / 2),
    localPoint(stats.depth / 2, -stats.farWidth / 2), localPoint(stats.depth / 2, stats.farWidth / 2),
    localPoint(-stats.depth / 2, stats.nearWidth / 2)];
  // Translate the entire shape at arena edges, preserving its trapezoid outline.
  for (const [axis, bound] of [["x", options.width ?? 1600], ["y", options.height ?? 900]]) {
    const low = Math.min(...corners.map(p => p[axis])), high = Math.max(...corners.map(p => p[axis]));
    const shift = low < 16 ? 16 - low : high > bound - 16 ? bound - 16 - high : 0;
    center[axis] += shift;
    for (const point of corners) point[axis] += shift;
  }
  const points = [{ ...center }];
  for (let i = 1; i < stats.count; i++) {
    // Invert the area CDF so the wide end receives proportionally more arrows.
    const v = (i * 0.7548776662466927) % 1, u = (i * 0.5698402909980532) % 1;
    const t = (Math.sqrt(stats.nearWidth ** 2 + v * (stats.farWidth ** 2 - stats.nearWidth ** 2)) - stats.nearWidth)
      / (stats.farWidth - stats.nearWidth);
    const width = stats.nearWidth + (stats.farWidth - stats.nearWidth) * t;
    points.push(localPoint((t - 0.5) * stats.depth, (u - 0.5) * width));
  }
  return { ...stats, center, forward, side, corners, points };
}

export function pointInArrowRain(point, layout) {
  const dx = point.x - layout.center.x, dy = point.y - layout.center.y;
  const along = dx * layout.forward.x + dy * layout.forward.y;
  const across = dx * layout.side.x + dy * layout.side.y;
  const t = along / layout.depth + 0.5;
  if (t < -1e-9 || t > 1 + 1e-9) return false;
  return Math.abs(across) <= (layout.nearWidth + (layout.farWidth - layout.nearWidth) * t) / 2 + 1e-9;
}

export function createArrowRain(layout, damage, traits = {}) {
  const arrows = layout.points.map((point, index) => {
    const delay = 0.08 + (index % 6) * 0.055, fallTime = 0.46 + (index % 3) * 0.025;
    return { ...point, delay, fallTime, impactAt: delay + fallTime, impacted: false };
  });
  return { layout, damage, traits: { ...traits }, age: 0, echoes: 0, arrows };
}

function ricochetEllipseHit(bullet, vx, vy, duration, object, rx, ry) {
  const sx = (bullet.x - object.x) / rx, sy = (bullet.y - object.y) / ry;
  const dx = vx / rx, dy = vy / ry;
  const a = dx * dx + dy * dy, b = 2 * (sx * dx + sy * dy), c = sx * sx + sy * sy - 1;
  if (a <= 1e-12) return null;
  let time;
  if (c < -1e-7) {
    if (b >= 0 && Math.hypot(sx, sy) > .001) return null;
    time = 0;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    time = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (time < -1e-8 || time > duration + 1e-8) return null;
    time = Math.max(0, time);
  }
  let x = bullet.x + vx * time, y = bullet.y + vy * time;
  let nx = (x - object.x) / (rx * rx), ny = (y - object.y) / (ry * ry);
  let length = Math.hypot(nx, ny);
  if (length < 1e-9) { nx = -vx; ny = -vy; length = Math.hypot(nx, ny); }
  nx /= length; ny /= length;
  if (c < -1e-7) {
    const radial = Math.hypot((x - object.x) / rx, (y - object.y) / ry);
    if (radial > .001) { x = object.x + (x - object.x) / radial; y = object.y + (y - object.y) / radial; }
    else { const reach = 1 / Math.hypot(nx / rx, ny / ry); x = object.x + nx * reach; y = object.y + ny * reach; }
  }
  if (vx * nx + vy * ny >= -1e-8) return null;
  return { time, x, y, nx, ny };
}

export function advanceRicochetProjectile(bullet, dt, arena, onImpact) {
  if (!Number.isFinite(dt) || dt <= 0 || bullet.life <= 0) return;
  bullet.x = Math.max(bullet.radius, Math.min(arena.width - bullet.radius, bullet.x));
  bullet.y = Math.max(bullet.radius, Math.min(arena.height - bullet.radius, bullet.y));
  let remaining = dt;
  for (let step = 0; step < 64 && remaining > 1e-8 && bullet.life > 0; step++) {
    let hit = null;
    const choose = candidate => {
      if (candidate && (!hit || candidate.time < hit.time - 1e-9)) hit = candidate;
    };
    const r = bullet.radius;
    const walls = [];
    if (bullet.vx < 0) walls.push({ time: (r - bullet.x) / bullet.vx, nx: 1, ny: 0 });
    if (bullet.vx > 0) walls.push({ time: (arena.width - r - bullet.x) / bullet.vx, nx: -1, ny: 0 });
    if (bullet.vy < 0) walls.push({ time: (r - bullet.y) / bullet.vy, nx: 0, ny: 1 });
    if (bullet.vy > 0) walls.push({ time: (arena.height - r - bullet.y) / bullet.vy, nx: 0, ny: -1 });
    for (const wall of walls) {
      if (wall.time < -1e-8 || wall.time > remaining + 1e-8) continue;
      const time = Math.max(0, wall.time);
      if (hit?.type === 'wall' && Math.abs(time - hit.time) < 1e-8) {
        hit.corner = true; hit.nx += wall.nx; hit.ny += wall.ny;
      } else choose({ ...wall, time, type: 'wall', x: bullet.x + bullet.vx * time, y: bullet.y + bullet.vy * time });
    }
    for (const obstacle of arena.obstacles ?? []) {
      const contact = ricochetEllipseHit(bullet, bullet.vx, bullet.vy, remaining, obstacle, obstacle.rx + r, obstacle.ry + r);
      if (contact) choose({ ...contact, type: 'obstacle', object: obstacle });
    }
    for (const enemy of arena.enemies ?? []) {
      if (enemy.health <= 0) continue;
      const contact = ricochetEllipseHit(bullet, bullet.vx, bullet.vy, remaining, enemy, enemy.radius + r, enemy.radius + r);
      if (contact) choose({ ...contact, type: 'enemy', object: enemy });
    }
    if (!hit) { bullet.x += bullet.vx * remaining; bullet.y += bullet.vy * remaining; return; }
    bullet.x = hit.x; bullet.y = hit.y;
    const normalLength = Math.hypot(hit.nx, hit.ny);
    hit.nx /= normalLength; hit.ny /= normalLength;
    const dot = bullet.vx * hit.nx + bullet.vy * hit.ny;
    if (hit.corner) { bullet.vx *= -1; bullet.vy *= -1; }
    else { bullet.vx -= 2 * dot * hit.nx; bullet.vy -= 2 * dot * hit.ny; }
    const reflected = { vx: bullet.vx, vy: bullet.vy };
    bullet.x += hit.nx * .05; bullet.y += hit.ny * .05;
    onImpact(hit);
    // Homing must leave the contacted surface rather than turn back into it.
    if (bullet.vx * hit.nx + bullet.vy * hit.ny <= 0) Object.assign(bullet, reflected);
    remaining -= hit.time;
  }
}
