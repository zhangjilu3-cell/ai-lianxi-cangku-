export const TOXIC_GAS_TRAIL = Object.freeze({
  duration: 5,
  spacing: 55,
});

const PIXEL_EPSILON = 1e-9;
const TIME_EPSILON = 1e-9;
const MAX_SAMPLES_PER_STEP = 256;

export function createToxicGasTrailState(kind) {
  if (kind !== "toxic") return {};
  return {
    gasTrailTime: TOXIC_GAS_TRAIL.duration,
    gasTrailDistance: 0,
  };
}

function finite(value) {
  return Number.isFinite(value);
}

function readTrailState(gasTrailTime, gasTrailDistance) {
  const valid =
    finite(gasTrailTime) &&
    gasTrailTime >= 0 &&
    gasTrailTime <= TOXIC_GAS_TRAIL.duration &&
    finite(gasTrailDistance) &&
    gasTrailDistance >= 0 &&
    gasTrailDistance < TOXIC_GAS_TRAIL.spacing;
  return {
    valid,
    gasTrailTime:
      valid && gasTrailTime > TIME_EPSILON ? gasTrailTime : 0,
    gasTrailDistance:
      valid && gasTrailDistance > PIXEL_EPSILON ? gasTrailDistance : 0,
  };
}

function failClosedResult() {
  return {
    gasTrailTime: 0,
    gasTrailDistance: 0,
    points: [],
  };
}

export function advanceToxicGasTrail(input) {
  const state = readTrailState(input?.gasTrailTime, input?.gasTrailDistance);
  const result = {
    gasTrailTime: state.gasTrailTime,
    gasTrailDistance: state.gasTrailDistance,
    points: [],
  };
  if (
    !state.valid ||
    input?.kind !== "toxic" ||
    !finite(input.health) ||
    input.health <= 0 ||
    !finite(input.dt) ||
    input.dt <= 0 ||
    state.gasTrailTime <= 0 ||
    !finite(input.startX) ||
    !finite(input.startY) ||
    !finite(input.endX) ||
    !finite(input.endY)
  ) {
    return result;
  }

  const totalDx = input.endX - input.startX;
  const totalDy = input.endY - input.startY;
  if (!finite(totalDx) || !finite(totalDy)) return failClosedResult();

  const activeTime = Math.min(input.dt, state.gasTrailTime);
  const activeFraction = activeTime / input.dt;
  const dx = totalDx * activeFraction;
  const dy = totalDy * activeFraction;
  const distance = Math.hypot(dx, dy);
  if (!finite(dx) || !finite(dy) || !finite(distance)) {
    return failClosedResult();
  }

  const remainingTime = state.gasTrailTime - activeTime;
  result.gasTrailTime = remainingTime > TIME_EPSILON ? remainingTime : 0;
  if (distance === 0) return result;

  const accumulatedDistance = state.gasTrailDistance + distance;
  if (!finite(accumulatedDistance)) return failClosedResult();
  const sampleCount = Math.floor(
    (accumulatedDistance + PIXEL_EPSILON) / TOXIC_GAS_TRAIL.spacing,
  );
  if (sampleCount > MAX_SAMPLES_PER_STEP) return failClosedResult();

  const firstSampleDistance =
    TOXIC_GAS_TRAIL.spacing - state.gasTrailDistance;
  for (let index = 0; index < sampleCount; index += 1) {
    const distanceAlong =
      firstSampleDistance + index * TOXIC_GAS_TRAIL.spacing;
    const ratio = Math.min(1, distanceAlong / distance);
    result.points.push({
      x: input.startX + dx * ratio,
      y: input.startY + dy * ratio,
    });
  }

  const remainder =
    accumulatedDistance - sampleCount * TOXIC_GAS_TRAIL.spacing;
  if (
    !finite(remainder) ||
    remainder < -PIXEL_EPSILON ||
    remainder >= TOXIC_GAS_TRAIL.spacing + PIXEL_EPSILON
  ) {
    return failClosedResult();
  }
  result.gasTrailDistance =
    Math.abs(remainder) <= PIXEL_EPSILON ||
    Math.abs(remainder - TOXIC_GAS_TRAIL.spacing) <= PIXEL_EPSILON
      ? 0
      : remainder;
  return result;
}
