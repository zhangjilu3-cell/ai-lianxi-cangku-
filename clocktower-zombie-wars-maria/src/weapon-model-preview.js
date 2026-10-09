import {
  HANDHELD_WEAPON_IDS,
  WEAPON_VISUALS,
} from "/weapon-visuals.js";
import {
  PLAYER_RIG_ASSETS,
  PLAYER_RIG_VISUAL,
  drawPlayerArm,
  drawPlayerBody,
  resolvePlayerArmPose,
  resolvePlayerArmPoseForRig,
} from "/player-arm-rig.js";
import {
  PLAYER_WEAPON_HAND_ASSET_ENTRIES,
  resolvePlayerRigImages,
  resolvePlayerWeaponHandProfile,
} from "/player-weapon-hands.js";
import {
  drawWeaponModel,
  resolveWeaponGripPoints,
} from "/player-weapon-renderer.js";

const AIM_DIRECTIONS = Object.freeze([
  { label: "右", angle: 0 },
  { label: "右下", angle: Math.PI / 4 },
  { label: "下", angle: Math.PI / 2 },
  { label: "左下", angle: Math.PI * 3 / 4 },
  { label: "左", angle: Math.PI },
  { label: "左上", angle: Math.PI * 5 / 4 },
  { label: "上", angle: Math.PI * 3 / 2 },
  { label: "右上", angle: Math.PI * 7 / 4 },
]);
const PREVIEW_RECOIL_SCALE = PLAYER_RIG_VISUAL.recoilScale;
const PREVIEW_SHOT_CYCLE = 2400;
const PREVIEW_SHOT_WINDOW = 0.2;

const names = {
  pistol: "手枪",
  shotgun: "霰弹枪",
  rocket: "火箭筒",
  flamethrower: "火焰喷射器",
  laser: "激光枪",
  ricochet: "反弹炮",
  lightning: "蓄力箭雨枪",
  freeze: "冰冻枪",
  watermelon: "西瓜枪",
};

const grid = document.querySelector("#weaponPreviewGrid");
const status = document.querySelector("#previewStatus");
const directionLabel = document.querySelector("#directionLabel");
const previous = document.querySelector("#previousDirection");
const next = document.querySelector("#nextDirection");
const toggleAuto = document.querySelector("#toggleAuto");
const showAimMode = document.querySelector("#showAimMode");
const showFrontMode = document.querySelector("#showFrontMode");
const directionControls = document.querySelector("#directionControls");
let frontPreview = null;
let frontPreviewError = null;
try {
  frontPreview = await import("/player-front-preview.js");
} catch (error) {
  frontPreviewError = error;
  showFrontMode.disabled = true;
  showFrontMode.title = error.message;
}
let previewMode =
  frontPreview?.resolvePreviewMode(location.search) ?? "aim";
const cards = new Map();
let directionIndex = 0;
let autoRotate = true;
let lastDirectionChange = performance.now();

function setPreviewMode(mode) {
  const wasFront = previewMode === "front";
  previewMode = mode === "front" && frontPreview ? "front" : "aim";
  const front = previewMode === "front";
  showAimMode.setAttribute("aria-pressed", String(!front));
  showFrontMode.setAttribute("aria-pressed", String(front));
  directionControls.hidden = front;
  if (front) autoRotate = false;
  else if (wasFront) autoRotate = true;
  toggleAuto.setAttribute("aria-pressed", String(autoRotate));
  toggleAuto.textContent = autoRotate ? "暂停轮播" : "继续轮播";
  lastDirectionChange = performance.now();
  status.textContent = front
    ? "正面带脸模式：检查脸部、帽檐与九把武器的遮挡关系。"
    : frontPreviewError
      ? "八向持枪模式可用；正面带脸模块加载失败：" +
        frontPreviewError.message
      : "八向持枪模式：检查人物、手臂与武器朝向。";
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("预览资源加载失败：" + src)),
      { once: true },
    );
    image.src = src;
  });
}

function changeDirection(delta) {
  directionIndex =
    (directionIndex + delta + AIM_DIRECTIONS.length) % AIM_DIRECTIONS.length;
  directionLabel.textContent = AIM_DIRECTIONS[directionIndex].label;
  lastDirectionChange = performance.now();
}

previous.addEventListener("click", () => changeDirection(-1));
next.addEventListener("click", () => changeDirection(1));
toggleAuto.addEventListener("click", () => {
  autoRotate = !autoRotate;
  toggleAuto.setAttribute("aria-pressed", String(autoRotate));
  toggleAuto.textContent = autoRotate ? "暂停轮播" : "继续轮播";
  lastDirectionChange = performance.now();
});
showAimMode.addEventListener("click", () => setPreviewMode("aim"));
showFrontMode.addEventListener("click", () => setPreviewMode("front"));

function smoothRecoilRatio(now) {
  const phase = (now % PREVIEW_SHOT_CYCLE) / PREVIEW_SHOT_CYCLE;
  if (phase >= PREVIEW_SHOT_WINDOW) return 0;
  const progress = phase / PREVIEW_SHOT_WINDOW;
  return Math.sin(progress * Math.PI) ** 2 * PREVIEW_RECOIL_SCALE;
}

const rigEntries = Object.entries(PLAYER_RIG_ASSETS);
let rigImages;
let weaponImages;
try {
  const [loadedRig, loadedHands, loadedWeapons] = await Promise.all([
    Promise.all(
      rigEntries.map(async ([id, src]) => [id, await loadImage(src)]),
    ),
    Promise.all(
      PLAYER_WEAPON_HAND_ASSET_ENTRIES.map(async ({ key, route }) => [
        key,
        await loadImage(route),
      ]),
    ),
    Promise.all(
      HANDHELD_WEAPON_IDS.map((weaponId) =>
        loadImage(WEAPON_VISUALS[weaponId].src),
      ),
    ),
  ]);
  rigImages = Object.fromEntries([...loadedRig, ...loadedHands]);
  weaponImages = loadedWeapons;
} catch (error) {
  status.textContent = error.message;
  status.dataset.state = "error";
  throw error;
}

for (const weaponId of HANDHELD_WEAPON_IDS) {
  const article = document.createElement("article");
  article.className = "weapon-card";
  const title = document.createElement("h2");
  title.textContent = names[weaponId];
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  article.append(title, canvas);
  grid.append(article);
  cards.set(weaponId, {
    context: canvas.getContext("2d"),
    image: weaponImages[HANDHELD_WEAPON_IDS.indexOf(weaponId)],
  });
}

status.textContent = "人物 rig 与武器已就绪；轮播用于检查八个瞄准方向。";
setPreviewMode(previewMode);

function drawFrame(now) {
  if (autoRotate && now - lastDirectionChange >= 1600) changeDirection(1);
  const angle = AIM_DIRECTIONS[directionIndex].angle;
  const chargePulse = (Math.sin(now / 900) + 1) / 2;
  const recoilRatio = smoothRecoilRatio(now);
  for (const weaponId of HANDHELD_WEAPON_IDS) {
    const { context, image } = cards.get(weaponId);
    const visual = WEAPON_VISUALS[weaponId];
    context.clearRect(0, 0, 320, 240);
    context.save();
    context.translate(160, 124);
    if (previewMode === "front") {
      const { FRONT_PREVIEW_VISUAL } = frontPreview;
      const chargeRatio = weaponId === "watermelon" ? chargePulse : 0;
      const rawGrips = resolveWeaponGripPoints(visual, 0);
      const grips = frontPreview.offsetFrontPreviewGrips(rawGrips);
      const frontPose = resolvePlayerArmPoseForRig(
        grips,
        FRONT_PREVIEW_VISUAL.rig,
        { chargeRatio },
      );
      const handProfile = resolvePlayerWeaponHandProfile(weaponId);
      const activeRigImages = resolvePlayerRigImages(rigImages, weaponId);
      frontPreview.drawFrontPlayerBody(context, activeRigImages);
      drawPlayerArm(
        context,
        activeRigImages,
        frontPose.far,
        "far",
        handProfile,
      );
      context.save();
      context.translate(
        FRONT_PREVIEW_VISUAL.weaponOffset.x,
        FRONT_PREVIEW_VISUAL.weaponOffset.y,
      );
      drawWeaponModel(context, image, visual, {
        recoilRatio: 0,
        feedbackRatio: chargeRatio,
        chargeRatio,
        time: now / 1000,
      });
      context.restore();
      drawPlayerArm(
        context,
        activeRigImages,
        frontPose.near,
        "near",
        handProfile,
      );
      frontPreview.drawFrontFaceDetails(context);
      context.restore();
      continue;
    }
    context.rotate(angle);
    const chargeRatio = weaponId === "watermelon" ? chargePulse : 0;
    const activeRecoil = weaponId === "watermelon" ? 0 : recoilRatio;
    const grips = resolveWeaponGripPoints(visual, activeRecoil);
    const pose = resolvePlayerArmPose(grips, { chargeRatio });
    const handProfile = resolvePlayerWeaponHandProfile(weaponId);
    const activeRigImages = resolvePlayerRigImages(rigImages, weaponId);
    drawPlayerBody(context, activeRigImages);
    drawPlayerArm(context, activeRigImages, pose.far, "far", handProfile);
    drawWeaponModel(context, image, visual, {
      recoilRatio: activeRecoil,
      feedbackRatio: Math.max(activeRecoil, chargeRatio),
      chargeRatio,
      time: now / 1000,
    });
    drawPlayerArm(context, activeRigImages, pose.near, "near", handProfile);
    context.restore();
  }
  requestAnimationFrame(drawFrame);
}

requestAnimationFrame(drawFrame);
