export const ARENA_FLOOR_TEXTURE_SRC = "/backgrounds/city-plaza.png";
const arenaPatterns = new WeakMap();

export function drawArenaFloor(context, image, width, height) {
  context.save();
  context.fillStyle = "#777064";
  context.fillRect(0, 0, width, height);
  if (!image?.complete || !image.naturalWidth) { context.restore(); return false; }
  let entry = arenaPatterns.get(context);
  if (!entry || entry.image !== image) {
    entry = { image, pattern: context.createPattern(image, "repeat") };
    arenaPatterns.set(context, entry);
  }
  if (!entry.pattern) { context.restore(); return false; }
  const scale = 512 / image.naturalWidth;
  context.scale(scale, scale);
  context.fillStyle = entry.pattern;
  context.fillRect(0, 0, width / scale, height / scale);
  context.restore();
  return true;
}
