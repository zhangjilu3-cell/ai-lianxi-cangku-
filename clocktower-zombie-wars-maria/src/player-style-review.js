import {
  buildStyleWeaponReviewCells,
  resolvePlayerStyleRig,
} from "/player-style-rigs.js";
import {
  resolvePlayerArmPoseForRig,
} from "/player-arm-rig.js";
import {
  drawWeaponModel,
  resolveWeaponGripPoints,
} from "/player-weapon-renderer.js";
import { resolveWeaponVisual } from "/weapon-visuals.js";

const WEAPON_NAMES = Object.freeze({
  pistol: "手枪",
  shotgun: "霰弹枪",
  rocket: "火箭筒",
  flamethrower: "火焰喷射器",
  laser: "激光枪",
  ricochet: "反弹炮",
  lightning: "蓄力箭雨枪",
  freeze: "冰冻枪",
  watermelon: "西瓜枪",
});
const PREVIEW_RECOIL_SCALE = 0.38;
const PREVIEW_SHOT_CYCLE = 2400;
const PREVIEW_SHOT_WINDOW = 0.2;
const BODY_FACING_ROTATION = Math.PI / 2;

const matrix = document.querySelector("#styleWeaponMatrix");
const status = document.querySelector("#reviewStatus");
const pauseButton = document.querySelector("#pauseReview");
const dialog = document.querySelector("#reviewDialog");
const dialogTitle = document.querySelector("#reviewDialogTitle");
const dialogCanvas = document.querySelector("#reviewDialogCanvas");
const closeDialogButton = document.querySelector("#closeReviewDialog");

let animationTime = 0;
let lastFrameTime = performance.now();
let paused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let selectedCell = null;
let selectedCard = null;

function loadImage(route) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("资源加载失败：" + route)),
      { once: true },
    );
    image.src = route;
  });
}

function createCellState(definition) {
  const style = resolvePlayerStyleRig(definition.styleId);
  const weapon = resolveWeaponVisual(definition.weaponId);
  return {
    ...definition,
    style,
    weapon,
    card: null,
    canvas: null,
    context: null,
    images: null,
    error: null,
  };
}

async function loadCellImages(cell) {
  const entries = [
    ...Object.entries(cell.style.assets),
    ["weapon", cell.weapon.src],
  ];
  const results = await Promise.allSettled(
    entries.map(async ([id, route]) => [id, await loadImage(route)]),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return Object.fromEntries(results.map((result) => result.value));
}

function createCard(cell) {
  const card = document.createElement("article");
  card.className = "review-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute(
    "aria-label",
    cell.style.label + "搭配" + WEAPON_NAMES[cell.weaponId] + "，打开大图",
  );

  const heading = document.createElement("div");
  heading.className = "card-heading";
  const title = document.createElement("h2");
  title.textContent = WEAPON_NAMES[cell.weaponId];
  const styleName = document.createElement("span");
  styleName.textContent = cell.style.label;
  heading.append(title, styleName);

  const canvas = document.createElement("canvas");
  canvas.width = 440;
  canvas.height = 360;
  canvas.setAttribute(
    "aria-label",
    cell.style.label + " " + WEAPON_NAMES[cell.weaponId] + "动态预览",
  );
  card.append(heading, canvas);
  matrix.append(card);
  cell.card = card;
  cell.canvas = canvas;
  cell.context = canvas.getContext("2d");

  const open = () => {
    if (!cell.images || cell.error) return;
    openReviewDialog(cell);
  };
  card.addEventListener("click", open);
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  });
}

function markCellError(cell, error) {
  cell.error = error;
  cell.card.dataset.state = "error";
  cell.card.removeAttribute("role");
  cell.card.removeAttribute("tabindex");
  const canvas = cell.canvas;
  const message = document.createElement("p");
  message.className = "cell-error";
  message.textContent = error.message;
  canvas.replaceWith(message);
}

function drawReviewSegment(context, image, from, to, limbHeight) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (!Number.isFinite(length) || !image?.naturalWidth) return false;
  context.save();
  context.translate(from.x, from.y);
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x));
  context.scale(
    length / (0.88 * image.naturalWidth),
    limbHeight / image.naturalHeight,
  );
  context.drawImage(
    image,
    -0.06 * image.naturalWidth,
    -0.5 * image.naturalHeight,
  );
  context.restore();
  return true;
}

function drawReviewArm(context, cell, pose, side) {
  const styleArm = cell.style.visual[side];
  if (!styleArm || !pose) return false;
  drawReviewSegment(
    context,
    cell.images[side + "Upper"],
    pose.shoulder,
    pose.elbow,
    cell.style.visual.limbHeight,
  );
  drawReviewSegment(
    context,
    cell.images[side + "Forearm"],
    pose.elbow,
    pose.hand,
    cell.style.visual.limbHeight,
  );
  return true;
}

function drawReviewBody(context, cell) {
  const image = cell.images.body;
  const rect = cell.style.visual.bodyDraw;
  if (!image?.naturalWidth || !Number.isFinite(rect?.width)) return false;
  context.save();
  context.rotate(BODY_FACING_ROTATION);
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  context.restore();
  return true;
}

function motionRatios(cell, time) {
  if (cell.weaponId === "watermelon") {
    const phase =
      ((time + cell.reviewIndex * 83) % 3600) / 3600;
    const chargeRatio = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    return {
      chargeRatio,
      recoilRatio: 0,
      feedbackRatio: chargeRatio,
    };
  }
  const recoilRatio = smoothRecoilRatio(cell, time);
  return {
    chargeRatio: 0,
    recoilRatio,
    feedbackRatio: Math.max(recoilRatio, 0.2),
  };
}

function smoothRecoilRatio(cell, time) {
  const phase =
    ((time + cell.reviewIndex * 91) % PREVIEW_SHOT_CYCLE) /
    PREVIEW_SHOT_CYCLE;
  if (phase >= PREVIEW_SHOT_WINDOW) return 0;
  const progress = phase / PREVIEW_SHOT_WINDOW;
  return Math.sin(progress * Math.PI) ** 2 * PREVIEW_RECOIL_SCALE;
}

function renderCellToCanvas(cell, canvas, time) {
  if (!cell.images || cell.error) return;
  const context = canvas.getContext("2d");
  const large = canvas === dialogCanvas;
  const width = large ? 640 : 220;
  const height = large ? 480 : 180;
  const pixelRatio = 2;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width * 0.42, height * 0.53);
  context.scale(large ? 3.1 : 1.28, large ? 3.1 : 1.28);
  context.rotate(-0.12);

  const ratios = motionRatios(cell, time);
  const grips = resolveWeaponGripPoints(cell.weapon, ratios.recoilRatio);
  const pose = resolvePlayerArmPoseForRig(
    grips,
    cell.style.visual,
    { chargeRatio: ratios.chargeRatio },
  );
  if (!pose) {
    context.restore();
    return;
  }
  const drawOptions = {
    ...ratios,
    time: time / 1000,
  };
  drawReviewBody(context, cell);
  drawReviewArm(context, cell, pose.far, "far");
  drawWeaponModel(context, cell.images.weapon, cell.weapon, drawOptions);
  drawReviewArm(context, cell, pose.near, "near");
  context.restore();
}

function openReviewDialog(cell) {
  if (selectedCard) delete selectedCard.dataset.state;
  selectedCell = cell;
  selectedCard = cell.card;
  selectedCard.dataset.state = "selected";
  dialogTitle.textContent =
    cell.style.label + " × " + WEAPON_NAMES[cell.weaponId];
  dialog.showModal();
}

function closeReviewDialog() {
  if (dialog.open) dialog.close();
}

closeDialogButton.addEventListener("click", closeReviewDialog);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeReviewDialog();
});
dialog.addEventListener("close", () => {
  if (selectedCard) {
    delete selectedCard.dataset.state;
    selectedCard.focus();
  }
  selectedCell = null;
  selectedCard = null;
});

function updatePauseButton() {
  pauseButton.textContent = paused ? "继续动画" : "暂停动画";
  pauseButton.setAttribute(
    "aria-label",
    paused ? "继续动画" : "暂停动画",
  );
  pauseButton.setAttribute("aria-pressed", String(paused));
}

pauseButton.addEventListener("click", () => {
  paused = !paused;
  updatePauseButton();
});
updatePauseButton();

const cells = buildStyleWeaponReviewCells().map((definition, reviewIndex) => ({
  ...createCellState(definition),
  reviewIndex,
}));
for (const cell of cells) createCard(cell);

const loadingResults = await Promise.allSettled(
  cells.map(async (cell) => {
    try {
      cell.images = await loadCellImages(cell);
      cell.card.dataset.state = "ready";
    } catch (error) {
      markCellError(cell, error);
      throw error;
    }
  }),
);
const failedCount = loadingResults.filter(
  (result) => result.status === "rejected",
).length;
status.textContent = failedCount
  ? "已加载 " + (cells.length - failedCount) + "/27；" + failedCount + " 格资源失败。"
  : "27 组适配已就绪；点击任意组合放大检查。";
if (failedCount) status.dataset.state = "error";

function drawFrame(now) {
  const elapsed = Math.min(50, Math.max(0, now - lastFrameTime));
  lastFrameTime = now;
  if (!paused) animationTime += elapsed;
  for (const cell of cells) renderCellToCanvas(cell, cell.canvas, animationTime);
  if (selectedCell && dialog.open) {
    renderCellToCanvas(selectedCell, dialogCanvas, animationTime);
  }
  requestAnimationFrame(drawFrame);
}

requestAnimationFrame(drawFrame);
