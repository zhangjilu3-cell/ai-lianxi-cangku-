import { drawPlayerBody } from "./player-arm-rig.js";
import { drawWeaponModel, resolveWeaponGripPoints } from "./player-weapon-renderer.js";
import { WEAPON_VISUALS } from "./weapon-visuals.js";

export const ADULT_REVIEW_BODY = "/player-rig/adult-topdown-review-body.png";
export const ADULT_REVIEW_PISTOL = "/player-rig/adult-pistol-held-review.png";
export const ADULT_REVIEW_PALM = "/player-rig/weapons/pistol/near-forearm-hand.png";
export const ADULT_REVIEW_RIG = Object.freeze({
  bodyRotation: -Math.PI / 2,
  bodyDraw: Object.freeze({ x: -38, y: -38, width: 76, height: 76 }),
  recoilScale: 0.38,
});

export function adultWeaponVisual(visual) {
  if (visual.src === WEAPON_VISUALS.pistol.src) {
    // The glove is part of this held-pistol sprite. Its grip points into depth;
    // compress that vertical projection while retaining the visible barrel side.
    return {
      ...visual, src: ADULT_REVIEW_PISTOL, heldPistol: true,
      width: 60, height: 26,
      gripX: 0.37, gripY: 0.63, supportGripX: 0.37, supportGripY: 0.63,
      muzzleX: 0.948, muzzleY: 0.275,
      playerOffsetX: 4, playerOffsetY: 25,
    };
  }
  const offset = visual.height >= 48 ? 35 : visual.height >= 40 ? 28 : 22;
  return { ...visual, width: visual.width * 0.8, height: visual.height * 0.8, playerOffsetY: visual.playerOffsetY + offset };
}

export function adultAttachmentPose(visual, recoilRatio) {
  const mounted = adultWeaponVisual(visual);
  const ratio = Number.isFinite(recoilRatio) ? recoilRatio : 0;
  const recoil = Math.max(0, Math.min(1, ratio)) * ADULT_REVIEW_RIG.recoilScale;
  const grips = resolveWeaponGripPoints(mounted, recoil);
  const rotation = -mounted.recoilTilt * recoil;
  // No shoulder, elbow, bone lengths or IK: both palms attach directly to the gun.
  const hands = [{ side: "near", position: grips.main, rotation }];
  if (!mounted.heldPistol) hands.unshift({ side: "far", position: grips.support, rotation });
  return { mounted, recoil, grips, hands };
}

export function adultMuzzlePoint(visual, player, angle, recoilRatio = 1) {
  const { mounted, recoil, grips } = adultAttachmentPose(visual, recoilRatio);
  const tilt = -mounted.recoilTilt * recoil;
  const dx = (mounted.muzzleX - mounted.gripX) * mounted.width;
  const dy = (mounted.muzzleY - mounted.gripY) * mounted.height;
  const x = grips.main.x + dx * Math.cos(tilt) - dy * Math.sin(tilt);
  const y = grips.main.y + dx * Math.sin(tilt) + dy * Math.cos(tilt);
  return { x: player.x + x * Math.cos(angle) - y * Math.sin(angle), y: player.y + x * Math.sin(angle) + y * Math.cos(angle) };
}

function drawAdultPalm(context, image, hand) {
  if (!image?.naturalWidth || !image?.naturalHeight) return;
  context.save();
  context.translate(hand.position.x, hand.position.y);
  context.rotate(hand.rotation);
  // Sample only the black glove palm, excluding the source sleeve and cuff.
  context.drawImage(image,
    image.naturalWidth * 0.58, image.naturalHeight * 0.28,
    image.naturalWidth * 0.40, image.naturalHeight * 0.51,
    -7.5, -4.5, 12, 9,
  );
  context.restore();
}

function drawAdultAttachmentMarkers(context, hands, muzzle) {
  context.save();
  context.lineWidth = 0.6;
  for (const { position } of hands) {
    context.strokeStyle = "#ffcf69";
    context.strokeRect(position.x - 2, position.y - 2, 4, 4);
  }
  context.fillStyle = "#6effc3";
  context.beginPath();
  context.arc(muzzle.x, muzzle.y, 1.3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function drawAdultReviewPlayer(context, images, weaponImage, visual, handProfile, options, review) {
  const { mounted, recoil, hands } = adultAttachmentPose(visual, options.recoilRatio);
  drawPlayerBody(context, { body: review.body }, ADULT_REVIEW_RIG);
  if (!mounted.heldPistol) drawAdultPalm(context, review.palm, hands[0]);
  drawWeaponModel(context, mounted.heldPistol ? review.pistol : weaponImage, mounted, { ...options, recoilRatio: recoil });
  if (!mounted.heldPistol) drawAdultPalm(context, review.palm, hands[1]);
  if (review.markers.checked) {
    drawAdultAttachmentMarkers(context, hands, adultMuzzlePoint(visual, { x: 0, y: 0 }, 0, options.recoilRatio));
  }
}

export function createAdultReview(search, doc) {
  const model = new URLSearchParams(search).get("playerModel");
  if (model !== "adult" && model !== "upright") return null;
  const panel = doc.createElement("aside");
  panel.id = "adultRigReview";
  panel.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:30;width:min(380px,40vw);padding:12px;border:1px solid #a99060;background:#11191eef;color:#e7e3d7;font:13px system-ui;border-radius:8px;box-shadow:0 6px 24px #0008";
  panel.innerHTML = '<strong>成人猎人 · 独立手掌动态检视</strong><div style="margin:8px 0;display:flex;gap:12px;flex-wrap:wrap"><label><input type="checkbox" data-adult checked> 成人角色</label><label><input type="checkbox" data-markers> 握点 / 枪口</label><label><input type="checkbox" data-zoom checked> 放大</label></div><canvas width="480" height="400" style="width:100%;background:#192326;border:1px solid #39454a"></canvas><div data-status style="margin-top:6px">开始游戏后显示实际画面</div><small>WASD 移动 · 鼠标转向 / 射击 · 1–9 换枪<br>金框：握点 · 绿点：枪口<br>取消成人角色可对照原角色。</small>';
  if (model === "upright") {
    panel.innerHTML = panel.innerHTML.replace("独立手掌动态检视", "侧面全身动态检视")
      .replace("握点 / 枪口", "关节 / 枪口")
      ;
  }
  doc.body.append(panel);
  return {
    panel, enabled: panel.querySelector("[data-adult]"), markers: panel.querySelector("[data-markers]"),
    zoom: panel.querySelector("[data-zoom]"), canvas: panel.querySelector("canvas"), status: panel.querySelector("[data-status]"),
    body: null, pistol: null, palm: null, atlas: null, mode: model, view: { value: model === "upright" ? "side" : "front" },
  };
}
export function updateAdultReviewMagnifier(review, canvas, player, drawDetail, paintFloor = null) {
  if (!review || review.panel.hidden) return;
  const now = globalThis.performance?.now() ?? 0;
  const key = [review.zoom.checked, review.enabled.checked, review.markers.checked, review.view?.value, player.weapon, review.enabled.disabled, review.loadError].join("|");
  const changed = review.paintKey !== key;
  if (!changed && now - (review.lastPaint ?? -Infinity) < 1000 / 30) return;
  review.paintKey = key;
  review.lastPaint = now;
  review.canvas.hidden = !review.zoom.checked;
  if (review.zoom.checked) {
    const target = review.canvas.getContext("2d");
    target.clearRect(0, 0, 480, 400);
    if (paintFloor) paintFloor(target, 480, 400);
    else {
    target.fillStyle = "#263239";
    target.fillRect(0, 0, 480, 400);
    target.strokeStyle = "#33444d";
    for (let x = 0; x < 480; x += 40) {
      target.beginPath(); target.moveTo(x, 0); target.lineTo(x, 400); target.stroke();
    }
    for (let y = 0; y < 400; y += 40) {
      target.beginPath(); target.moveTo(0, y); target.lineTo(480, y); target.stroke();
    }
    }
    // Same production draw function and same current player state, at native 3x resolution.
    target.save();
    const direction = Math.atan2(player.aimY, player.aimX);
    if (review.mode === "upright") target.translate(240, 350);
    else target.translate(240 - Math.cos(direction) * 45, 200 - Math.sin(direction) * 45);
    target.scale(2.7, 2.7);
    drawDetail(target);
    target.restore();
  }
  const status = review.loadError || (review.enabled.disabled ? "对照角色加载中…" : review.enabled.checked
    ? review.mode === "upright"
      ? `实机动态放大 · ${review.view?.value === "side" ? "侧面全身" : "正面全身"} / 完整枪身 / 双臂持枪`
      : "实机动态放大 · 独立手掌随枪转向与后坐"
    : "原 Q 版角色对照");
  if (review.status.textContent !== status) review.status.textContent = status;
}
