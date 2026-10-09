export const TURRET_TEXTURE_SRC = "/structures/auto-turret.png";

// Atlas cells share a camera but have independent mechanical rotation centers.
export const TURRET_LAYERS = Object.freeze({
  base: Object.freeze({ x: 0, y: 0, cell: 887, pivotX: 444, pivotY: 436, size: 64 }),
  head: Object.freeze({ x: 887, y: 0, cell: 887, pivotX: 300, pivotY: 435, size: 56 }),
});

function drawTurretLayer(context, image, layer) {
  const scale = layer.size / layer.cell;
  context.drawImage(image, layer.x, layer.y, layer.cell, layer.cell,
    -layer.pivotX * scale, -layer.pivotY * scale, layer.size, layer.size);
}

export function drawAutomaticTurret(context, image, angle = 0) {
  if (!image?.complete || image.naturalWidth === 0) return false;
  drawTurretLayer(context, image, TURRET_LAYERS.base);
  context.save();
  context.rotate(Number.isFinite(angle) ? angle : 0);
  drawTurretLayer(context, image, TURRET_LAYERS.head);
  context.restore();
  return true;
}

export function createTurretReview(search, doc, kind = "turret") {
  const params = new URLSearchParams(search);
  if (params.get("modelLab") !== "1" || params.get(kind + "Review") !== "1") return null;
  const panel = doc.createElement("aside");
  panel.id = kind + "Review";
  panel.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:31;width:min(480px,42vw);padding:12px;border:1px solid #a99060;background:#11191eef;color:#e7e3d7;font:13px system-ui;border-radius:8px";
  panel.innerHTML = '<strong>自动炮台 · 动态贴图检视</strong><div style="margin:10px 0"><label><input type="checkbox" data-rotate checked> 自动旋转</label></div><canvas width="480" height="400" style="width:100%;background:#263239;border:1px solid #39454a"></canvas><div data-status style="margin-top:8px"></div><small>移动鼠标到放大图内可手动转向；底座固定，炮头独立旋转。</small>';
  if (kind === "tank") {
    panel.innerHTML = panel.innerHTML.replace("自动炮台", "冷钢坦克")
      .replace("底座固定，炮头独立旋转", "车体固定，炮塔独立旋转");
  }
  doc.body.append(panel);
  const review = { kind, panel, canvas: panel.querySelector("canvas"), auto: panel.querySelector("[data-rotate]"), status: panel.querySelector("[data-status]"), angle: 0 };
  review.canvas.addEventListener("pointermove", (event) => {
    const bounds = review.canvas.getBoundingClientRect();
    review.auto.checked = false;
    review.angle = Math.atan2((event.clientY - bounds.top) * 400 / bounds.height - 200,
      (event.clientX - bounds.left) * 480 / bounds.width - 240);
  });
  return review;
}

export function updateTurretReview(review, image, structure, draw = drawAutomaticTurret, paintFloor = null) {
  if (!review || !structure) return;
  const target = review.canvas.getContext("2d");
  target.clearRect(0, 0, 480, 400);
  if (paintFloor) paintFloor(target, 480, 400);
  else {
  target.fillStyle = "#263239";
  target.fillRect(0, 0, 480, 400);
  target.strokeStyle = "#34444c";
  target.beginPath();
  for (let x = 0; x <= 480; x += 40) { target.moveTo(x, 0); target.lineTo(x, 400); }
  for (let y = 0; y <= 400; y += 40) { target.moveTo(0, y); target.lineTo(480, y); }
  target.stroke();
  }
  target.save();
  target.translate(240, 200);
  target.scale(4, 4);
  draw(target, image, structure.aimAngle, structure.bodyAngle ?? 0);
  target.restore();
  review.status.textContent = review.kind === "tank"
    ? "同帧实机 4 倍放大 · 冷蓝灰装甲 / 黑色履带 / 独立炮塔"
    : "同帧实机 4 倍放大 · 深铁装甲 / 黄铜炮管 / 固定机械底座";
}
