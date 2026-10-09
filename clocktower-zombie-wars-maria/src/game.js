import { drawArenaObstacle, prepareArenaObstacles } from "/arena-props.js";
import { createScoreboard } from "/scoreboard.js";
import { advanceBossLocomotion, updateBossCombat, bossStrikeTouches, bossAttackPose, steerBoss, bossAnimationTime, bossSpriteLayers, chooseBossSpawnPosition, resolveBossPosition } from "/boss-combat.js";
import { drawBossCombat, drawBossShockwave } from "/boss-effects.js";
import { TRAINING_DUMMY_TEXTURE_SRC, createTrainingLab, ensureTrainingDummy, recordTrainingDamage, resetTrainingDamage, updateTrainingLab, drawTrainingDummy } from "/training-dummy.js";
import { ARENA_FLOOR_TEXTURE_SRC, drawArenaFloor } from "/arena-background.js";
import { TANK_TEXTURE_SRC, drawTank } from "/tank-visual.js";
import { TURRET_TEXTURE_SRC, drawAutomaticTurret, createTurretReview, updateTurretReview } from "/turret-visual.js";
import { UPRIGHT_REVIEW_ASSETS, prepareUprightReviewSprites, drawUprightReviewPlayer, uprightMuzzlePoint, advanceUprightGait } from "/player-upright-review.js";
import {
  rollRareButterfly, createRareButterfly, grantButterflyBuff, butterflyDamageMultiplier, butterflySpeedMultiplier,
  ARENA_PILLARS,
  STRUCTURE_LIMITS,
  DODGE,
  HEIGHT,
  TAU,
  WIDTH,
  applyKill,
  bossHealthForWave,
  bossProfilesForWave,
  buildWave,
  canPlace,
  clamp,
  createGameState,
  distance,
  enemyStats,
  flameDamageAtDistance,
  getStableRollPose,
  healthAfterPack,
  isPlayerInvulnerable,
  isSurvivalOver,
  lightningRingCount,
  isLightningBurstUnlocked,
  LIGHTNING_BURST_UNLOCK_WAVE,
  normalize,
  requestDodge,
  resolveDodgeDirection,
  resolveGroundCollision,
  resetWaveLightning,
  rewardBossKill,
  startDodge,
  tickDodge,
  tickCombo,
  scoreMultiplierForCombo,
  unlockWeaponsForProgress,
  tickLightningHitEffects,
  tickLightningRingLifetime,
  upsertLightningHitEffect,
  weapons,
} from "/game-core.js";
import {
  DEVELOPER_LIMITS,
  applyDeveloperWave,
  canOpenDeveloperReward,
  createDeveloperSession,
  getEnemySpawnLimit,
  hasUsableAmmo,
  normalizeDeveloperInteger,
  shouldConsumeAmmo,
  unlockDeveloperWeapons,
} from "/developer-mode.js";
import {
  AMMO_SUPPLIES,
  ammoFillRatio,
  resolveAmmoPickup,
  rollEnemyDrops,
} from "/supply-drops.js";
import { absorbShieldDamage, refillShield, shieldCapacity } from "/player-shield.js";
import {
  applyPlayerUpgrade,
  buildPlayerCandidates,
  buildWeaponCandidates,
  chooseRewardCategory,
  claimReward,
  openRewardSession,
  playerModifiers,
} from "/reward-progression.js";
import {
  WEAPON_TRAITS,
  availableWeaponTraits,
  incrementWeaponTrait,
  traitLevel,
  weaponStat,
} from "/weapon-traits.js";
import {
  advanceRicochetProjectile,
  applyFreezeStatus,
  buildArrowRainLayout,
  createArrowRain,
  pointInArrowRain,
  buildLightningArcGeometry,
  buildSeedAngles,
  buildWatermelonSliceAngles,
  buildLightningNetwork,
  freezeDamageMultiplier,
  freezeTargetClass,
  rayArenaIntersection,
  reflectRayAtBoundary,
  selectLightningTarget,
  shotgunPelletAngles,
  strongestSlow,
  watermelonChargeStats,
} from "/weapon-effects.js";
import {
  HANDHELD_WEAPON_IDS,
  WEAPON_VISUALS,
  resolveWeaponVisual,
  tickWeaponVisual,
  triggerWeaponVisual,
  weaponVisualRatios,
} from "/weapon-visuals.js";
import {
  PLAYER_RIG_ASSETS,
  PLAYER_RIG_VISUAL,
  drawPlayerArm,
  drawPlayerBody,
  resolvePlayerArmPose,
} from "/player-arm-rig.js";
import {
  PLAYER_WEAPON_HAND_ASSET_ENTRIES,
  resolvePlayerRigImages,
  resolvePlayerWeaponHandProfile,
} from "/player-weapon-hands.js";
import {
  ADULT_REVIEW_BODY,
  ADULT_REVIEW_PISTOL,
  ADULT_REVIEW_PALM,
  adultMuzzlePoint,
  createAdultReview,
  drawAdultReviewPlayer,
  updateAdultReviewMagnifier,
} from "/player-adult-review.js";
import {
  drawWeaponModel,
  resolveWeaponGripPoints,
} from "/player-weapon-renderer.js";
import {
  TANK_TRIAL_STAGES,
  buildTankTrialWave,
  canOfferTankTrial,
  createTankTrialGame,
  createTankTrialSession,
  creditTankTrialKill,
  dismissTankTrialOffer,
  failTankTrial,
  finishTankTrialStage,
  restoreTankTrialGame,
  startTankTrial,
} from "/tank-trial.js";
import {
  advanceToxicGasTrail,
  createToxicGasTrailState,
} from "/toxic-gas-trail.js";
import {
  buildWaveEnhancements,
  consumeWaveEnhancement,
} from "/random-wave-enhancements.js";
import {
  SPIKE_TRAP_ENEMY_DAMAGE,
  SPIKE_TRAP_PLAYER_DAMAGE,
  MUD_SLOW_AMOUNT,
  VINE_BIND_SECONDS,
  VINE_REARM_SECONDS,
  activateSpikeTraps,
  activateTerrainTraps,
  advanceSpikeTrap,
  advanceTerrainTrap,
  createWaveTraps,
  isSpikeTrapTouching,
  isTerrainTrapTouching,
} from "/spike-traps.js";
import {
  ENEMY_KINDS,
  ZOMBIE_ACTIONS,
  ZOMBIE_ATLAS,
  advanceZombieDeaths,
  resolveEnemyVisual,
  resolveZombieAction,
  resolveZombieSourceRect,
  bossSpriteGroundOffset,
} from "/zombie-animation.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const titlePanel = document.querySelector("#titlePanel");
const pausePanel = document.querySelector("#pausePanel");
const gameOverPanel = document.querySelector("#gameOverPanel");
const hud = document.querySelector("#hud");
const healthFill = document.querySelector("#healthFill");
const shieldMeter = document.querySelector("#shieldMeter");
const shieldFill = document.querySelector("#shieldFill");
const healthText = document.querySelector("#healthText");
const scoreText = document.querySelector("#scoreText");
const comboText = document.querySelector("#comboText");
const waveText = document.querySelector("#waveText");
const weaponBar = document.querySelector("#weaponBar");
const dodgeIndicator = document.querySelector("#dodgeIndicator");
const ultimateTimerText = document.querySelector("#ultimateTimer");
const lightningCountText = document.querySelector("#lightningCount");
const bossBar = document.querySelector("#bossBar");
const bossHealthFill = document.querySelector("#bossHealthFill");
const startButton = document.querySelector("#startButton");
let scoreStorage = null;
try { scoreStorage = globalThis.localStorage; } catch { /* Private browsing may disable storage. */ }
const scoreBoard = createScoreboard(document, scoreStorage);
const atlasStatus = document.querySelector("#atlasStatus");
const developerModeToggle = document.querySelector("#developerModeToggle");
const developerToolbar = document.querySelector("#developerToolbar");
const developerTotalCount = document.querySelector("#developerTotalCount");
const developerConcurrentLimit = document.querySelector("#developerConcurrentLimit");
const developerWave = document.querySelector("#developerWave");
const developerWeapon = document.querySelector("#developerWeapon");
const developerInfiniteAmmo = document.querySelector("#developerInfiniteAmmo");
const developerInvincible = document.querySelector("#developerInvincible");
const applyDeveloperSettings = document.querySelector("#applyDeveloperSettings");
const openDeveloperReward = document.querySelector("#openDeveloperReward");
const developerStatus = document.querySelector("#developerStatus");
const rewardDialog = document.querySelector("#rewardDialog");
const rewardWaveLabel = document.querySelector("#rewardWaveLabel");
const rewardCategoryChoices = document.querySelector("#rewardCategoryChoices");
const rewardTraitChoices = document.querySelector("#rewardTraitChoices");
const rewardStatus = document.querySelector("#rewardStatus");
const tankTrialEntry = document.querySelector("#tankTrialEntry");
const tankTrialDialog = document.querySelector("#tankTrialDialog");
const tankTrialArts = document.querySelectorAll("[data-tank-trial-art]");
const tankTrialStatus = document.querySelector("#tankTrialStatus");
const tankTrialResult = document.querySelector("#tankTrialResult");
const tankTrialStage = document.querySelector("#tankTrialStage");
const tankTrialFragmentsText = document.querySelector("#tankTrialFragmentsText");
const tankTrialScore = document.querySelector("#tankTrialScore");
const declineTankTrial = document.querySelector("#declineTankTrial");
const acceptTankTrial = document.querySelector("#acceptTankTrial");
const ultimateStatus = document.querySelector("#ultimateStatus");

developerWeapon.innerHTML = weapons
  .map((weapon) => `<option value="${weapon.id}">${weapon.name}</option>`)
  .join("");

const playerRigSprites = Object.create(null);
const weaponSprites = new Map();
let turretTexture = null;
let tankTexture = null;
let arenaFloorTexture = null;
let trainingDummyTexture = null;
const turretReview = createTurretReview(globalThis.location?.search ?? "", document);
const tankReview = turretReview ? null : createTurretReview(globalThis.location?.search ?? "", document, "tank");
const trainingLab = createTrainingLab(globalThis.location?.search ?? "", document);
if (trainingLab) trainingLab.reset.addEventListener("click", () => {
  resetTrainingDamage(game.enemies.find(enemy => enemy.isTrainingDummy));
  trainingLab.lastPaint = -Infinity;
});
if (trainingLab) {
  for (const [color, label] of [["blue", "生成蓝蝶"], ["yellow", "生成黄蝶"]]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.style.margin = "8px 6px 0 0";
    button.addEventListener("click", () => { if (game.mode === "playing") spawnRareButterfly(color); });
    trainingLab.panel.append(button);
  }
}

const modelLab = new URLSearchParams(globalThis.location?.search ?? "").get("modelLab") === "1";
document.body.classList.add("game-performance");
if (modelLab) document.body.classList.add("model-lab");
{
  // Simulation and pointer mapping remain 1600x900. Only the backing store
  // follows the display size, avoiding invisible pixels on smaller screens.
  const resizeLabCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(1, rect.width / WIDTH);
    const width = Math.max(1, Math.round(WIDTH * scale));
    const height = Math.max(1, Math.round(HEIGHT * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      context.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
    }
  };
  resizeLabCanvas();
  if (typeof ResizeObserver === "function") new ResizeObserver(resizeLabCanvas).observe(canvas);
  else window.addEventListener("resize", resizeLabCanvas);
}
const adultReview = createAdultReview(globalThis.location?.search ?? "", document);
developerModeToggle.checked = Boolean(modelLab || turretReview || tankReview);
if (adultReview && (!modelLab || turretReview || tankReview)) adultReview.panel.hidden = true;

const watermelonProjectileSprite = new Image();
watermelonProjectileSprite.src = "/watermelon-projectile.png";
const ammoCrateSprite = new Image();
ammoCrateSprite.src = "/ammo-crate.png";
const shieldPickupSprite = new Image();
shieldPickupSprite.src = "/shield-pickup.png";

const enemyAtlases = new Map();
let enemyAtlasesReady = false;

function loadImageAsset(src, label, maxDimension = 0) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", async () => {
      if (maxDimension && Math.max(image.naturalWidth, image.naturalHeight) > maxDimension && typeof createImageBitmap === "function") {
        try {
          const ratio = maxDimension / Math.max(image.naturalWidth, image.naturalHeight);
          const resized = await createImageBitmap(image, {
            resizeWidth: Math.max(1, Math.round(image.naturalWidth * ratio)),
            resizeHeight: Math.max(1, Math.round(image.naturalHeight * ratio)), resizeQuality: "high",
          });
          resized.naturalWidth = resized.width; resized.naturalHeight = resized.height; resized.complete = true;
          resolve(resized);
          return;
        } catch { /* Older browsers retain the original decoded image. */ }
      }
      resolve(image);
    }, { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error(label + "加载失败：" + src)),
      { once: true },
    );
    image.src = src;
  });
}

async function loadPlayerVisualAssets() {
  [turretTexture, tankTexture, arenaFloorTexture, trainingDummyTexture] = await Promise.all([
    loadImageAsset(TURRET_TEXTURE_SRC, "自动炮台贴图"),
    loadImageAsset(TANK_TEXTURE_SRC, "坦克贴图"),
    loadImageAsset(ARENA_FLOOR_TEXTURE_SRC, "废弃城市石板广场", 512),
    modelLab ? loadImageAsset(TRAINING_DUMMY_TEXTURE_SRC, "训练稻草人", 256) : Promise.resolve(null),
  ]);
  if (adultReview?.mode === "upright") {
    adultReview.atlas = Object.fromEntries(await Promise.all(
      Object.entries(UPRIGHT_REVIEW_ASSETS).map(async ([id, src]) => [id, await loadImageAsset(src, "成人正面 " + id)]),
    ));
  } else if (adultReview) {
    [adultReview.body, adultReview.pistol, adultReview.palm] = await Promise.all([
      loadImageAsset(ADULT_REVIEW_BODY, "成人猎人测试身体"),
      loadImageAsset(ADULT_REVIEW_PISTOL, "成人独立手掌手枪"),
      loadImageAsset(ADULT_REVIEW_PALM, "成人独立手掌"),
    ]);
  }
  await Promise.all([
    adultReview?.mode === "upright" ? Promise.resolve() : loadComparisonRig(),
    ...HANDHELD_WEAPON_IDS.map(async weaponId => {
      const image = await loadImageAsset(WEAPON_VISUALS[weaponId].src, weaponId + " 枪械资源", 512);
      weaponSprites.set(weaponId, image);
    }),
  ]);
  if (adultReview?.mode === "upright") {
    await prepareUprightReviewSprites(adultReview.atlas, weaponSprites.values());
  }
  return true;
}

let comparisonRigPromise = null;
function loadComparisonRig() {
  if (!comparisonRigPromise) {
    comparisonRigPromise = Promise.all([
      ...Object.entries(PLAYER_RIG_ASSETS).map(async ([id, src]) => [id, await loadImageAsset(src, "Maria " + id, 512)]),
      ...PLAYER_WEAPON_HAND_ASSET_ENTRIES.map(async ({key, route}) => [key, await loadImageAsset(route, "Q 版 " + key, 512)]),
    ]).then(entries => {
      Object.assign(playerRigSprites, Object.fromEntries(entries));
    }).catch(error => {
      comparisonRigPromise = null;
      throw error;
    });
  }
  return comparisonRigPromise;
}

if (adultReview?.mode === "upright") {
  adultReview.enabled.addEventListener("change", async () => {
    if (adultReview.enabled.checked || playerRigSprites.body) return;
    // Keep the adult visible until the complete comparison rig is ready.
    adultReview.enabled.checked = true;
    adultReview.enabled.disabled = true;
    try {
      await loadComparisonRig();
      adultReview.enabled.checked = false;
      adultReview.loadError = "";
    } catch {
      adultReview.loadError = "对照角色加载失败，请再次取消勾选重试。";
    } finally {
      adultReview.enabled.disabled = false;
    }
  });
}

function loadEnemyAtlas(kind) {
  const visual = resolveEnemyVisual(kind);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      if (
        image.naturalWidth !== ZOMBIE_ATLAS.width ||
        image.naturalHeight !== ZOMBIE_ATLAS.height
      ) {
        reject(new Error(`${kind} 图集尺寸错误`));
        return;
      }
      enemyAtlases.set(kind, image);
      resolve();
    });
    image.addEventListener("error", () => {
      reject(new Error(`${kind} 图集加载失败`));
    });
    image.src = visual.src;
  });
}

startButton.disabled = true;
Promise.all([
  modelLab ? Promise.resolve() : Promise.all(ENEMY_KINDS.map(loadEnemyAtlas)),
  loadPlayerVisualAssets(),
])
  .then(async () => {
    await prepareArenaObstacles(staticObstacles);
    enemyAtlasesReady = true;
    startButton.disabled = false;
    atlasStatus.dataset.state = "ready";
    atlasStatus.textContent = "丧尸、人物与枪械素材已就绪";
    if (typeof modelLab !== "undefined" && modelLab) resetGame();
  })
  .catch((error) => {
    enemyAtlasesReady = false;
    startButton.disabled = true;
    atlasStatus.dataset.state = "error";
    atlasStatus.textContent = "素材加载失败：" + error.message;
    console.error(error);
  });

const keys = new Set();
const mouse = { x: WIDTH / 2, y: HEIGHT / 2, down: false };
let game = createGameState();
let developerSession = createDeveloperSession(false);
let rewardReturnFocus = null;
let tankTrialSession = createTankTrialSession();
let tankTrialSnapshot = null;
let tankTrialReturnFocus = null;
let tankTrialResultTimer = null;
let lastFrame = performance.now();
let accumulator = 0;
let sound = null;
let records = loadRecords();

document.querySelector("#highScore").textContent = pad(records.highScore);
document.querySelector("#highWave").textContent = String(records.highWave).padStart(2, "0");

const staticObstacles = modelLab ? [] : [
  ...ARENA_PILLARS.map((pillar) => ({ ...pillar, type: "pillar" })),
  { x: 170, y: 170, rx: 105, ry: 55, type: "rock" },
  { x: 1430, y: 720, rx: 105, ry: 62, type: "rock" },
  { x: 1290, y: 155, rx: 34, ry: 30, type: "tree" },
  { x: 260, y: 735, rx: 34, ry: 30, type: "tree" },
  { x: 1100, y: 610, rx: 24, ry: 24, type: "grave" },
  { x: 450, y: 300, rx: 24, ry: 24, type: "grave" },
  { x: 760, y: 170, rx: 24, ry: 24, type: "grave" },
  { x: 830, y: 750, rx: 34, ry: 30, type: "tree" },
];

function loadRecords() {
  const fallback = { highScore: 0, highWave: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem("clocktower-records") || "null");
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      highScore: Number.isFinite(parsed.highScore) ? parsed.highScore : 0,
      highWave: Number.isFinite(parsed.highWave) ? parsed.highWave : 0,
    };
  } catch {
    return fallback;
  }
}

function saveRecords() {
  try {
    localStorage.setItem("clocktower-records", JSON.stringify(records));
  } catch {
    // 本地存储不可用时不影响游戏。
  }
}

function pad(value) {
  return Math.max(0, Math.floor(value)).toString().padStart(8, "0");
}

function createSound() {
  try {
    const audio = new AudioContext();
    return (frequency, duration = 0.045, volume = 0.035, type = "square") => {
      if (audio.state === "suspended") audio.resume();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    };
  } catch {
    return () => {};
  }
}

function ensureSound() {
  if (!sound) sound = createSound();
  return sound;
}

function resetGame() {
  clearTankTrialResult();
  game = createGameState();
  developerSession = createDeveloperSession(developerModeToggle.checked);
  tankTrialSession = createTankTrialSession();
  tankTrialSnapshot = null;
  tankTrialReturnFocus = null;
  rewardReturnFocus = null;
  rewardDialog.hidden = true;
  tankTrialDialog.hidden = true;
  tankTrialEntry.hidden = true;
  tankTrialStatus.hidden = true;
  ultimateStatus.hidden = false;
  if (developerSession.enabled) unlockDeveloperWeapons(game);
  developerToolbar.hidden = !developerSession.enabled;
  if (typeof modelLab !== "undefined" && modelLab) {
    developerSession.infiniteAmmo = true;
    game.enemies = []; game.waveQueue = []; game.pickups = []; game.hazards = [];
    ensureTrainingDummy(game);
    game.notice = "模型检验场 · WASD 移动 · 鼠标瞄准 / 射击 · 1–9 换枪";
    game.noticeTimer = 8;
    if (typeof turretReview !== "undefined" && turretReview) {
      game.structures.push({ id: game.nextId++, kind: "turret", x: game.player.x - 120,
        y: game.player.y - 20, radius: 24, health: 120, maxHealth: 120, cooldown: 0, aimAngle: 0 });
      game.notice = "自动炮台检验场 · 右侧放大图可手动转向";
    }
    if (typeof tankReview !== "undefined" && tankReview) {
      game.structures.push({ id: game.nextId++, kind: "tank", x: game.player.x - 120,
        y: game.player.y - 20, radius: 38, health: 420, maxHealth: 420, cooldown: 0, aimAngle: 0, bodyAngle: 0 });
      game.notice = "坦克检验场 · 右侧放大图可手动转向";
      game.player.weapon = "tank";
    }
    if (adultReview) {
      adultReview.panel.querySelector("strong").textContent = `模型检验场 · ${adultReview.view?.value === "side" ? "侧面" : "正面"}全身动态检视`;
      adultReview.panel.style.width = "min(480px,42vw)";
    }
    for (const child of developerToolbar.children) child.hidden = !child.contains(developerWeapon);
    const labStyle = document.querySelector("#modelLabStyle") ?? document.createElement("style");
    labStyle.id = "modelLabStyle";
    labStyle.textContent = "#hud,#tankTrialEntry,#ultimateStatus{display:none!important}";
    document.head.append(labStyle);
  }
  syncDeveloperControls();
  game.scoreboardAssisted = developerSession.enabled || (typeof modelLab !== "undefined" && modelLab);
  game.mode = "playing";
  gameOverPanel.querySelector(".chapter").textContent = "猎杀结束";
  titlePanel.hidden = true;
  pausePanel.hidden = true;
  gameOverPanel.hidden = true;
  hud.hidden = false;
  mouse.down = false;
  ensureSound()(196, 0.12, 0.04, "sine");
  renderWeaponBar();
}

function returnToTitle() {
  clearTankTrialResult();
  game.mode = "title";
  tankTrialSession = createTankTrialSession();
  tankTrialSnapshot = null;
  tankTrialReturnFocus = null;
  rewardReturnFocus = null;
  rewardDialog.hidden = true;
  tankTrialDialog.hidden = true;
  tankTrialEntry.hidden = true;
  tankTrialStatus.hidden = true;
  ultimateStatus.hidden = false;
  developerToolbar.hidden = true;
  titlePanel.hidden = false;
  pausePanel.hidden = true;
  gameOverPanel.hidden = true;
  hud.hidden = true;
  document.querySelector("#highScore").textContent = pad(records.highScore);
  document.querySelector("#highWave").textContent = String(records.highWave).padStart(2, "0");
}

function syncDeveloperControls() {
  developerTotalCount.value = developerSession.totalCount;
  developerConcurrentLimit.value = developerSession.concurrentLimit;
  developerWave.value = developerSession.targetWave;
  developerWeapon.value = developerSession.weapon;
  developerInfiniteAmmo.checked = developerSession.infiniteAmmo;
  developerInvincible.checked = developerSession.invincible;
}

function createNextDeveloperSession() {
  return {
    ...developerSession,
    totalCount: normalizeDeveloperInteger(
      developerTotalCount.value,
      developerSession.totalCount,
      DEVELOPER_LIMITS.totalCount,
    ),
    concurrentLimit: normalizeDeveloperInteger(
      developerConcurrentLimit.value,
      developerSession.concurrentLimit,
      DEVELOPER_LIMITS.concurrentLimit,
    ),
    targetWave: normalizeDeveloperInteger(
      developerWave.value,
      developerSession.targetWave,
      DEVELOPER_LIMITS.targetWave,
    ),
  };
}

function applyDeveloperControls() {
  if (!developerSession.enabled) return;
  let nextSession;
  try {
    nextSession = createNextDeveloperSession();
    applyDeveloperWave(game, nextSession, Math.random, {
      width: WIDTH,
      height: HEIGHT,
      obstacles: staticObstacles,
    });
  } catch (error) {
    developerStatus.textContent = `应用失败：${error.message}`;
    return;
  }

  developerSession = nextSession;
  developerStatus.textContent = `已应用第 ${developerSession.targetWave} 波`;
  try {
    syncDeveloperControls();
    updateHud();
  } catch (error) {
    console.error("开发者设置已应用，但界面刷新失败", error);
  }
}

function normalizeDeveloperControl(input, key, limits) {
  input.value = normalizeDeveloperInteger(input.value, developerSession[key], limits);
}

function tankTrialOfferInput() {
  return {
    developerEnabled: developerSession.enabled,
    unlocked: game.unlocked,
    wave: game.wave,
    waveQueueLength: game.waveQueue.length,
    enemyCount: game.enemies.filter(enemy => !enemy.isRareButterfly).length,
    intermission: game.intermission,
    dismissedWave: tankTrialSession.dismissedWave,
  };
}

function developerRewardInput() {
  return {
    developerEnabled: developerSession.enabled,
    mode: game.mode,
    wave: game.wave,
    waveQueueLength: game.waveQueue.length,
    enemyCount: game.enemies.filter(enemy => !enemy.isRareButterfly).length,
    intermission: game.intermission,
    rewardActive: game.rewardSession.active,
    tankTrialActive: tankTrialSession.active,
    claimedWaves: game.rewardSession.claimedWaves,
  };
}

function openDeveloperRewardFromToolbar() {
  if (!canOpenDeveloperReward(developerRewardInput())) return false;
  const nextSession = openRewardSession(game.rewardSession, game.wave);
  if (nextSession === game.rewardSession || !nextSession.active) return false;
  game.rewardSession = nextSession;
  game.notice = `第 ${game.wave} 波奖励`;
  game.noticeTimer = 0.15;
  return openRewardDialog();
}

function clearTankTrialResult() {
  if (tankTrialResultTimer !== null) clearTimeout(tankTrialResultTimer);
  tankTrialResultTimer = null;
  tankTrialResult.hidden = true;
  tankTrialResult.textContent = "";
}

function showTankTrialResult(message) {
  clearTankTrialResult();
  tankTrialResult.textContent = message;
  tankTrialResult.hidden = false;
  tankTrialResultTimer = setTimeout(() => {
    tankTrialResult.hidden = true;
    tankTrialResult.textContent = "";
    tankTrialResultTimer = null;
  }, 2400);
}

function renderTankTrialFragments() {
  for (const art of tankTrialArts) {
    for (const fragment of art.querySelectorAll("[data-trial-fragment]")) {
      const collected =
        Number(fragment.dataset.trialFragment) <= tankTrialSession.fragments;
      fragment.classList.toggle("collected", collected);
    }
    art.dataset.fragments = String(tankTrialSession.fragments);
  }
}

function restorePromptFocus(target) {
  const hiddenAncestor = target?.closest?.("[hidden]");
  if (
    target &&
    target.isConnected !== false &&
    target.hidden !== true &&
    !hiddenAncestor &&
    typeof target.focus === "function"
  ) {
    target.focus();
    if (document.activeElement === target) return target;
  }
  canvas.focus();
  return canvas;
}

function renderRewardCategories() {
  const weaponRewardsAvailable = game.unlocked.some(
    (weaponId) =>
      weaponId !== "tank" &&
      availableWeaponTraits(
        game.weaponUpgrades,
        weaponId,
        WEAPON_TRAITS,
      ).length > 0,
  );
  rewardCategoryChoices.hidden = false;
  rewardTraitChoices.hidden = true;
  rewardCategoryChoices.innerHTML = `
    <button class="reward-card reward-category-player" type="button" data-reward-category="player">
      <strong>人物属性</strong>
      <span>强化生命、移动、防御、拾取或治疗能力</span>
    </button>
    <button class="reward-card reward-category-weapon" type="button" data-reward-category="weapon"${weaponRewardsAvailable ? "" : " disabled"}>
      <strong>枪械属性</strong>
      <span>${weaponRewardsAvailable ? "选择一项枪械专属词条" : "已解锁枪械暂无可选词条"}</span>
    </button>`;
  rewardStatus.textContent = "选择一条成长路线";
  for (const button of rewardCategoryChoices.querySelectorAll("[data-reward-category]")) {
    button.addEventListener("click", () => {
      chooseRewardCategoryFromDialog(button.dataset.rewardCategory);
    });
  }
}

function renderRewardCandidates(focusSelected = false) {
  rewardCategoryChoices.hidden = true;
  rewardTraitChoices.hidden = false;
  rewardTraitChoices.innerHTML = game.rewardSession.candidates.map((candidate, index) => {
    const weapon = candidate.weaponId
      ? weapons.find(({ id }) => id === candidate.weaponId)
      : null;
    const weaponAttributes = candidate.weaponId
      ? ` data-weapon-id="${candidate.weaponId}" data-trait-id="${candidate.traitId}"`
      : "";
    const accessibleLabel = [
      weapon?.name,
      candidate.name,
      `当前等级 ${candidate.level}`,
      `下一等级：${candidate.description}`,
    ].filter(Boolean).join("，");
    return `
    <button
      class="reward-card ${index === game.rewardSession.selectedIndex ? "selected" : ""}"
      type="button"
      data-reward-trait="${candidate.id}"
      ${weaponAttributes}
      aria-pressed="${index === game.rewardSession.selectedIndex}"
      aria-label="${accessibleLabel}"
    >
      ${weapon ? `<small class="reward-weapon-name">${weapon.name}</small>` : ""}
      <strong>${candidate.name}</strong>
      <span>${candidate.description}</span>
      <small>当前 Lv.${candidate.level}</small>
      <small class="reward-next-level">下一等级：${candidate.description}</small>
    </button>`;
  }).join("");
  rewardStatus.textContent = "方向键切换，回车确认，Escape 返回";
  const buttons = [...rewardTraitChoices.querySelectorAll("[data-reward-trait]")];
  for (const button of buttons) {
    button.addEventListener("click", () => claimSelectedReward(button.dataset.rewardTrait));
  }
  if (focusSelected) buttons[game.rewardSession.selectedIndex]?.focus();
}

function openRewardDialog() {
  if (!game.rewardSession?.active) return false;
  cancelWatermelonCharge();
  game.delayedShots.length = 0;
  if (rewardDialog.hidden) rewardReturnFocus = document.activeElement;
  rewardDialog.hidden = false;
  rewardWaveLabel.textContent = `第 ${game.rewardSession.wave} 波奖励`;
  game.mode = "reward";
  mouse.down = false;
  if (game.rewardSession.stage === "traits") {
    renderRewardCandidates(true);
  } else {
    renderRewardCategories();
    rewardCategoryChoices.querySelector("button:not([disabled])")?.focus();
  }
  return true;
}

function chooseRewardCategoryFromDialog(category) {
  if (rewardDialog.hidden || !["player", "weapon"].includes(category)) {
    return false;
  }
  const candidates = category === "player"
    ? buildPlayerCandidates(game.playerUpgrades, Math.random)
    : buildWeaponCandidates(
        game.unlocked,
        game.weaponUpgrades,
        WEAPON_TRAITS,
        Math.random,
      );
  if (candidates.length === 0) {
    rewardStatus.textContent = "当前没有可领取的枪械词条";
    return false;
  }
  const nextSession = chooseRewardCategory(
    game.rewardSession,
    category,
    candidates,
  );
  if (nextSession === game.rewardSession) return false;
  game.rewardSession = nextSession;
  renderRewardCandidates(true);
  return true;
}

function claimSelectedReward(candidateId) {
  if (rewardDialog.hidden || game.rewardSession.stage !== "traits") return false;
  const candidate = game.rewardSession.candidates.find(
    ({ id }) => id === candidateId,
  );
  if (!candidate) return false;
  const nextSession = claimReward(game.rewardSession, candidate.id);
  if (nextSession === game.rewardSession) return false;
  if (game.rewardSession.category === "player") {
    const applied = applyPlayerUpgrade(
      game.player,
      game.playerUpgrades,
      candidate.id,
    );
    game.player = applied.player;
    game.playerUpgrades = applied.upgrades;
  } else if (game.rewardSession.category === "weapon") {
    const applied = incrementWeaponTrait(
      game.weaponUpgrades,
      candidate.weaponId,
      candidate.traitId,
      WEAPON_TRAITS,
    );
    game.weaponUpgrades = applied.upgrades;
    const currentAmmo = game.player.ammo?.[candidate.weaponId];
    if (applied.deltaCapacity > 0 && Number.isFinite(currentAmmo)) {
      game.player.ammo[candidate.weaponId] = currentAmmo + applied.deltaCapacity;
    }
    rewardStatus.textContent = `${candidate.name} 已提升`;
  }
  const returnFocus = rewardReturnFocus;
  game.rewardSession = nextSession;
  game.mode = "playing";
  rewardDialog.hidden = true;
  rewardReturnFocus = null;
  mouse.down = false;
  game.notice = `获得：${candidate.name}`;
  game.noticeTimer = 2.4;
  renderWeaponBar();
  restorePromptFocus(returnFocus);
  return true;
}

function returnRewardToCategories() {
  if (!game.rewardSession?.active || game.rewardSession.stage !== "traits") {
    return false;
  }
  game.rewardSession = {
    ...game.rewardSession,
    stage: "category",
    category: null,
    candidates: [],
    selectedIndex: 0,
  };
  renderRewardCategories();
  rewardCategoryChoices.querySelector("button:not([disabled])")?.focus();
  return true;
}

function handleRewardKeyDown(event) {
  if (rewardDialog.hidden) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    returnRewardToCategories();
    return true;
  }
  if (game.rewardSession.stage !== "traits") return true;
  const direction = {
    ArrowLeft: -1,
    ArrowUp: -1,
    ArrowRight: 1,
    ArrowDown: 1,
  }[event.key];
  if (direction) {
    event.preventDefault();
    const count = game.rewardSession.candidates.length;
    game.rewardSession = {
      ...game.rewardSession,
      selectedIndex:
        (game.rewardSession.selectedIndex + direction + count) % count,
    };
    renderRewardCandidates(true);
    return true;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const selected = game.rewardSession.candidates[game.rewardSession.selectedIndex];
    if (selected) claimSelectedReward(selected.id);
  }
  return true;
}

function openTankTrialDialog() {
  if (tankTrialSession.active || !canOfferTankTrial(tankTrialOfferInput())) {
    return false;
  }
  cancelWatermelonCharge();
  game.delayedShots.length = 0;
  clearTankTrialResult();
  tankTrialReturnFocus = document.activeElement;
  tankTrialDialog.hidden = false;
  game.mode = "trial-prompt";
  mouse.down = false;
  renderTankTrialFragments();
  declineTankTrial.focus();
  return true;
}

function declineTankTrialDialog() {
  if (tankTrialDialog.hidden) return;
  const returnFocus = tankTrialReturnFocus;
  tankTrialSession = dismissTankTrialOffer(tankTrialSession, game.wave);
  tankTrialDialog.hidden = true;
  game.mode = "playing";
  tankTrialReturnFocus = null;
  restorePromptFocus(returnFocus);
}

function acceptTankTrialDialog() {
  if (tankTrialDialog.hidden) return;
  clearTankTrialResult();
  const promptMode = game.mode;
  let snapshot;
  let nextSession;
  let trialGame;
  try {
    game.mode = "playing";
    snapshot = structuredClone(game);
    nextSession = startTankTrial(tankTrialSession);
    trialGame = createTankTrialGame(nextSession);
  } catch (error) {
    game.mode = promptMode;
    console.error("无法创建坦克试炼", error);
    game.notice = "试炼创建失败，请稍后重试";
    game.noticeTimer = 2.4;
    return;
  }
  tankTrialSnapshot = snapshot;
  tankTrialSession = nextSession;
  game = trialGame;
  tankTrialDialog.hidden = true;
  tankTrialEntry.hidden = true;
  tankTrialStatus.hidden = false;
  ultimateStatus.hidden = true;
  tankTrialReturnFocus = null;
  mouse.down = false;
  renderTankTrialFragments();
  renderWeaponBar();
  restorePromptFocus(canvas);
}

function restoreFromTankTrial(completed, message) {
  let restored;
  try {
    restored = restoreTankTrialGame(tankTrialSnapshot, completed);
  } catch (error) {
    console.error("坦克试炼恢复失败", error);
    game = createGameState();
    atlasStatus.dataset.state = "error";
    atlasStatus.textContent = "试炼状态恢复失败，请重新开始";
    returnToTitle();
    return false;
  }
  game = restored;
  tankTrialSnapshot = null;
  tankTrialSession = completed
    ? createTankTrialSession()
    : dismissTankTrialOffer(createTankTrialSession(), game.wave);
  tankTrialDialog.hidden = true;
  tankTrialEntry.hidden = true;
  tankTrialStatus.hidden = true;
  ultimateStatus.hidden = false;
  tankTrialReturnFocus = null;
  showTankTrialResult(message);
  renderTankTrialFragments();
  renderWeaponBar();
  restorePromptFocus(canvas);
  return true;
}

function trapTankTrialFocus(event) {
  if (tankTrialDialog.hidden || event.key !== "Tab") return;
  const buttons = [...tankTrialDialog.querySelectorAll('button:not([disabled])')];
  if (buttons.length === 0) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (!buttons.includes(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function trapRewardFocus(event) {
  if (rewardDialog.hidden || event.key !== "Tab") return;
  const buttons = [...rewardDialog.querySelectorAll('button:not([disabled])')];
  if (buttons.length === 0) return;
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  if (!buttons.includes(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function cancelReload(player = game.player) {
  player.reload = 0;
  player.reloadWeapon = null;
}

function selectDeveloperWeapon(gameState, session, weaponId) {
  if (typeof tankTrialSession !== "undefined" && tankTrialSession.active) return false;
  if (!weapons.some((weapon) => weapon.id === weaponId)) return false;
  if (gameState.player.weapon !== weaponId) {
    cancelReload(gameState.player);
    cancelWatermelonCharge(gameState.player);
  }
  session.weapon = weaponId;
  gameState.player.weapon = weaponId;
  return true;
}

function togglePause(force) {
  if (!["playing", "paused"].includes(game.mode)) return;
  const next = force ?? game.mode !== "paused";
  game.mode = next ? "paused" : "playing";
  pausePanel.hidden = !next;
  cancelWatermelonCharge();
  game.delayedShots.length = 0;
  mouse.down = false;
}

startButton.addEventListener("click", () => {
  if (!enemyAtlasesReady) return;
  resetGame();
});
document.querySelector("#resumeButton").addEventListener("click", () => togglePause(false));
document.querySelector("#restartFromPause").addEventListener("click", resetGame);
document.querySelector("#restartButton").addEventListener("click", resetGame);
document.querySelector("#backButton").addEventListener("click", returnToTitle);
applyDeveloperSettings.addEventListener("click", applyDeveloperControls);
openDeveloperReward.addEventListener("click", openDeveloperRewardFromToolbar);
tankTrialEntry.addEventListener("click", openTankTrialDialog);
declineTankTrial.addEventListener("click", declineTankTrialDialog);
acceptTankTrial.addEventListener("click", acceptTankTrialDialog);
tankTrialDialog.addEventListener("keydown", trapTankTrialFocus);
rewardDialog.addEventListener("keydown", trapRewardFocus);
developerTotalCount.addEventListener("blur", () => {
  normalizeDeveloperControl(developerTotalCount, "totalCount", DEVELOPER_LIMITS.totalCount);
});
developerConcurrentLimit.addEventListener("blur", () => {
  normalizeDeveloperControl(
    developerConcurrentLimit,
    "concurrentLimit",
    DEVELOPER_LIMITS.concurrentLimit,
  );
});
developerWave.addEventListener("blur", () => {
  normalizeDeveloperControl(developerWave, "targetWave", DEVELOPER_LIMITS.targetWave);
});
developerWeapon.addEventListener("change", () => {
  if (!developerSession.enabled) return;
  if (!selectDeveloperWeapon(game, developerSession, developerWeapon.value)) {
    syncDeveloperControls();
    return;
  }
  renderWeaponBar();
});
developerInfiniteAmmo.addEventListener("change", () => {
  if (!developerSession.enabled) return;
  developerSession.infiniteAmmo = developerInfiniteAmmo.checked;
  renderWeaponBar();
});

developerInvincible.addEventListener("change", () => {
  if (!developerSession.enabled) return;
  developerSession.invincible = developerInvincible.checked;
  developerStatus.textContent = developerSession.invincible ? "无敌模式已开启" : "无敌模式已关闭";
});

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    "#developerToolbar input, #developerToolbar select, " +
    "#developerToolbar button, #developerToolbar output, " +
    "#rewardDialog button, #tankTrialDialog button, #tankTrialEntry",
  ));
}

function handleGameKeyDown(event) {
  if (typeof document !== "undefined" && document.querySelector("#scoreLeaderboard")?.open) return;
  if (!rewardDialog.hidden) {
    handleRewardKeyDown(event);
    return;
  }
  if (!tankTrialDialog.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      declineTankTrialDialog();
    }
    return;
  }
  if (isInteractiveTarget(event.target)) return;
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === "escape") {
    event.preventDefault();
    togglePause();
  }
  if (
    game.mode === "playing" &&
    (/^[1-9]$/.test(key) || key === "0" || key === "-")
  ) {
    const slot = key === "-" ? 10 : key === "0" ? 9 : Number(key) - 1;
    switchWeapon(slot);
  }
  if (key === "r" && game.mode === "playing") {
    beginReload();
  }
  if (key === " " && game.mode === "playing") {
    event.preventDefault();
    requestDodge(game.player, event.repeat);
  }
}

window.addEventListener("keydown", handleGameKeyDown);

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener("blur", () => togglePause(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) togglePause(true);
});

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  mouse.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (game.rewardSession.active || !rewardDialog.hidden || game.mode !== "playing") {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  mouse.y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
  mouse.down = true;
  if (game.player.weapon === "lightning") startArrowCharge();
  if (game.player.weapon === "watermelon") startWatermelonCharge();
  ensureSound();
});

window.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  releaseArrowCharge();
  releaseWatermelonCharge();
  mouse.down = false;
});

window.addEventListener("pointercancel", () => {
  cancelWatermelonCharge();
  mouse.down = false;
});

weaponBar.addEventListener("click", (event) => {
  if (
    game.mode !== "playing" ||
    game.rewardSession?.active ||
    (typeof rewardDialog !== "undefined" && !rewardDialog.hidden) ||
    (typeof tankTrialSession !== "undefined" && tankTrialSession.active)
  ) {
    return;
  }
  const slot = event.target.closest?.("[data-weapon-index]");
  const index = Number(slot?.dataset.weaponIndex);
  const weapon = weapons[index];
  if (!Number.isInteger(index) || !weapon || !game.unlocked.includes(weapon.id)) return;
  switchWeapon(index);
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (game.mode !== "playing") return;
    if (game.rewardSession?.active) return;
    if (typeof rewardDialog !== "undefined" && !rewardDialog.hidden) return;
    if (typeof tankTrialSession !== "undefined" && tankTrialSession.active) return;
    event.preventDefault();
    const current = game.unlocked.indexOf(game.player.weapon);
    const direction = Math.sign(event.deltaY);
    const next = (current + direction + game.unlocked.length) % game.unlocked.length;
    const nextWeapon = game.unlocked[next];
    if (game.player.weapon !== nextWeapon) {
      cancelReload();
      cancelWatermelonCharge();
    }
    game.player.weapon = nextWeapon;
    renderWeaponBar();
  },
  { passive: false },
);

function hasWeaponTrait(gameState, weaponId, traitId) {
  return traitLevel(gameState.weaponUpgrades, weaponId, traitId) > 0;
}

function pistolStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(32, upgrades, "pistol", "damage"),
    fireRate: weaponStat(0.24, upgrades, "pistol", "fire_rate"),
    bulletSpeed: weaponStat(870, upgrades, "pistol", "bullet_speed"),
    magazine: weaponStat(12, upgrades, "pistol", "magazine"),
    reloadTime: weaponStat(0.82, upgrades, "pistol", "reload"),
    critChance: weaponStat(0, upgrades, "pistol", "crit"),
  };
}

function shotgunStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    pellets: 9,
    damage: weaponStat(42, upgrades, "shotgun", "damage"),
    spread: weaponStat(0.055, upgrades, "shotgun", "spread"),
    magazine: weaponStat(8, upgrades, "shotgun", "magazine"),
    reloadTime: weaponStat(1.25, upgrades, "shotgun", "reload"),
    bulletSpeed: weaponStat(760, upgrades, "shotgun", "bullet_speed"),
  };
}

function rocketStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(105, upgrades, "rocket", "damage"),
    blastRadius: weaponStat(132, upgrades, "rocket", "blast_radius"),
    speed: weaponStat(520, upgrades, "rocket", "speed"),
    fireRate: weaponStat(1.1, upgrades, "rocket", "fire_rate"),
    capacity: weaponStat(12, upgrades, "rocket", "capacity"),
    supplyAmount: weaponStat(4, upgrades, "rocket", "supply"),
  };
}

function flamethrowerStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(12, upgrades, "flamethrower", "damage"),
    range: weaponStat(430, upgrades, "flamethrower", "range"),
    coneAngle: weaponStat(Math.acos(0.72), upgrades, "flamethrower", "cone"),
    fireRate: weaponStat(0.06, upgrades, "flamethrower", "fire_rate"),
    capacity: weaponStat(200, upgrades, "flamethrower", "capacity"),
    supplyAmount: weaponStat(100, upgrades, "flamethrower", "supply"),
  };
}

function laserStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(145, upgrades, "laser", "damage"),
    width: weaponStat(8, upgrades, "laser", "width"),
    range: weaponStat(980, upgrades, "laser", "range"),
    fireRate: weaponStat(1.35, upgrades, "laser", "fire_rate"),
    capacity: weaponStat(15, upgrades, "laser", "capacity"),
    supplyAmount: weaponStat(5, upgrades, "laser", "supply"),
  };
}

function ricochetStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(48, upgrades, "ricochet", "damage"),
    projectiles: weaponStat(3, upgrades, "ricochet", "projectiles"),
    bounces: weaponStat(8, upgrades, "ricochet", "bounces"),
    speed: weaponStat(620, upgrades, "ricochet", "speed"),
    radius: weaponStat(7, upgrades, "ricochet", "radius"),
    fireRate: weaponStat(0.85, upgrades, "ricochet", "fire_rate"),
  };
}

function lightningStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(60, upgrades, "lightning", "damage"),
    chainRange: weaponStat(230, upgrades, "lightning", "chain_range"),
    retention: weaponStat(0.75, upgrades, "lightning", "retention"),
    range: weaponStat(900, upgrades, "lightning", "speed"),
    fireRate: weaponStat(0.75, upgrades, "lightning", "fire_rate"),
    capacity: weaponStat(24, upgrades, "lightning", "capacity"),
  };
}

function freezeStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damage: weaponStat(42, upgrades, "freeze", "damage"),
    blastRadius: weaponStat(90, upgrades, "freeze", "blast_radius"),
    slowPerHit: weaponStat(0.25, upgrades, "freeze", "slow_per_hit"),
    duration: weaponStat(2.5, upgrades, "freeze", "duration"),
    speed: weaponStat(500, upgrades, "freeze", "speed"),
    capacity: weaponStat(30, upgrades, "freeze", "capacity"),
  };
}

function watermelonStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    damageMultiplier: weaponStat(1, upgrades, "watermelon", "damage"),
    blastRadiusMultiplier: weaponStat(1, upgrades, "watermelon", "blast_radius"),
    chargeTime: weaponStat(1.5, upgrades, "watermelon", "charge_time"),
    speedMultiplier: weaponStat(1, upgrades, "watermelon", "speed"),
    movementPenalty: weaponStat(0.2, upgrades, "watermelon", "movement_penalty"),
    capacity: weaponStat(9, upgrades, "watermelon", "capacity"),
  };
}

function turretStats(gameState = game) {
  const upgrades = gameState.weaponUpgrades;
  return {
    health: weaponStat(120, upgrades, "turret", "health"),
    range: weaponStat(310, upgrades, "turret", "range"),
    damage: weaponStat(14, upgrades, "turret", "damage"),
    fireRate: weaponStat(0.18, upgrades, "turret", "fire_rate"),
    bulletSpeed: weaponStat(650, upgrades, "turret", "speed"),
    capacity: weaponStat(2, upgrades, "turret", "capacity"),
  };
}

function readCombatRoll(random = Math.random) {
  if (typeof random !== "function") return 0.5;
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0.5;
  } catch {
    return 0.5;
  }
}

function switchWeapon(index) {
  if (game.mode !== "playing") return false;
  if (game.rewardSession?.active) return false;
  if (typeof rewardDialog !== "undefined" && !rewardDialog.hidden) return false;
  if (typeof tankTrialSession !== "undefined" && tankTrialSession.active) return;
  const weapon = weapons[index];
  if (weapon && game.unlocked.includes(weapon.id)) {
    if (game.player.weapon !== weapon.id) {
      cancelReload();
      cancelWatermelonCharge();
    }
    game.player.weapon = weapon.id;
    renderWeaponBar();
    ensureSound()(320 + index * 40, 0.035, 0.018, "sine");
    return true;
  }
  return false;
}

function beginReload() {
  const player = game.player;
  if (player.dodgeDuration > 0) return;
  if (!shouldConsumeAmmo(developerSession)) return;
  const weapon = weapons.find((entry) => entry.id === player.weapon);
  if (!["pistol", "shotgun"].includes(weapon.id) || player.reload > 0) return;
  const stats = typeof pistolStats === "function" && typeof shotgunStats === "function"
    ? weapon.id === "pistol" ? pistolStats() : shotgunStats()
    : {
        magazine: weapon.ammo,
        reloadTime: weapon.id === "shotgun" ? 1.25 : 0.82,
      };
  if (player.ammo[weapon.id] >= stats.magazine) return;
  if (player.reserve[weapon.id] <= 0) return;
  player.reload = stats.reloadTime;
  player.reloadWeapon = weapon.id;
  ensureSound()(150, 0.06, 0.02, "triangle");
}

function completeReload() {
  const player = game.player;
  const weaponId = player.reloadWeapon;
  cancelReload(player);
  if (!weaponId) return;
  if (!shouldConsumeAmmo(developerSession)) return;
  const weapon = weapons.find((entry) => entry.id === weaponId);
  if (!weapon) return;
  const stats = typeof pistolStats === "function" && typeof shotgunStats === "function"
    ? weaponId === "pistol" ? pistolStats() : shotgunStats()
    : { magazine: weapon.ammo };
  const needed = stats.magazine - player.ammo[weaponId];
  const amount = Number.isFinite(player.reserve[weaponId])
    ? Math.min(needed, player.reserve[weaponId])
    : needed;
  player.ammo[weaponId] += amount;
  if (Number.isFinite(player.reserve[weaponId])) player.reserve[weaponId] -= amount;
}

const UPRIGHT_SCENE_SCALE = 1.056;

function uprightReviewOptions(player, recoilRatio = 1) {
  return {
    angle: Math.atan2(player.aimY, player.aimX), recoilRatio,
    scale: UPRIGHT_SCENE_SCALE, readability: true,
    view: adultReview?.view?.value ?? "auto", time: game.time, motionBlend: player.uprightMotionBlend ?? 0,
    gaitPhase: player.uprightGaitPhase ?? 0, moveX: player.uprightMoveX ?? 1, moveY: player.uprightMoveY ?? 0,
    moving: ["w", "a", "s", "d"].some((key) => keys.has(key)),
  };
}

function adultShotOrigin() {
  if (!adultReview?.enabled.checked) return null;
  const player = game.player;
  const visual = resolveWeaponVisual(player.weapon);
  if (visual && adultReview.mode === "upright") {
    return uprightMuzzlePoint(visual, player, Math.atan2(player.aimY, player.aimX), uprightReviewOptions(player));
  }
  return visual ? adultMuzzlePoint(visual, player, Math.atan2(player.aimY, player.aimX)) : null;
}

function fireBullet(angle, damage, speed, radius = 4, color = "#f6d58a", options = {}) {
  const player = game.player;
  const reviewMuzzle = typeof adultShotOrigin === "function" ? adultShotOrigin() : null;
  game.bullets.push({
    id: game.nextId++,
    owner: "player",
    x: reviewMuzzle?.x ?? player.x + Math.cos(angle) * 28,
    y: reviewMuzzle?.y ?? player.y + Math.sin(angle) * 18,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage,
    radius,
    life: options.life ?? 1.25,
    color,
    source: options.source ?? player.weapon,
    originX: options.originX ?? player.x,
    originY: options.originY ?? player.y,
    remainingPierces: options.remainingPierces ?? 0,
    hitIds: options.hitIds ?? [],
    ...options,
  });
}

function firePistol(angle, random = Math.random) {
  const stats = pistolStats();
  const critical = readCombatRoll(random) < stats.critChance;
  const adjustedDamage = stats.damage * (critical ? 1.8 : 1);
  const pierces = hasWeaponTrait(game, "pistol", "pierce") ? 2 : 0;
  const execute = hasWeaponTrait(game, "pistol", "execute");
  if (hasWeaponTrait(game, "pistol", "twin_shot")) {
    for (const offset of [-0.025, 0.025]) {
      fireBullet(angle + offset, adjustedDamage * 0.7, stats.bulletSpeed, 4, "#f6d58a", {
        source: "pistol",
        remainingPierces: pierces,
        execute,
        critical,
      });
    }
    return;
  }
  fireBullet(angle, adjustedDamage, stats.bulletSpeed, 4, "#f6d58a", {
    source: "pistol",
    remainingPierces: pierces,
    execute,
    critical,
  });
}

function fireShotgun(angle, options = {}) {
  const { freeShot = false } = options;
  if (freeShot) return;
  const stats = shotgunStats();
  const reviewMuzzle = typeof adultShotOrigin === "function" ? adultShotOrigin() : null;
  const muzzleX = reviewMuzzle?.x ?? game.player.x + Math.cos(angle) * 28;
  const muzzleY = reviewMuzzle?.y ?? game.player.y + Math.sin(angle) * 18;
  for (const pelletAngle of shotgunPelletAngles(angle, 9, stats.spread * 3)) {
      fireBullet(pelletAngle, stats.damage, stats.bulletSpeed, 3, "#f0c779", {
        x: muzzleX,
        y: muzzleY,
        source: "shotgun",
        remainingPierces: hasWeaponTrait(game, "shotgun", "pierce") ? 1 : 0,
        closeDamage: hasWeaponTrait(game, "shotgun", "close_damage"),
        knockback: hasWeaponTrait(game, "shotgun", "knockback"),
        freeShot: false,
      });
  }
}

function updateDelayedShots(dt) {
  for (const shot of game.delayedShots) {
    shot.delay -= dt;
    if (shot.delay <= 0 && shot.weaponId === "shotgun") {
      fireShotgun(shot.angle, { freeShot: true });
    }
  }
  game.delayedShots = game.delayedShots.filter(({ delay }) => delay > 0);
}

function cancelWatermelonCharge(player = game.player) {
  // Shared charge fields: this reset also cancels the lightning-slot arrow rain.
  const wasCharging = player.chargeWeapon === "watermelon";
  player.chargeWeapon = null;
  player.chargeTime = 0;
  return wasCharging;
}

function startWatermelonCharge() {
  const player = game.player;
  if (
    game.mode !== "playing" ||
    game.rewardSession?.active ||
    !rewardDialog.hidden ||
    (typeof tankTrialSession !== "undefined" && tankTrialSession.active) ||
    player.weapon !== "watermelon" ||
    player.cooldown > 0 ||
    player.reload > 0 ||
    player.dodgeDuration > 0 ||
    !hasUsableAmmo(player, "watermelon", developerSession)
  ) {
    return false;
  }
  player.chargeWeapon = "watermelon";
  player.chargeTime = 0;
  return true;
}

function releaseWatermelonCharge() {
  const player = game.player;
  if (player.chargeWeapon !== "watermelon") return false;
  const chargeTime = player.chargeTime;
  cancelWatermelonCharge(player);
  mouse.down = false;
  const traits =
    typeof watermelonStats === "function"
      ? watermelonStats()
      : {
          damageMultiplier: 1, blastRadiusMultiplier: 1,
          chargeTime: 1.5, speedMultiplier: 1,
          movementPenalty: 0.2, capacity: 9,
        };
  const stats = watermelonChargeStats(chargeTime, {
    minimum: 0.3,
    maximum: traits.chargeTime,
  });
  if (
    !stats.ready ||
    player.weapon !== "watermelon" ||
    !hasUsableAmmo(player, "watermelon", developerSession)
  ) {
    return false;
  }
  const angle = Math.atan2(player.aimY, player.aimX);
  fireBullet(
    angle,
    stats.damage * traits.damageMultiplier,
    stats.speed * traits.speedMultiplier,
    stats.projectileRadius,
    "#4c9b42",
    {
      kind: "watermelon",
      blastRadius: stats.radius * traits.blastRadiusMultiplier,
      chargeRatio: stats.ratio,
      speed: stats.speed * traits.speedMultiplier,
      fullCharge: stats.full,
      seedStorm: hasWeaponTrait(game, "watermelon", "seed_storm"),
      crushing: hasWeaponTrait(game, "watermelon", "crushing"),
      ripeCore: hasWeaponTrait(game, "watermelon", "ripe_core"),
      juiceField: hasWeaponTrait(game, "watermelon", "juice_field"),
      crushedIds: [],
      life: 3,
      exploded: false,
    },
  );
  if (shouldConsumeAmmo(developerSession)) player.ammo.watermelon -= 1;
  const weapon = weapons.find((entry) => entry.id === "watermelon");
  player.cooldown = weapon?.fireRate ?? 1.1;
  triggerWeaponVisual(player, "watermelon");
  burst(player.x + player.aimX * 34, player.y + player.aimY * 22, "#77bd55", 8, 135);
  ensureSound()(86, 0.2, 0.06, "triangle");
  return true;
}

function updateWatermelonCharge(dt) {
  const player = game.player;
  if (player.chargeWeapon !== "watermelon") return false;
  if (
    game.mode !== "playing" ||
    game.rewardSession?.active ||
    (typeof tankTrialSession !== "undefined" && tankTrialSession.active) ||
    player.weapon !== "watermelon"
  ) {
    cancelWatermelonCharge(player);
    mouse.down = false;
    return false;
  }
  const maximum =
    typeof watermelonStats === "function" ? watermelonStats().chargeTime : 1.5;
  player.chargeTime = Math.min(maximum, player.chargeTime + Math.max(0, dt));
  return false;
}

function damageEnemy(enemy, amount, source, flashDuration) {
  if (!Number.isFinite(amount) || amount <= 0 || enemy.health <= 0) return false;
  if (enemy.isRareButterfly && !weapons.some(weapon => weapon.id === source) && source !== "rocket-shock") return false;
  if (typeof butterflyDamageMultiplier === "function") amount *= butterflyDamageMultiplier(game.player, game.time, source);
  if (enemy.isTrainingDummy) return recordTrainingDamage(enemy, amount, source, game.time);
  enemy.health -= amount;
  enemy.lastDamageSource = source;
  if (flashDuration > 0) {
    if (source === "flamethrower") enemy.flameHitFlash = .12;
    else triggerEnemyHurt(enemy, flashDuration);
  }
  return true;
}

function playerBulletDamage(bullet, enemy) {
  let amount = bullet.damage;
  if (
    bullet.source === "pistol" &&
    bullet.execute &&
    enemy.kind !== "boss" &&
    Number.isFinite(enemy.maxHealth) &&
    enemy.maxHealth > 0 &&
    enemy.health / enemy.maxHealth < 0.2
  ) {
    amount *= 1.6;
  }
  if (
    bullet.source === "shotgun" &&
    bullet.closeDamage &&
    Math.hypot(enemy.x - bullet.originX, enemy.y - bullet.originY) <= 150
  ) {
    amount *= 1.3;
  }
  return amount;
}

function applyDirectBulletHit(bullet, enemy) {
  const hit = damageEnemy(
    enemy,
    playerBulletDamage(bullet, enemy),
    bullet.source,
    0.08,
  );
  if (!hit) return false;
  bullet.hitIds ??= [];
  bullet.hitIds.push(enemy.id);
  if (bullet.source === "shotgun" && bullet.knockback && enemy.kind !== "boss" && !enemy.isTrainingDummy) {
    const direction = normalize(bullet.vx, bullet.vy);
    enemy.x += direction.x * 34;
    enemy.y += direction.y * 34;
  }
  if (bullet.remainingPierces > 0) bullet.remainingPierces -= 1;
  else bullet.life = 0;
  return true;
}

function refillPistolOnKill(source) {
  if (
    source !== "pistol" ||
    typeof hasWeaponTrait !== "function" ||
    !hasWeaponTrait(game, "pistol", "kill_reload")
  ) {
    return false;
  }
  const current = game.player.ammo.pistol;
  const maximum = pistolStats().magazine;
  if (!Number.isFinite(current) || current >= maximum) return false;
  game.player.ammo.pistol = Math.min(maximum, current + 1);
  return true;
}

function triggerEnemyHurt(enemy, flashDuration) {
  enemy.hitFlash = flashDuration;
  enemy.hurtAnimation = ZOMBIE_ACTIONS.hurt.frames / ZOMBIE_ACTIONS.hurt.fps;
  enemy.animationTime = 0;
}

function triggerEnemyAttack(enemy) {
  enemy.attackAnimation = ZOMBIE_ACTIONS.attack.frames / ZOMBIE_ACTIONS.attack.fps;
  enemy.animationTime = 0;
}

function fireFlame(angle) {
  const reviewMuzzle = typeof adultShotOrigin === "function" ? adultShotOrigin() : null;
  const stats =
    typeof flamethrowerStats === "function"
      ? flamethrowerStats()
      : { damage: 12, range: 430, coneAngle: Math.acos(0.72), fireRate: 0.06 };
  const hasTrait = (traitId) =>
    typeof hasWeaponTrait === "function" &&
    hasWeaponTrait(game, "flamethrower", traitId);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  for (const enemy of game.enemies) {
    const dx = enemy.x - game.player.x;
    const dy = enemy.y - game.player.y;
    const range = Math.hypot(dx, dy);
    if (range > stats.range || range === 0) continue;
    if (
      (dx / range) * direction.x + (dy / range) * direction.y <
      Math.cos(stats.coneAngle)
    ) continue;
    const scaledRange = (range / stats.range) * 430;
    let amount = flameDamageAtDistance(scaledRange) * (stats.damage / 12);
    const previousHeat = enemy.heatExposure;
    const continuous =
      previousHeat?.source === "flamethrower" &&
      game.time - previousHeat.lastHitAt <= 0.12;
    const duration = continuous
      ? previousHeat.duration + Math.max(0, game.time - previousHeat.lastHitAt)
      : 0;
    enemy.heatExposure = {
      source: "flamethrower",
      lastHitAt: game.time,
      duration,
    };
    if (hasTrait("heat_armor") && duration >= 1) {
      amount *= 1.35;
    }
    damageEnemy(enemy, amount, "flamethrower", 0.05);
    if (hasTrait("burn")) {
      enemy.damageOverTime ??= [];
      const burn = {
        source: "flamethrower",
        dps: stats.damage * 0.25,
        expiresAt: game.time + 2,
      };
      const index = enemy.damageOverTime.findIndex(({ source }) => source === burn.source);
      if (index >= 0) enemy.damageOverTime[index] = burn;
      else enemy.damageOverTime.push(burn);
    }
  }
  if (hasTrait("scorched_ground")) {
    const x = game.player.x + direction.x * stats.range;
    const y = game.player.y + direction.y * stats.range;
    const existing = game.damageZones.find(
      (zone) => zone.source === "flamethrower" && Math.hypot(zone.x - x, zone.y - y) < 55,
    );
    const zone = {
      source: "flamethrower", x, y, radius: 55,
      dps: stats.damage * 0.25, life: 1.5, maxLife: 1.5,
    };
    if (existing) Object.assign(existing, zone);
    else game.damageZones.push(zone);
  }
  for (let index = 0; index < 7; index += 1) {
    const spread = angle + (Math.random() - 0.5) * 0.55;
    const speed = 480 + Math.random() * 170;
    const life = 0.65 + Math.random() * 0.25;
    game.particles.push({
      x: reviewMuzzle?.x ?? game.player.x + direction.x * 30,
      y: reviewMuzzle?.y ?? game.player.y + direction.y * 22,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      life,
      maxLife: life,
      color: Math.random() > 0.45 ? "#f39b3b" : "#ffe08a",
      size: 5 + Math.random() * 6,
    });
  }
}

function fireLaserRay(origin, direction, stats, options = {}) {
  const directionLength = Math.hypot(direction?.x, direction?.y);
  if (!(directionLength > 0)) {
    return { hitIds: new Set(), killedIds: new Set(), segments: [] };
  }
  const unit = {
    x: direction.x / directionLength,
    y: direction.y / directionLength,
  };
  const hitIds = new Set();
  const killedIds = new Set();
  const segments = [];
  const traceSegment = (start, segmentDirection, length) => {
    const end = {
      x: start.x + segmentDirection.x * length,
      y: start.y + segmentDirection.y * length,
    };
    segments.push({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      width: stats.width * (options.widthMultiplier ?? 1),
    });
    for (const enemy of game.enemies) {
      if (enemy.health <= 0 || hitIds.has(enemy.id)) continue;
      const dx = enemy.x - start.x;
      const dy = enemy.y - start.y;
      const projection = dx * segmentDirection.x + dy * segmentDirection.y;
      if (projection < 0 || projection > length) continue;
      const perpendicular = Math.abs(
        dx * segmentDirection.y - dy * segmentDirection.x,
      );
      if (perpendicular > enemy.radius + stats.width * (options.widthMultiplier ?? 1)) {
        continue;
      }
      const before = enemy.health;
      const bossMultiplier = options.bossFocus && enemy.kind === "boss" ? 1.35 : 1;
      const amount = stats.damage * (options.damageMultiplier ?? 1) * bossMultiplier;
      if (!damageEnemy(enemy, amount, "laser", 0.12)) continue;
      hitIds.add(enemy.id);
      if (before > 0 && enemy.health <= 0) killedIds.add(enemy.id);
    }
    return end;
  };

  const boundary =
    typeof rayArenaIntersection === "function"
      ? rayArenaIntersection(origin, unit, { width: WIDTH, height: HEIGHT })
      : null;
  const firstLength = Math.min(stats.range, boundary?.distance ?? stats.range);
  traceSegment(origin, unit, firstLength);
  const remaining = stats.range - firstLength;
  if (
    options.reflect &&
    boundary &&
    remaining > 0 &&
    typeof reflectRayAtBoundary === "function"
  ) {
    const reflected = reflectRayAtBoundary(unit, boundary);
    if (reflected) {
      const nextBoundary = rayArenaIntersection(boundary, reflected, {
        width: WIDTH,
        height: HEIGHT,
      });
      traceSegment(boundary, reflected, Math.min(remaining, nextBoundary?.distance ?? remaining));
    }
  }
  return { hitIds, killedIds, segments };
}

function fireLaser(angle) {
  const reviewMuzzle = typeof adultShotOrigin === "function" ? adultShotOrigin() : null;
  const stats =
    typeof laserStats === "function"
      ? laserStats()
      : { damage: 145, width: 8, range: 980, fireRate: 1.35, capacity: 15 };
  const hasTrait = (traitId) =>
    typeof hasWeaponTrait === "function" && hasWeaponTrait(game, "laser", traitId);
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const origin = {
    x: reviewMuzzle?.x ?? game.player.x + direction.x * 28,
    y: reviewMuzzle?.y ?? game.player.y + direction.y * 20,
  };
  const rays = [
    fireLaserRay(origin, direction, stats, {
      reflect: hasTrait("reflect"),
      bossFocus: hasTrait("boss_focus"),
    }),
  ];
  if (hasTrait("prism")) {
    for (const offset of [-0.09, 0.09]) {
      const sideAngle = angle + offset;
      rays.push(
        fireLaserRay(
          origin,
          { x: Math.cos(sideAngle), y: Math.sin(sideAngle) },
          stats,
          {
            damageMultiplier: 0.35,
            widthMultiplier: 0.55,
            bossFocus: hasTrait("boss_focus"),
          },
        ),
      );
    }
  }
  for (const ray of rays) {
    for (const segment of ray.segments) {
      game.beams.push({ ...segment, life: 0.15, maxLife: 0.15 });
    }
  }
  return new Set(rays.flatMap((ray) => [...ray.killedIds])).size;
}

function useWeapon() {
  const player = game.player;
  if (player.cooldown > 0 || player.reload > 0 || player.dodgeDuration > 0) return;
  const weapon = weapons.find((entry) => entry.id === player.weapon);
  if (
    typeof tankTrialSession !== "undefined" &&
    tankTrialSession.active &&
    weapon?.id !== "pistol"
  ) {
    failActiveTankTrial("non-pistol");
    return;
  }
  const placeable = ["turret", "tank"];

  if (placeable.includes(weapon.id)) {
    placeStructure(weapon.id);
    return;
  }
  if (!hasUsableAmmo(player, weapon.id, developerSession)) {
    if (["pistol", "shotgun"].includes(weapon.id)) beginReload();
    else ensureSound()(72, 0.05, 0.018, "square");
    return;
  }

  const angle = Math.atan2(player.aimY, player.aimX);
  let fireRate = weapon.fireRate;
  let refundAmmo = false;
  const weaponHasTrait = (weaponId, traitId) =>
    typeof hasWeaponTrait === "function" && hasWeaponTrait(game, weaponId, traitId);
  if (weapon.id === "pistol") {
    if (typeof firePistol === "function") firePistol(angle, Math.random);
    else fireBullet(angle, 32, 870, 4);
    if (typeof pistolStats === "function") fireRate = pistolStats().fireRate;
    ensureSound()(182, 0.055, 0.038);
  } else if (weapon.id === "shotgun") {
    if (typeof fireShotgun === "function") {
      fireShotgun(angle);
    } else {
      for (let index = 0; index < 9; index += 1) {
          fireBullet(angle + (index - 4) * 0.0825, 29.4, 760, 3, "#f0c779", {
            x: player.x + Math.cos(angle) * 28,
            y: player.y + Math.sin(angle) * 18,
            source: "shotgun",
          });
      }
    }
    if (typeof shotgunStats === "function") fireRate = shotgunStats().fireRate ?? weapon.fireRate;
    ensureSound()(98, 0.11, 0.055, "sawtooth");
  } else if (weapon.id === "rocket") {
    const stats =
      typeof rocketStats === "function"
        ? rocketStats()
        : {
            damage: 105,
            blastRadius: 132,
            speed: 520,
            fireRate: 1.1,
          };
    fireBullet(angle, stats.damage, stats.speed, 8, "#f0a451", {
      kind: "rocket",
      blastRadius: stats.blastRadius,
      life: 2.2,
      exploded: false,
      cluster: weaponHasTrait("rocket", "cluster"),
      burningGround: weaponHasTrait("rocket", "burning_ground"),
      armorBreak: weaponHasTrait("rocket", "armor_break"),
      shockSlow: weaponHasTrait("rocket", "shock_slow"),
    });
    fireRate = stats.fireRate;
    ensureSound()(66, 0.18, 0.06, "sawtooth");
  } else if (weapon.id === "flamethrower") {
    fireFlame(angle);
    if (typeof flamethrowerStats === "function") {
      fireRate = flamethrowerStats().fireRate;
    }
    ensureSound()(104, 0.04, 0.02, "sawtooth");
  } else if (weapon.id === "laser") {
    const kills = fireLaser(angle);
    const stats =
      typeof laserStats === "function"
        ? laserStats()
        : { fireRate: weapon.fireRate, capacity: 15 };
    fireRate = stats.fireRate;
    refundAmmo = weaponHasTrait("laser", "kill_recharge") && kills >= 4;
    ensureSound()(430, 0.18, 0.045, "sine");
  } else if (weapon.id === "ricochet") {
    const stats =
      typeof ricochetStats === "function"
        ? ricochetStats()
        : {
            damage: 48, projectiles: 3, bounces: 8,
            speed: 620, radius: 7, fireRate: 0.85,
          };
    for (let index = 0; index < stats.projectiles; index += 1) {
      const offset = (index - (stats.projectiles - 1) / 2) * 0.08;
      fireBullet(angle + offset, stats.damage, stats.speed, stats.radius, "#bdeaff", {
        kind: "ricochet",
        bounces: stats.bounces,
        wallBounceCount: 0,
        hitIds: [],
        microBlastHitIds: [],
        bouncePower: weaponHasTrait("ricochet", "bounce_power"),
        homing: weaponHasTrait("ricochet", "homing"),
        microBlast: weaponHasTrait("ricochet", "micro_blast"),
        canSplit: weaponHasTrait("ricochet", "split"),
        isSplitChild: false,
        life: 6,
      });
    }
    fireRate = stats.fireRate;
    ensureSound()(132, 0.14, 0.05, "square");
  } else if (weapon.id === "lightning") {
    startArrowCharge();
    return;
  } else if (weapon.id === "freeze") {
    const stats =
      typeof freezeStats === "function"
        ? freezeStats()
        : {
            damage: 42, blastRadius: 90, slowPerHit: 0.25,
            duration: 2.5, speed: 500, capacity: 30,
          };
    const pierce = weaponHasTrait("freeze", "pierce");
    fireBullet(angle, stats.damage, stats.speed, 6, "#dff8ff", {
      kind: "freeze",
      blastRadius: stats.blastRadius,
      slowPerHit: stats.slowPerHit,
      slowDuration: stats.duration,
      remainingEnemyHits: pierce ? 2 : 1,
      contagiousFreeze: weaponHasTrait("freeze", "full_freeze"),
      crackShot: weaponHasTrait("freeze", "shatter"),
      frostField: weaponHasTrait("freeze", "frost_field"),
      life: 2.2,
      exploded: false,
    });
    fireRate = stats.fireRate ?? weapon.fireRate;
    ensureSound()(310, 0.14, 0.04, "sine");
  }
  if (shouldConsumeAmmo(developerSession)) {
    player.ammo[weapon.id] -= 1;
    if (refundAmmo) {
      const capacity = typeof laserStats === "function" ? laserStats().capacity : 15;
      player.ammo[weapon.id] = Math.min(capacity, player.ammo[weapon.id] + 1);
    }
  }
  player.cooldown = fireRate;
  triggerWeaponVisual(player, weapon.id);
  // The flame stream already emits at its true muzzle. A generic radial
  // muzzle burst used the grounded player anchor and created sparks at the feet.
  if (weapon.id !== "flamethrower") {
    const muzzle = typeof adultShotOrigin === "function" ? adultShotOrigin() : null;
    burst(muzzle?.x ?? player.x + player.aimX * 30,
      muzzle?.y ?? player.y + player.aimY * 20, "#ffd78f", 5, 110);
  }
}

function placeStructure(kind) {
  if (typeof tankTrialSession !== "undefined" && tankTrialSession.active) {
    failActiveTankTrial("structure");
    return;
  }
  const player = game.player;
  const deployed = game.structures.filter(s => s.kind === kind && s.health > 0).length;
  if (deployed >= STRUCTURE_LIMITS[kind]) {
    game.notice = `${kind === "turret" ? "炮台" : "坦克"}最多部署 ${STRUCTURE_LIMITS[kind]} 个，损毁后可补充`;
    game.noticeTimer = 2;
    player.cooldown = 0.18;
    return;
  }
  if (!hasUsableAmmo(player, kind, developerSession) || !validPlacement(mouse.x, mouse.y, kind)) {
    ensureSound()(90, 0.04, 0.015, "square");
    player.cooldown = 0.18;
    return;
  }

  const resolvedTurretStats =
    kind === "turret" && typeof turretStats === "function"
      ? turretStats()
      : null;
  const stats = {
    turret: {
      health: resolvedTurretStats?.health ?? 120,
      radius: 24,
      attackRange: resolvedTurretStats?.range ?? 310,
      bulletDamage: resolvedTurretStats?.damage ?? 14,
      fireRate: resolvedTurretStats?.fireRate ?? 0.18,
      bulletSpeed: resolvedTurretStats?.bulletSpeed ?? 650,
    },
    tank: { health: 420, radius: 38 },
  }[kind];
  const turretHasTrait = (traitId) =>
    kind === "turret" &&
    typeof hasWeaponTrait === "function" &&
    hasWeaponTrait(game, "turret", traitId);

  game.structures.push({
    id: game.nextId++,
    kind,
    x: mouse.x,
    y: mouse.y,
    health: stats.health,
    maxHealth: stats.health,
    radius: stats.radius,
    cooldown: 0,
    aimAngle: 0,
    ...(kind === "turret"
      ? {
          attackRange: stats.attackRange,
          bulletDamage: stats.bulletDamage,
          fireRate: stats.fireRate,
          bulletSpeed: stats.bulletSpeed,
          twinBarrel: turretHasTrait("twin_barrel"),
          repair: turretHasTrait("repair"),
          grenadeCycle: turretHasTrait("grenade_cycle"),
          heavyTargeting: turretHasTrait("heavy_targeting"),
          timeSinceHit: 0,
          shotsFired: 0,
        }
      : {}),
  });
  if (shouldConsumeAmmo(developerSession)) player.ammo[kind] -= 1;
  player.cooldown = 0.45;
  ensureSound()(230, 0.075, 0.025, "triangle");
  burst(mouse.x, mouse.y, "#a58c62", 8, 90);
  renderWeaponBar();
}

function spawnEnemy(kind) {
  if (typeof modelLab !== "undefined" && modelLab) return;
  const edge = Math.floor(Math.random() * 4);
  const margin = 42;
  let x = margin;
  let y = margin;
  if (edge === 0) {
    x = Math.random() * WIDTH;
    y = margin;
  } else if (edge === 1) {
    x = WIDTH - margin;
    y = Math.random() * HEIGHT;
  } else if (edge === 2) {
    x = Math.random() * WIDTH;
    y = HEIGHT - margin;
  } else {
    x = margin;
    y = Math.random() * HEIGHT;
  }
  let bossProfile = null;
  if (kind === "boss") {
    if (game.bossRosterWave !== game.wave || !game.bossRoster?.length) {
      game.bossRosterWave = game.wave;
      game.bossRoster = bossProfilesForWave(game.wave);
      game.bossRosterIndex = 0;
    }
    bossProfile = game.bossRoster[game.bossRosterIndex % game.bossRoster.length];
    const spawn = chooseBossSpawnPosition(bossProfile, { x, y }, {
      obstacles: typeof staticObstacles === "undefined" ? [] : staticObstacles,
      width: WIDTH, height: HEIGHT, enemies: game.enemies,
    });
    if (!spawn) return false;
    x = spawn.x; y = spawn.y;
    game.bossRosterIndex++;
  }
  const stats = enemyStats[kind];
  const scaledHealth =
    kind === "boss"
      ? bossProfile.health
      : stats.health + game.wave * (kind === "zombie" ? 2 : 1);
  const claim = consumeWaveEnhancement(game.waveEnhancements, kind);
  game.waveEnhancements = claim.remaining;
  const enhancement = claim.enhancement;
  const health = bossProfile ? scaledHealth : scaledHealth * (enhancement?.healthMultiplier ?? 1);
  const baseSpeed =
    kind === "boss" ? bossProfile.speed : stats.speed + Math.min(28, game.wave * 1.6);
  const speed = baseSpeed * (enhancement?.speedMultiplier ?? 1);
  game.enemies.push({
    id: game.nextId++,
    kind,
    x,
    y,
    health,
    maxHealth: health,
    speed,
    scoreMultiplier: enhancement?.scoreMultiplier ?? 1,
    ...(kind === "exploder"
      ? { explosionRadius: enhancement?.explosionRadius ?? 122 }
      : {}),
    ...(kind === "toxic"
      ? { gasRadius: enhancement?.gasRadius ?? 82 }
      : {}),
    damage: stats.damage,
    radius: stats.radius,
    detonated: false,
    bossRewarded: false,
    attackCooldown: Math.random() * 0.4,
    shotCooldown: 1 + Math.random(),
    shockwaveCooldown: 4,
    summonCooldown: 7,
    hitFlash: 0,
    animationTime: 0,
    animationPhase: Math.random() * 0.6,
    attackAnimation: 0,
    hurtAnimation: 0,
    lastDamageSource: null,
    slowStatuses: [],
    ...createToxicGasTrailState(bossProfile?.bossArchetype ?? kind),
    ...(bossProfile ? { ...bossProfile, maxHealth: health,
      bossCombat: { phase: "idle", cooldown: 1.6 + ((game.bossRosterIndex - 1) % game.bossRoster.length) * 1.5, nextMove: 0, effects: [], enraged: false },
    } : {}),
  });
}

function updatePlayer(dt) {
  const player = game.player;
  const modifiers = playerModifiers(game.playerUpgrades);
  const x = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
  const y = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
  const movement = normalize(x, y);
  const uprightActive = typeof adultReview !== "undefined" && adultReview?.mode === "upright" && adultReview.enabled.checked;
  const previousX = player.x, previousY = player.y;

  const aimHeight = typeof adultReview !== "undefined" && adultReview?.mode === "upright" && adultReview.enabled.checked ? 64 * UPRIGHT_SCENE_SCALE : 0;
  const aim = normalize(mouse.x - player.x, mouse.y - player.y + aimHeight);
  if (aim.x || aim.y) {
    player.aimX = aim.x;
    player.aimY = aim.y;
  }

  if (player.dodgePressed) {
    const direction = resolveDodgeDirection(x, y, player.aimX, player.aimY);
    if (startDodge(player, direction)) {
      cancelReload(player);
      cancelWatermelonCharge(player);
      mouse.down = false;
      ensureSound()(118, 0.08, 0.025, "triangle");
    }
    player.dodgePressed = false;
  }

  if (player.dodgeDuration > 0) {
    const progress = 1 - player.dodgeDuration / DODGE.duration;
    const speedScale = 0.72 + Math.sin(progress * Math.PI) * 0.42;
    player.x += player.dodgeX * DODGE.speed * speedScale * dt;
    player.y += player.dodgeY * DODGE.speed * speedScale * dt;
  } else {
    const chargeSpeedScale =
      player.chargeWeapon === "watermelon"
        ? 1 - (
            typeof watermelonStats === "function"
              ? watermelonStats().movementPenalty
              : 0.2
          )
        : 1;
    const mudSlow = (game.terrainTraps ?? []).some((trap) =>
      trap.kind === "mud" && isTerrainTrapTouching(trap, { ...player, radius: 18 }))
      ? 1 - MUD_SLOW_AMOUNT : 1;
    const effectiveSpeed = player.speed * modifiers.speedMultiplier * chargeSpeedScale * mudSlow * (uprightActive ? 1.15 : 1) * (typeof butterflySpeedMultiplier === "function" ? butterflySpeedMultiplier(player, game.time) : 1);
    player.x += movement.x * effectiveSpeed * dt;
    player.y += movement.y * effectiveSpeed * dt;
  }
  player.x = clamp(player.x, 52, WIDTH - 52);
  player.y = clamp(player.y, 72, HEIGHT - 48);
  resolvePlayerCollision(player);
  player.x = clamp(player.x, 52, WIDTH - 52);
  player.y = clamp(player.y, 72, HEIGHT - 48);
  if (uprightActive) advanceUprightGait(player, player.x - previousX, player.y - previousY, dt, player.dodgeDuration > 0);

  player.cooldown = Math.max(0, player.cooldown - dt);
  tickWeaponVisual(player, dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  if (player.reload > 0) {
    const previous = player.reload;
    player.reload -= dt;
    if (previous > 0 && player.reload <= 0) completeReload();
  }

  const wasDodging = player.dodgeDuration > 0;
  tickDodge(player, dt);
  if (wasDodging && player.dodgeDuration === 0) {
    burst(player.x, player.y + 4, "#8c826b", 8, 70);
    ensureSound()(82, 0.045, 0.018, "triangle");
  }
  updateWatermelonCharge(dt);
  if (typeof updateArrowCharge === "function") updateArrowCharge(dt);
  if (mouse.down && !["watermelon", "lightning"].includes(player.weapon)) useWeapon();
}

function resolveStaticCollision(entity) {
  if (entity.kind === "boss") {
    resolveBossPosition(entity, { obstacles: staticObstacles, width: WIDTH, height: HEIGHT });
    return;
  }
  for (const obstacle of staticObstacles) {
    resolveGroundCollision(entity, obstacle, 16);
  }
}

function resolvePlayerCollision(player) {
  resolveStaticCollision(player);
  for (const structure of game.structures) {
    resolveGroundCollision(
      player,
      { x: structure.x, y: structure.y, rx: structure.radius, ry: structure.radius * 0.72 },
      17,
    );
  }
}

function updateEnemyGasTrail(enemy, startX, startY, dt) {
  if (enemy.kind !== "toxic" && enemy.bossArchetype !== "toxic") return;
  const trail = advanceToxicGasTrail({
    kind: "toxic",
    health: enemy.health,
    gasTrailTime: enemy.gasTrailTime,
    gasTrailDistance: enemy.gasTrailDistance,
    startX,
    startY,
    endX: enemy.x,
    endY: enemy.y,
    dt,
  });
  enemy.gasTrailTime = trail.gasTrailTime;
  enemy.gasTrailDistance = trail.gasTrailDistance;
  for (const point of trail.points) createGas(point.x, point.y, enemy.gasRadius);
}

function hurtStructure(structure, amount) {
  if (!structure || !Number.isFinite(amount) || amount <= 0 || structure.health <= 0) {
    return false;
  }
  structure.health -= amount;
  structure.timeSinceHit = 0;
  return true;
}

function spawnBossRunners(requested) {
  const count = developerSession.enabled
    ? Math.min(
      requested,
      Math.max(0, getEnemySpawnLimit(game, developerSession) - game.enemies.length),
    )
    : requested;
  for (let index = 0; index < count; index += 1) spawnEnemy("runner");
}

function updateEnemies(dt) {
  let runnerSummons = 0;
  for (const enemy of game.enemies) {
    if (enemy.isRareButterfly) {
      if (enemy.health <= 0) continue;
      const age = game.time - enemy.bornAt;
      enemy.x = clamp(enemy.anchorX + Math.sin(age * 1.6) * 85, 55, WIDTH - 55);
      enemy.y = clamp(enemy.anchorY + Math.sin(age * 2.3) * 32 - age * 3, 75, HEIGHT - 60);
      if (game.time >= enemy.expiresAt) { enemy.health = 0; enemy.escaped = true; }
      continue;
    }
    const trailStartX = enemy.x;
    const trailStartY = enemy.y;
    enemy.attackCooldown -= dt;
    enemy.shotCooldown -= dt;
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.flameHitFlash = Math.max(0, (enemy.flameHitFlash ?? 0) - dt);
    enemy.animationTime += dt;
    enemy.attackAnimation = Math.max(0, enemy.attackAnimation - dt);
    enemy.hurtAnimation = Math.max(0, enemy.hurtAnimation - dt);
    enemy.damageOverTime = (enemy.damageOverTime ?? []).filter(
      ({ expiresAt }) => expiresAt > game.time,
    );
    for (const effect of enemy.damageOverTime) {
      damageEnemy(enemy, effect.dps * dt, effect.source, 0.02);
    }
    if (enemy.health <= 0) continue;
    if (enemy.isTrainingDummy) {
      enemy.x = enemy.anchorX; enemy.y = enemy.anchorY;
      enemy.slowStatuses = (enemy.slowStatuses ?? []).filter(status => status.expiresAt > game.time);
      continue;
    }
    enemy.slowStatuses = (enemy.slowStatuses ?? []).filter(
      (status) => status?.expiresAt > game.time,
    );
    const statusSlow = strongestSlow(game.time, enemy.slowStatuses);
    let zoneSlow = 0;
    for (const zone of game.slowZones ?? []) {
      if (zone.life <= 0 || (zone.excludesBoss && enemy.kind === "boss")) continue;
      if (distance(zone, enemy) > zone.radius + enemy.radius) continue;
      if (Number.isFinite(zone.amount)) zoneSlow = Math.max(zoneSlow, zone.amount);
    }
    for (const trap of game.terrainTraps ?? []) {
      if (trap.kind === "mud" && isTerrainTrapTouching(trap, enemy)) {
        zoneSlow = Math.max(zoneSlow, MUD_SLOW_AMOUNT);
      }
    }
    const slowAmount = Math.max(statusSlow, zoneSlow);
    const frozen = Number.isFinite(enemy.frozenUntil) && enemy.frozenUntil > game.time;
    const bound = Number.isFinite(enemy.entangledUntil) && enemy.entangledUntil > game.time;
    const effectiveSpeed = frozen || bound ? 0 : enemy.speed * (1 - slowAmount);

    if (enemy.kind === "boss") {
      resolveStaticCollision(enemy);
      const gaitStartX = enemy.x, gaitStartY = enemy.y;
      const combat = updateBossCombat(enemy, game.player, dt, frozen || bound, { obstacles: staticObstacles, width: WIDTH, height: HEIGHT, enemies: game.enemies });
      for (const event of combat.events) {
        if (event.type === "attack") triggerEnemyAttack(enemy);
        if (event.type === "rage") { game.notice = "Boss 狂暴：连击强化"; game.noticeTimer = 2; }
        if (event.type === "summon") runnerSummons += event.count;
        if (event.type === "gas") createGas(event.x, event.y, event.radius);
        if (event.type === "volley") {
          for (let i = 0; i < event.count; i++) {
            const angle = event.angle - event.halfAngle + i * event.halfAngle * 2 / (event.count - 1);
            game.bullets.push({ id: game.nextId++, owner: "enemy", x: enemy.x, y: enemy.y,
              vx: Math.cos(angle) * 240, vy: Math.sin(angle) * 240, damage: event.damage, radius: 9, life: (event.radius ?? 576) / 240, color: event.color ?? "#e95b71" });
          }
        }
        if (event.type === "wave") {
          game.shockwaves.push({ id: game.nextId++, ownerBoss: enemy.id, bossSkill: true,
            x: enemy.x, y: enemy.y, radius: 20, life: 1, maxLife: 1, hitPlayer: false });
          ensureSound()(52, 0.24, 0.045, "sawtooth");
        }
        if (event.type === "hit") {
          if (event.shape !== "capsule") triggerEnemyAttack(enemy);
          // Clip the swept path to the collision-resolved destination before damage.
          if (event.shape === "capsule" && event.displaced !== false) {
            enemy.x = clamp(enemy.x, enemy.radius, WIDTH - enemy.radius);
            enemy.y = clamp(enemy.y, enemy.radius, HEIGHT - enemy.radius);
            resolveStaticCollision(enemy);
            event.endX = enemy.x; event.endY = enemy.y;
          }
          if (!event.hitIds?.has("player") && bossStrikeTouches(event, game.player)) {
            event.hitIds?.add("player"); hurtPlayer(event.damage);
          }
          for (const structure of game.structures ?? []) {
            if (structure.health <= 0 || event.hitIds?.has(structure.id) || !bossStrikeTouches(event, structure)) continue;
            event.hitIds?.add(structure.id); hurtStructure(structure, event.damage);
          }
        }
      }
      if (!combat.controlled) steerBoss(enemy, game.player, dt, effectiveSpeed * (combat.movementScale ?? 1), {
        obstacles: staticObstacles, width: WIDTH, height: HEIGHT, enemies: game.enemies,
      });
      resolveStaticCollision(enemy);
      advanceBossLocomotion(enemy, enemy.x - gaitStartX, enemy.y - gaitStartY, dt, combat.controlled, frozen || bound);
      updateEnemyGasTrail(enemy, trailStartX, trailStartY, dt);
      continue;
    }

    const playerTarget = game.player;
    const structureTarget =
      !["devil", "exploder"].includes(enemy.kind)
        ? (game.structures ?? [])
            .filter((structure) => structure.health > 0)
            .sort((left, right) => distance(enemy, left) - distance(enemy, right))[0]
        : null;
    const target =
      structureTarget && distance(enemy, structureTarget) < distance(enemy, playerTarget)
        ? structureTarget
        : playerTarget;
    const targetRadius = target === playerTarget ? 16 : target.radius;
    const toTarget = normalize(target.x - enemy.x, target.y - enemy.y);
    const targetDistance = distance(enemy, target);
    if (enemy.kind === "exploder" && targetDistance < 62) {
      triggerEnemyAttack(enemy);
      detonateEnemy(enemy);
      damageEnemy(enemy, Math.max(1, enemy.health), "enemy-exploder", 0);
      continue;
    }

    if (enemy.kind === "devil") {
      if (targetDistance < 235) {
        enemy.x -= toTarget.x * effectiveSpeed * dt;
        enemy.y -= toTarget.y * effectiveSpeed * dt;
      } else if (targetDistance > 350) {
        enemy.x += toTarget.x * effectiveSpeed * dt;
        enemy.y += toTarget.y * effectiveSpeed * dt;
      }
      if (enemy.shotCooldown <= 0 && targetDistance < 450) {
        game.bullets.push({
          id: game.nextId++,
          owner: "enemy",
          x: enemy.x,
          y: enemy.y,
          vx: toTarget.x * 260,
          vy: toTarget.y * 260,
          damage: enemy.damage,
          radius: 8,
          life: 2.4,
          color: "#9e2634",
        });
        enemy.shotCooldown = 2.1;
        triggerEnemyAttack(enemy);
        ensureSound()(72, 0.12, 0.025, "sawtooth");
      }
    } else if (targetDistance > enemy.radius + targetRadius) {
      enemy.x += toTarget.x * effectiveSpeed * dt;
      enemy.y += toTarget.y * effectiveSpeed * dt;
    } else if (enemy.kind !== "boss" && enemy.attackCooldown <= 0) {
      if (target === playerTarget) hurtPlayer(enemy.damage);
      else hurtStructure(target, enemy.damage);
      triggerEnemyAttack(enemy);
      if (enemy.kind === "toxic") createGas(enemy.x, enemy.y, enemy.gasRadius);
      enemy.attackCooldown =
        enemy.kind === "runner" ? 0.7 : enemy.kind === "boss" ? 1.25 : 0.95;
    }

    resolveStaticCollision(enemy);
    if (!bound) separateEnemy(enemy, dt);
    updateEnemyGasTrail(enemy, trailStartX, trailStartY, dt);
  }
  spawnBossRunners(runnerSummons);
  game.structures = game.structures.filter((structure) => structure.health > 0);
}

function separateEnemy(enemy, dt) {
  for (const other of game.enemies) {
    if (other.id === enemy.id) continue;
    const dx = enemy.x - other.x;
    const dy = enemy.y - other.y;
    const length = Math.hypot(dx, dy);
    const separation = enemy.radius + other.radius;
    if (length > 0 && length < separation) {
      enemy.x += (dx / length) * 24 * dt;
      enemy.y += (dy / length) * 24 * dt;
    }
  }
}

function isHeavyTurretTarget(enemy) {
  return (
    enemy.kind === "boss" ||
    enemy.kind === "brute" ||
    (Number.isFinite(enemy.scoreMultiplier) && enemy.scoreMultiplier > 1)
  );
}

function updateStructures(dt) {
  for (const structure of game.structures) {
    if (structure.kind === "turret") {
      structure.timeSinceHit = (structure.timeSinceHit ?? 0) + dt;
      if (
        structure.repair &&
        structure.timeSinceHit >= 5 &&
        structure.health < structure.maxHealth
      ) {
        structure.health = Math.min(
          structure.maxHealth,
          structure.health + structure.maxHealth * 0.04 * dt,
        );
      }
    }
    structure.cooldown -= dt;
    if (!["turret", "tank"].includes(structure.kind) || structure.cooldown > 0) continue;

    const range = structure.kind === "turret" ? (structure.attackRange ?? 310) : 520;
    const targets = game.enemies
      .filter(
        (enemy) =>
          (enemy.health === undefined || enemy.health > 0) &&
          distance(structure, enemy) < range,
      )
      .sort((a, b) => {
        if (structure.kind === "turret" && structure.heavyTargeting) {
          const priority = Number(isHeavyTurretTarget(b)) - Number(isHeavyTurretTarget(a));
          if (priority !== 0) return priority;
        }
        return distance(structure, a) - distance(structure, b);
      });
    const target = structure.kind === "tank" ? densestTarget(targets) : targets[0];
    if (!target) continue;
    const direction = normalize(target.x - structure.x, target.y - structure.y);
    structure.aimAngle = Math.atan2(direction.y, direction.x);

    if (structure.kind === "turret") {
      structure.shotsFired = (structure.shotsFired ?? 0) + 1;
      const heavyMultiplier =
        structure.heavyTargeting && isHeavyTurretTarget(target) ? 1.3 : 1;
      const damage = (structure.bulletDamage ?? 14) * heavyMultiplier;
      const bulletSpeed = structure.bulletSpeed ?? 650;
      const grenade = structure.grenadeCycle && structure.shotsFired % 8 === 0;
      game.bullets.push({
        id: game.nextId++,
        owner: "player",
        ...(grenade
          ? { kind: "turret-grenade", blastRadius: 65, exploded: false }
          : {}),
        x: structure.x,
        y: structure.y,
        vx: direction.x * bulletSpeed,
        vy: direction.y * bulletSpeed,
        damage,
        source: "turret",
        targetId: target.id,
        radius: grenade ? 5 : 3,
        life: 0.8,
        color: "#e6c47b",
      });
      if (structure.twinBarrel) {
        const angle = Math.atan2(direction.y, direction.x) + 0.07;
        game.bullets.push({
          id: game.nextId++,
          owner: "player",
          x: structure.x,
          y: structure.y,
          vx: Math.cos(angle) * bulletSpeed,
          vy: Math.sin(angle) * bulletSpeed,
          damage: damage * 0.55,
          source: "turret",
          targetId: target.id,
          radius: 3,
          life: 0.8,
          color: "#f2d99d",
        });
      }
      structure.cooldown = structure.fireRate ?? 0.18;
    } else {
      game.bullets.push({
        id: game.nextId++,
        owner: "tank",
        x: structure.x,
        y: structure.y,
        vx: direction.x * 230,
        vy: direction.y * 230,
        damage: 110,
        source: "tank",
        radius: 8,
        blastRadius: 125,
        life: Math.max(0.35, distance(structure, target) / 230),
        color: "#e3bc6c",
      });
      structure.cooldown = 2.4;
      ensureSound()(84, 0.16, 0.045, "triangle");
    }
  }
}

function densestTarget(targets) {
  return targets
    .map((target) => ({
      target,
      neighbors: targets.filter((other) => distance(target, other) < 95).length,
    }))
    .sort((a, b) => b.neighbors - a.neighbors)[0]?.target;
}

function applyLightningChain(firstEnemy, shot = {}) {
  const fallback =
    typeof lightningStats === "function"
      ? lightningStats()
      : {
          damage: 60, chainRange: 230, retention: 0.75,
          speed: 900, fireRate: 0.75, capacity: 24,
        };
  const options = {
    damage: Number.isFinite(shot.damage) ? shot.damage : fallback.damage,
    range: Number.isFinite(shot.chainRange) ? shot.chainRange : fallback.chainRange,
    retention: Number.isFinite(shot.retention) ? shot.retention : fallback.retention,
    floorRatio: 0.15,
    fork: shot.fork === true,
  };
  const initialNetwork = buildLightningNetwork(firstEnemy, game.enemies, options);
  const enemiesById = new Map(game.enemies.map((enemy) => [enemy.id, enemy]));
  const appliedIds = new Set();
  const killedIds = new Set();
  let applied = 0;

  const applyNodes = (nodes) => {
    for (const node of nodes) {
      if (appliedIds.has(node.targetId)) continue;
      appliedIds.add(node.targetId);
      const target = enemiesById.get(node.targetId);
      if (!target) continue;
      const wasAlive = target.health > 0;
      if (!damageEnemy(target, node.damage, "lightning", 0.12)) continue;
      upsertLightningHitEffect(game, target);
      applied += 1;
      if (wasAlive && target.health <= 0) killedIds.add(target.id);
      if (shot.paralyze !== true || target.kind === "boss") continue;
      if (readCombatRoll() >= 0.12) continue;
      target.slowStatuses ??= [];
      const status = {
        source: "lightning",
        amount: 1,
        expiresAt: game.time + 0.5,
      };
      const statusIndex = target.slowStatuses.findIndex(
        (candidate) => candidate?.source === "lightning",
      );
      if (statusIndex >= 0) target.slowStatuses[statusIndex] = status;
      else target.slowStatuses.push(status);
    }
  };

  applyNodes(initialNetwork.hits);
  let finalNetwork = initialNetwork;
  if (shot.killArc === true && killedIds.size > 0) {
    finalNetwork = buildLightningNetwork(firstEnemy, game.enemies, {
      ...options,
      killArc: true,
      killedIds,
    });
    applyNodes(finalNetwork.hits);
  }

  for (const segment of finalNetwork.segments) {
    const origin = enemiesById.get(segment.from);
    const target = enemiesById.get(segment.to);
    if (!origin || !target) continue;
    game.lightningArcs.push({
      x1: origin.x,
      y1: origin.y,
      x2: target.x,
      y2: target.y,
      life: 0.12,
      maxLife: 0.12,
    });
  }

  if (shot.terminalBlast === true) {
    for (const endpoint of finalNetwork.endpoints) {
      const target = enemiesById.get(endpoint.targetId);
      if (!target) continue;
      explode(target.x, target.y, 70, options.damage * 0.25, "lightning");
    }
  }
  return applied;
}

function canChargeArrowRain() {
  const player = game.player;
  return game.mode === "playing" && !game.rewardSession?.active && rewardDialog.hidden
    && !(typeof tankTrialSession !== "undefined" && tankTrialSession.active)
    && player.weapon === "lightning" && player.cooldown <= 0 && player.reload <= 0
    && player.dodgeDuration <= 0 && hasUsableAmmo(player, "lightning", developerSession);
}

function startArrowCharge() {
  if (!canChargeArrowRain()) return false;
  const player = game.player;
  if (player.chargeWeapon === "lightning") return true;
  player.chargeWeapon = "lightning";
  player.chargeTime = 0;
  return true;
}

function updateArrowCharge(dt) {
  const player = game.player;
  if (player.chargeWeapon === "lightning" && (!canChargeArrowRain() || !mouse.down)) {
    cancelWatermelonCharge(player);
    mouse.down = false;
    return;
  }
  if (mouse.down && player.weapon === "lightning" && !player.chargeWeapon) startArrowCharge();
  if (player.chargeWeapon === "lightning") {
    player.chargeTime = Math.min(2, player.chargeTime + Math.max(0, Number.isFinite(dt) ? dt : 0));
  }
}

function arrowRainLayout(seconds, stats = lightningStats()) {
  return buildArrowRainLayout(game.player, mouse, seconds, {
    angle: Math.atan2(game.player.aimY, game.player.aimX), range: stats.range,
    areaScale: stats.chainRange / 230,
    extraArrows: Math.round((stats.retention - 0.75) * 80) + (hasWeaponTrait(game, "lightning", "fork") ? 12 : 0),
    width: WIDTH, height: HEIGHT,
  });
}

function releaseArrowCharge() {
  const player = game.player;
  if (player.chargeWeapon !== "lightning") return false;
  const seconds = player.chargeTime, ready = canChargeArrowRain();
  cancelWatermelonCharge(player);
  mouse.down = false;
  if (!ready) return false;
  const stats = lightningStats();
  fireLightning(Math.atan2(player.aimY, player.aimX), stats, seconds);
  if (shouldConsumeAmmo(developerSession)) player.ammo.lightning -= 1;
  player.cooldown = stats.fireRate;
  triggerWeaponVisual(player, "lightning");
  ensureSound()(260 + seconds * 100, 0.18, 0.035, "triangle");
  return true;
}

function fireLightning(angle, stats, seconds = 0) {
  const rain = createArrowRain(arrowRainLayout(seconds, stats), stats.damage, {
    paralyze: hasWeaponTrait(game, "lightning", "paralyze"),
    killArc: hasWeaponTrait(game, "lightning", "kill_arc"),
    terminalBlast: hasWeaponTrait(game, "lightning", "terminal_blast"),
  });
  game.arrowRains ??= [];
  game.arrowRains.push(rain);
  return rain;
}

function updateArrowRains(dt) {
  for (const rain of game.arrowRains ?? []) {
    rain.age += Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const arrow of [...rain.arrows]) {
      if (arrow.impacted || rain.age < arrow.impactAt) continue;
      arrow.impacted = true;
      let target = null, nearest = Infinity;
      for (const enemy of game.enemies) {
        if (enemy.health <= 0 || !pointInArrowRain(enemy, rain.layout)) continue;
        const d = Math.hypot(enemy.x - arrow.x, enemy.y - arrow.y);
        if (d <= 22 + (enemy.radius ?? 20) && d < nearest) { target = enemy; nearest = d; }
      }
      if (target) {
        damageEnemy(target, rain.damage, "lightning", 0.12);
        if (rain.traits.paralyze && !["boss", "brute"].includes(target.kind) && Math.random() < 0.12) {
          target.slowStatuses ??= [];
          target.slowStatuses.push({ source: "lightning", amount: 1, expiresAt: game.time + 0.5 });
        }
        if (rain.traits.killArc && target.health <= 0 && !arrow.echo && rain.echoes < 8) {
          const next = game.enemies.find(enemy => enemy.health > 0 && pointInArrowRain(enemy, rain.layout)
            && Math.hypot(enemy.x - arrow.x, enemy.y - arrow.y) <= 230);
          if (next) {
            rain.echoes++;
            rain.arrows.push({ x: next.x, y: next.y, delay: rain.age + 0.04,
              fallTime: 0.46, impactAt: rain.age + 0.5, impacted: false, echo: true });
          }
        }
      }
      if (rain.traits.terminalBlast) {
        for (const enemy of game.enemies) {
          if (enemy !== target && enemy.health > 0 && pointInArrowRain(enemy, rain.layout)
            && Math.hypot(enemy.x - arrow.x, enemy.y - arrow.y) <= 70) {
            damageEnemy(enemy, rain.damage * 0.25, "lightning", 0.1);
          }
        }
      }
      burst(arrow.x, arrow.y, rain.traits.terminalBlast ? "#fff18a" : "#ffd84a", 3, 65);
    }
  }
  game.arrowRains = (game.arrowRains ?? []).filter(rain => rain.arrows.some(arrow => rain.age < arrow.impactAt + 0.38));
}

function nearestRicochetTarget(bullet) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const enemy of game.enemies) {
    if (enemy.health <= 0 || bullet.hitIds?.includes(enemy.id)) continue;
    const targetDistance = distance(bullet, enemy);
    if (
      targetDistance < nearestDistance ||
      (targetDistance === nearestDistance && String(enemy.id) < String(nearest?.id))
    ) {
      nearest = enemy;
      nearestDistance = targetDistance;
    }
  }
  return nearest;
}

function updateBullets(dt) {
  const spawnedRicochetBullets = [];
  for (const bullet of game.bullets) {
    if (bullet.kind !== "ricochet") {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
    }
    bullet.life -= dt;
    if (["watermelon", "watermelon-slice"].includes(bullet.kind)) {
      bullet.spin =
        (Number.isFinite(bullet.spin) ? bullet.spin : 0) +
        dt * (Number.isFinite(bullet.spinSpeed) ? bullet.spinSpeed : 8);
    }

    if (bullet.kind === "ricochet") {
      advanceRicochetProjectile(bullet, dt, {
        width: WIDTH, height: HEIGHT, enemies: game.enemies,
        obstacles: typeof staticObstacles === "undefined" ? [] : staticObstacles,
      }, (collision) => {
        if (collision.type === "enemy") {
          const enemy = collision.object;
          damageEnemy(enemy, bullet.damage, bullet.source, 0.08);
          bullet.hitIds ??= [];
          if (!bullet.hitIds.includes(enemy.id)) bullet.hitIds.push(enemy.id);
          if (bullet.microBlast && !bullet.microBlastHitIds?.includes(enemy.id)) {
            bullet.microBlastHitIds ??= [];
            bullet.microBlastHitIds.push(enemy.id);
            explode(bullet.x, bullet.y, 45, bullet.damage * .45, bullet.source);
          }
          burst(bullet.x, bullet.y, "#8e252d", 4, 75);
        }
        bullet.bounces -= 1;
        bullet.wallBounceCount = (bullet.wallBounceCount ?? 0) + 1;
        if (bullet.bouncePower) bullet.damage *= 1.12;
        if (bullet.homing) {
          const target = nearestRicochetTarget(bullet);
          if (target) {
            const speed = Math.hypot(bullet.vx, bullet.vy);
            const direction = normalize(target.x - bullet.x, target.y - bullet.y);
            if (direction.x * collision.nx + direction.y * collision.ny > 0) {
              bullet.vx = direction.x * speed;
              bullet.vy = direction.y * speed;
            }
          }
        }
        if (
          bullet.canSplit &&
          !bullet.isSplitChild &&
          !bullet.hasSplit &&
          bullet.wallBounceCount === 3
        ) {
          bullet.hasSplit = true;
          const heading = Math.atan2(bullet.vy, bullet.vx);
          const speed = Math.hypot(bullet.vx, bullet.vy);
          for (const offset of [-0.18, 0.18]) {
            const angle = heading + offset;
            spawnedRicochetBullets.push({
              ...bullet,
              id: game.nextId++,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              damage: bullet.damage * 0.45,
              hitIds: [...(bullet.hitIds ?? [])],
              microBlastHitIds: [...(bullet.microBlastHitIds ?? [])],
              canSplit: false,
              isSplitChild: true,
              hasSplit: true,
            });
          }
        }
        burst(bullet.x, bullet.y, "#bdeaff", 5, 90);
        ensureSound()(210, 0.025, 0.012, "square");
        if (bullet.bounces < 0) bullet.life = 0;
      });
      continue;
    }

    if (bullet.owner === "enemy") {
      if (distance(bullet, game.player) < bullet.radius + 13) {
        hurtPlayer(bullet.damage);
        bullet.life = 0;
      }
      continue;
    }

    if (bullet.kind === "rocket" && bullet.life <= 0 && !bullet.exploded) {
      bullet.exploded = true;
      if (typeof explodeRocket === "function") explodeRocket(bullet);
      else explode(bullet.x, bullet.y, bullet.blastRadius, bullet.damage, bullet.source);
      continue;
    }

    if (bullet.owner === "tank" && bullet.life <= 0) {
      explode(bullet.x, bullet.y, bullet.blastRadius, bullet.damage, bullet.source);
      continue;
    }

    if (
      bullet.kind === "turret-grenade" &&
      !bullet.exploded &&
      (bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > WIDTH ||
        bullet.y < 0 ||
        bullet.y > HEIGHT)
    ) {
      bullet.exploded = true;
      bullet.life = 0;
      explode(
        clamp(bullet.x, 0, WIDTH),
        clamp(bullet.y, 0, HEIGHT),
        bullet.blastRadius,
        bullet.damage,
        bullet.source,
      );
      continue;
    }

    if (
      bullet.kind === "watermelon" &&
      !bullet.exploded &&
      (bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > WIDTH ||
        bullet.y < 0 ||
        bullet.y > HEIGHT)
    ) {
      bullet.exploded = true;
      bullet.life = 0;
      shatterWatermelon(
        clamp(bullet.x, 0, WIDTH),
        clamp(bullet.y, 0, HEIGHT),
        bullet,
      );
      continue;
    }

    if (
      bullet.kind === "watermelon-slice" &&
      (bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > WIDTH ||
        bullet.y < 0 ||
        bullet.y > HEIGHT)
    ) {
      bullet.life = 0;
      continue;
    }

    if (
      bullet.kind === "freeze" &&
      !bullet.exploded &&
      (bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > WIDTH ||
        bullet.y < 0 ||
        bullet.y > HEIGHT)
    ) {
      bullet.exploded = true;
      bullet.life = 0;
      explodeFreeze(
        clamp(bullet.x, 0, WIDTH),
        clamp(bullet.y, 0, HEIGHT),
        bullet.blastRadius,
        bullet.damage,
        bullet.source,
        {
          perHit: bullet.slowPerHit,
          duration: bullet.slowDuration,
          contagiousFreeze: bullet.contagiousFreeze,
          crackShot: bullet.crackShot,
          frostField: bullet.frostField,
        },
      );
      continue;
    }

    for (const enemy of game.enemies) {
      if (bullet.hitIds?.includes(enemy.id)) continue;
      if (distance(bullet, enemy) > bullet.radius + enemy.radius) continue;
      if (
        bullet.kind === "rocket" ||
        bullet.kind === "turret-grenade" ||
        bullet.owner === "tank"
      ) {
        bullet.exploded = true;
        bullet.life = 0;
        if (bullet.kind === "rocket" && typeof explodeRocket === "function") {
          explodeRocket(bullet);
        }
        else explode(bullet.x, bullet.y, bullet.blastRadius, bullet.damage, bullet.source);
        break;
      }
      if (bullet.kind === "freeze") {
        bullet.hitIds ??= [];
        bullet.hitIds.push(enemy.id);
        const remainingHits = Number.isInteger(bullet.remainingEnemyHits)
          ? bullet.remainingEnemyHits
          : 1;
        explodeFreeze(
          bullet.x,
          bullet.y,
          bullet.blastRadius,
          bullet.damage,
          bullet.source,
          {
            perHit: bullet.slowPerHit,
            duration: bullet.slowDuration,
            contagiousFreeze: bullet.contagiousFreeze,
            crackShot: bullet.crackShot,
            frostField: bullet.frostField,
          },
        );
        bullet.remainingEnemyHits = Math.max(0, remainingHits - 1);
        if (bullet.remainingEnemyHits <= 0) {
          bullet.exploded = true;
          bullet.life = 0;
        }
        break;
      }
      if (bullet.kind === "watermelon") {
        bullet.exploded = true;
        bullet.life = 0;
        shatterWatermelon(bullet.x, bullet.y, bullet, enemy);
        break;
      }
      if (bullet.kind === "watermelon-slice") {
        damageEnemy(enemy, bullet.damage, bullet.source, 0.1);
        bullet.hitIds ??= [];
        bullet.hitIds.push(enemy.id);
        bullet.life = 0;
        burst(bullet.x, bullet.y, "#d94a45", 2, 70);
        burst(bullet.x, bullet.y, "#4c9b42", 2, 60);
        break;
      }
      applyDirectBulletHit(bullet, enemy);
      burst(bullet.x, bullet.y, "#8e252d", 4, 75);
      break;
    }

    if (bullet.life <= 0) continue;
  }
  game.bullets.push(...spawnedRicochetBullets);

  const dead = game.enemies.filter((enemy) => enemy.health <= 0);
  const deathSources = new Map(
    dead.map((enemy) => [enemy.id, enemy.lastDamageSource]),
  );
  for (const enemy of dead) {
    if (enemy.isRareButterfly) {
      if (!enemy.escaped) {
        grantButterflyBuff(game.player, enemy.butterflyColor, game.time);
        burst(enemy.x, enemy.y, enemy.butterflyColor === "blue" ? "#62caff" : "#ffe066", 20, 120);
        game.notice = enemy.butterflyColor === "blue" ? "蓝蝶祝福 · 双倍伤害 10 秒" : "金蝶祝福 · 移速 +50% 10 秒";
        game.noticeTimer = 2;
      }
      continue;
    }
    if (typeof refillPistolOnKill === "function") {
      refillPistolOnKill(deathSources.get(enemy.id));
    }
    if (enemy.kind === "exploder") {
      if (enemy.attackAnimation <= 0) triggerEnemyAttack(enemy);
      detonateEnemy(enemy);
    }
    if (enemy.kind === "toxic" || enemy.bossArchetype === "toxic") createGas(enemy.x, enemy.y, enemy.gasRadius);
    if (enemy.bossArchetype === "exploder") detonateEnemy(enemy);
    if (
      deathSources.get(enemy.id) === "flamethrower" &&
      typeof hasWeaponTrait === "function" &&
      hasWeaponTrait(game, "flamethrower", "corpse_burst")
    ) {
      explode(
        enemy.x,
        enemy.y,
        70,
        (typeof flamethrowerStats === "function" ? flamethrowerStats().damage : 12) * 0.6,
        "flamethrower",
      );
    }
    createEnemySupplies(enemy);
    if (enemy.freezeExecuted) {
      game.iceStatues ??= [];
      game.iceStatues.push({
        kind: enemy.kind,
        ...(enemy.bossArchetype ? { bossArchetype: enemy.bossArchetype, bossScale: enemy.bossScale } : {}),
        x: enemy.x,
        y: enemy.y,
        radius: enemy.radius,
        action: resolveEnemyAction(enemy),
        animationTime: enemy.animationTime,
        animationPhase: enemy.animationPhase,
        hitFlash: 0,
        life: 0.35,
        maxLife: 0.35,
      });
    } else {
      const attackLead = enemy.kind === "exploder" ? enemy.attackAnimation : 0;
      game.enemyDeathAnimations.push({
        kind: enemy.kind,
        ...(enemy.bossArchetype ? { bossArchetype: enemy.bossArchetype, bossScale: enemy.bossScale } : {}),
        x: enemy.x,
        y: enemy.y,
        hitFlash: 0,
        elapsed: 0,
        attackLead,
        maxLife: attackLead + ZOMBIE_ACTIONS.death.frames / ZOMBIE_ACTIONS.death.fps,
      });
    }
    if (tankTrialSession.active) {
      tankTrialSession = creditTankTrialKill(
        tankTrialSession,
        enemy.kind,
        deathSources.get(enemy.id),
      );
    } else {
      applyKill(game, enemy.kind, 1, enemy.scoreMultiplier);
      if (typeof spawnRareButterfly === "function") spawnRareButterfly(rollRareButterfly(), enemy.x, enemy.y);
    }
    if (enemy.freezeExecuted) {
      burst(enemy.x, enemy.y, "#8bdcff", 12, 150);
      burst(enemy.x, enemy.y, "#dff8ff", 7, 105);
    } else {
      game.decals.push({ x: enemy.x, y: enemy.y, radius: 12 + Math.random() * 12, alpha: 0.28 });
      burst(enemy.x, enemy.y, "#7d2429", 9, 125);
    }
  }
  if (dead.length) ensureSound()(120 + Math.min(120, game.combo * 2), 0.035, 0.018, "triangle");
  game.enemies = game.enemies.filter((enemy) => enemy.health > 0);
  game.bullets = game.bullets.filter(
    (bullet) =>
      bullet.life > 0 &&
      bullet.x > -80 &&
      bullet.x < WIDTH + 80 &&
      bullet.y > -80 &&
      bullet.y < HEIGHT + 80,
  );
}

function explodeRocket(bullet) {
  if (bullet.explosionResolved === true) return false;
  bullet.explosionResolved = true;
  const { x, y, blastRadius: radius, damage, source = "rocket" } = bullet;
  for (const enemy of game.enemies) {
    if (enemy.health <= 0 || distance({ x, y }, enemy) > radius) continue;
    const heavyMultiplier =
      bullet.armorBreak && ["boss", "brute"].includes(enemy.kind) ? 1.3 : 1;
    damageEnemy(enemy, damage * heavyMultiplier, source, 0.12);
    if (bullet.shockSlow && enemy.kind !== "boss") {
      enemy.slowStatuses ??= [];
      enemy.slowStatuses.push({
        source: "rocket-shock",
        amount: 0.35,
        expiresAt: game.time + 1.5,
      });
    }
  }
  if (bullet.cluster && !bullet.clusterChild) {
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * TAU + Math.PI / 4;
      game.bullets.push({
        id: game.nextId++, owner: "player", kind: "rocket-cluster",
        clusterChild: true, x, y,
        vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420,
        damage: damage * 0.2, radius: 3, life: 0.8, color: "#f0a451",
        source, originX: x, originY: y, remainingPierces: 0, hitIds: [],
      });
    }
  }
  if (bullet.burningGround) {
    game.damageZones.push({
      source, x, y, radius: radius * 0.55,
      dps: damage * 0.25, life: 3, maxLife: 3,
    });
  }
  burst(x, y, "#e8a04c", 28, 260);
  ensureSound()(58, 0.22, 0.07, "sawtooth");
  return true;
}

function shatterWatermelon(x, y, bullet, directTarget = null) {
  const damage = Number.isFinite(bullet?.damage) ? bullet.damage : 0;
  const source = bullet?.source ?? "watermelon";
  const spreadDistance =
    Number.isFinite(bullet?.blastRadius) && bullet.blastRadius > 0
      ? bullet.blastRadius
      : 100;

  if (directTarget) {
    const directMultiplier = bullet.crushing === true ? 1.3 : 1;
    damageEnemy(directTarget, damage * directMultiplier, source, 0.14);
  }

  const speed = 360;
  const sliceDamage = damage * (
    bullet.ripeCore === true && bullet.fullCharge === true ? 0.45 : 0.3
  );
  const excludedIds = directTarget ? [directTarget.id] : [];
  for (const [index, angle] of buildWatermelonSliceAngles(x, y).entries()) {
    const spinDirection = index % 2 === 0 ? 1 : -1;
    game.bullets.push({
      id: game.nextId++,
      owner: "player",
      kind: "watermelon-slice",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      damage: sliceDamage,
      source,
      radius: 7,
      color: "#d94a45",
      life: spreadDistance / speed,
      angle,
      spin: angle,
      spinSpeed: spinDirection * (8 + index % 3 * 2),
      hitIds: [...excludedIds],
    });
  }

  if (bullet.seedStorm === true) {
    for (const angle of buildSeedAngles(10)) {
      game.bullets.push({
        id: game.nextId++,
        owner: "player",
        kind: "watermelon-seed",
        seed: true,
        x,
        y,
        vx: Math.cos(angle) * 560,
        vy: Math.sin(angle) * 560,
        damage: damage * 0.12,
        source,
        radius: 3,
        color: "#263126",
        life: 0.9,
        originX: x,
        originY: y,
        remainingPierces: 0,
        hitIds: [],
      });
    }
  }
  if (bullet.juiceField === true) {
    game.slowZones ??= [];
    game.slowZones.push({
      source: "watermelon",
      amount: 0.25,
      x,
      y,
      radius: spreadDistance,
      life: 3,
      maxLife: 3,
      excludesBoss: true,
    });
  }
  burst(x, y, "#d94a45", 6, 150);
  burst(x, y, "#263126", 3, 130);
  burst(x, y, "#4c9b42", 3, 120);
  ensureSound()(54, 0.18, 0.06, "sawtooth");
  return 8;
}

function freezeStatusAmount(enemy, source) {
  const status = enemy.slowStatuses?.find((candidate) => candidate?.source === source);
  return Number.isFinite(status?.amount) ? Math.max(0, status.amount) : 0;
}

function queueFreezeContagion(enemy, chain) {
  if (!chain.enabled || chain.emittedIds.has(enemy.id)) return false;
  chain.emittedIds.add(enemy.id);
  chain.queue.push({ id: enemy.id, x: enemy.x, y: enemy.y });
  return true;
}

function resolveFreezeCap(enemy, source, chain) {
  if (enemy.isTrainingDummy) return "none";
  if (enemy.health <= 0) return "none";
  const type = freezeTargetClass(enemy);
  if (type === "ordinary") {
    enemy.freezeExecuted = true;
    queueFreezeContagion(enemy, chain);
    damageEnemy(enemy, Math.max(enemy.health, 0.001), source, 0.12);
  } else if (type === "elite") {
    queueFreezeContagion(enemy, chain);
    damageEnemy(enemy, enemy.maxHealth * 0.5, source, 0.12);
    const status = enemy.slowStatuses.find((item) => item?.source === source);
    if (status) status.amount = 0;
  }
  return type;
}

function applyFreezeHit(enemy, damage, source, options, chain) {
  const previousAmount = freezeStatusAmount(enemy, source);
  if (damage > 0) {
    damageEnemy(
      enemy,
      damage * freezeDamageMultiplier(previousAmount, options.crackShot),
      source,
      0.12,
    );
  }
  enemy.slowStatuses ??= [];
  const statusIndex = enemy.slowStatuses.findIndex(
    (status) => status?.source === source,
  );
  const previous = statusIndex >= 0 ? enemy.slowStatuses[statusIndex] : {};
  const result = applyFreezeStatus(previous, enemy.kind, game.time, {
    perHit: options.perHit,
    duration: options.duration,
  });
  const next = { source, ...result.status };
  if (statusIndex >= 0) enemy.slowStatuses[statusIndex] = next;
  else enemy.slowStatuses.push(next);
  if (result.reachedCap) resolveFreezeCap(enemy, source, chain);
  return result;
}

function spreadFreezeContagion(chain, source, options) {
  let index = 0;
  while (index < chain.queue.length) {
    const origin = chain.queue[index];
    index += 1;
    const hitIds = new Set();
    for (const enemy of game.enemies) {
      if (
        enemy.health <= 0 ||
        enemy.id === origin.id ||
        hitIds.has(enemy.id) ||
        distance(origin, enemy) > 90
      ) continue;
      hitIds.add(enemy.id);
      applyFreezeHit(enemy, 0, source, {
        ...options,
        perHit: 0.25,
        crackShot: false,
      }, chain);
    }
  }
}

function explodeFreeze(x, y, radius, damage, source, options = {}) {
  const chain = {
    enabled: options.contagiousFreeze === true,
    emittedIds: new Set(),
    queue: [],
  };
  for (const enemy of game.enemies) {
    if (enemy.health <= 0 || distance({ x, y }, enemy) > radius) continue;
    applyFreezeHit(enemy, damage, source, options, chain);
  }
  spreadFreezeContagion(chain, source, options);
  if (options.frostField === true) {
    game.slowZones ??= [];
    game.slowZones.push({
      source: "freeze",
      amount: 0.2,
      x,
      y,
      radius,
      life: 2,
      maxLife: 2,
    });
  }
  burst(x, y, "#8bdcff", 22, 190);
  game.particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    life: 0.3,
    maxLife: 0.3,
    color: "#dff8ff",
    size: radius,
  });
  ensureSound()(180, 0.18, 0.055, "sine");
}

function explode(x, y, radius, damage, source) {
  let kills = 0;
  for (const enemy of game.enemies) {
    const proximity = 1 - clamp(distance({ x, y }, enemy) / radius, 0, 1);
    if (proximity > 0) {
      damageEnemy(enemy, damage * (0.45 + proximity * 0.55), source, 0.12);
      if (enemy.health <= 0) kills += 1;
    }
  }
  burst(x, y, "#e8a04c", 28, 260);
  game.particles.push({ x, y, vx: 0, vy: 0, life: 0.28, maxLife: 0.28, color: "#ffc15c", size: radius });
  ensureSound()(58, 0.22, 0.07, "sawtooth");
  if (kills > 1) game.combo = clamp(game.combo + kills - 1, 1, 150);
}

function detonateEnemy(enemy) {
  if (enemy.detonated) return;
  enemy.detonated = true;
  const radius =
    Number.isFinite(enemy.explosionRadius) && enemy.explosionRadius > 0
      ? enemy.explosionRadius
      : 122;
  if (distance(enemy, game.player) < radius) hurtPlayer(enemy.damage);
  explode(enemy.x, enemy.y, radius, 74, "enemy-exploder");
}

function createEnemySupplies(enemy) {
  const canDrop =
    enemy.kind !== "boss" ||
    rewardBossKill(game, enemy);
  if (!canDrop) return;
  const survival =
    typeof tankTrialSession === "undefined" || !tankTrialSession.active;
  const drops = rollEnemyDrops(enemy.kind, game.unlocked, Math.random, {
    wave: game.wave,
    survival,
    healthRatio: game.player.health / game.player.maxHealth,
    ammoRatio: ammoFillRatio(game.unlocked, game.player, game.weaponUpgrades),
    player: game.player,
    upgrades: game.weaponUpgrades,
    infiniteAmmo: developerSession.enabled && developerSession.infiniteAmmo,
  });
  if (enemy.kind === "brute" || enemy.kind === "devil") {
    drops.push({ kind: "shield" });
  }
  createSupplyPickups(drops, enemy.x, enemy.y);
}

function createSupplyPickups(drops, x, y) {
  const spacing = 44;
  const halfSpan = (Math.max(0, drops.length - 1) * spacing) / 2;
  const horizontalMargin = 52 + halfSpan;
  const baseX = clamp(x, horizontalMargin, WIDTH - horizontalMargin);
  const baseY = clamp(y, 52, HEIGHT - 52);
  drops.forEach((drop, index) => {
    const offsetX = index * spacing - halfSpan;
    game.pickups.push({
      id: game.nextId++,
      ...drop,
      x: baseX + offsetX,
      y: baseY,
      radius: 18,
      collected: false,
    });
  });
  if (game.pickups.length > 80) game.pickups.splice(0, game.pickups.length - 80);
}

function createGas(x, y, radius = 82) {
  game.hazards.push({
    id: game.nextId++,
    kind: "gas",
    x,
    y,
    radius: Number.isFinite(radius) && radius > 0 ? radius : 82,
    life: 3,
    damageCooldown: 0,
  });
}

function updatePickups() {
  const modifiers = playerModifiers(game.playerUpgrades);
  for (const pickup of game.pickups) {
    const pickupDistance = (pickup.radius + 18) * modifiers.pickupMultiplier;
    if (distance(pickup, game.player) >= pickupDistance) continue;
    if (pickup.kind === "health") {
      const canHeal =
        game.player.health > 0 && game.player.health < game.player.maxHealth;
      if (!canHeal) continue;
      const previousHealth = game.player.health;
      game.player.health = healthAfterPack(
        game.player.health,
        game.player.maxHealth,
        modifiers.healthPackRatio,
      );
      pickup.collected = true;
      const restored = Math.ceil(game.player.health - previousHealth);
      game.notice = `回血 +${restored}`;
      game.noticeTimer = 1.8;
      burst(pickup.x, pickup.y, "#8dcf92", 18, 150);
      ensureSound()(520, 0.16, 0.035, "sine");
      continue;
    }
    if (pickup.kind === "shield") {
      const capacity = shieldCapacity(game.player.maxHealth);
      if (capacity <= 0 || game.player.shield >= capacity) continue;
      const previousShield = game.player.shield ?? 0;
      game.player.shield = refillShield(game.player.maxHealth);
      pickup.collected = true;
      game.notice = `护盾 +${Math.ceil(game.player.shield - previousShield)}`;
      game.noticeTimer = 1.8;
      burst(pickup.x, pickup.y, "#63c7ff", 16, 150);
      ensureSound()(680, 0.16, 0.035, "sine");
      continue;
    }
    if (pickup.kind !== "ammo") continue;
    const infiniteAmmo = developerSession.enabled && developerSession.infiniteAmmo;
    const result = resolveAmmoPickup(
      game.player,
      pickup.weaponId,
      infiniteAmmo,
      game.weaponUpgrades,
    );
    if (!result.collected) continue;
    game.player[result.storage][result.weaponId] = result.nextValue;
    pickup.collected = true;
    game.notice = `${result.label} 弹药 +${result.amount}`;
    game.noticeTimer = 1.8;
    burst(pickup.x, pickup.y, "#d7a84f", 16, 140);
    ensureSound()(390, 0.12, 0.03, "square");
  }
  game.pickups = game.pickups.filter((pickup) => !pickup.collected);
}

function updateHazards(dt) {
  let touchingGas = false;
  for (const hazard of game.hazards) {
    hazard.life -= dt;
    hazard.damageCooldown -= dt;
    if (distance(hazard, game.player) < hazard.radius) touchingGas = true;
  }
  if (touchingGas && !isPlayerInvulnerable(game.player)) {
    const active = game.hazards.find((hazard) => hazard.damageCooldown <= 0);
    if (active) {
      hurtPlayer(4);
      for (const hazard of game.hazards) hazard.damageCooldown = 0.45;
    }
  }
  game.hazards = game.hazards.filter((hazard) => hazard.life > 0);
}

function updateDamageZones(dt) {
  for (const zone of game.damageZones) {
    zone.life -= dt;
    for (const enemy of game.enemies) {
      if (enemy.health <= 0 || distance(zone, enemy) > zone.radius + enemy.radius) {
        continue;
      }
      damageEnemy(enemy, zone.dps * dt, zone.source, 0.02);
    }
  }
  game.damageZones = game.damageZones.filter(({ life }) => life > 0);
}

function updateSlowZones(dt) {
  for (const zone of game.slowZones ?? []) zone.life -= dt;
  game.slowZones = (game.slowZones ?? []).filter(({ life }) => life > 0);
}

function updateSpikeTraps(dt) {
  game.spikeTraps = game.spikeTraps
    .map((trap) => advanceSpikeTrap(trap, dt))
    .filter(Boolean);
  for (const trap of game.spikeTraps) {
    if (trap.phase !== "active") continue;
    if (
      !trap.hitIds.has("player") &&
      !isPlayerInvulnerable(game.player) &&
      game.player.hitFlash <= 0 &&
      isSpikeTrapTouching(trap, { ...game.player, radius: 18 })
    ) {
      trap.hitIds.add("player");
      hurtPlayer(SPIKE_TRAP_PLAYER_DAMAGE);
    }
    for (const enemy of game.enemies) {
      if (
        trap.hitIds.has(enemy.id) ||
        !isSpikeTrapTouching(trap, enemy)
      ) continue;
      trap.hitIds.add(enemy.id);
      damageEnemy(enemy, SPIKE_TRAP_ENEMY_DAMAGE, "spike-trap", 0.12);
    }
  }
}

function updateTerrainTraps(dt) {
  game.terrainTraps = (game.terrainTraps ?? []).map((trap) => {
    const next = advanceTerrainTrap(trap, dt);
    if (trap.phase !== "active" && next.phase === "active" && game.particles.length < 400) {
      burst(next.x, next.y, next.kind === "mud" ? "#c09a71" : "#a6d97c", 5, 70);
    }
    return next;
  });
  for (const trap of game.terrainTraps) {
    if (trap.kind === "vine") {
      for (const id of trap.hitIds) {
        const enemy = game.enemies.find((target) => target.id === id && target.health > 0);
        if (!enemy || Math.hypot(trap.x - enemy.x, trap.y - enemy.y) >
            trap.radius + enemy.radius + 8) trap.hitIds.delete(id);
      }
    }
    if (trap.phase !== "active") continue;
    if (trap.kind === "mud") {
      trap.splashTimer = Math.max(0, (trap.splashTimer ?? 0) - dt);
      if (trap.splashTimer > 0 || game.particles.length >= 400) continue;
      const target = isTerrainTrapTouching(trap, { ...game.player, radius: 18 })
        ? game.player
        : game.enemies.find((enemy) =>
          enemy.health > 0 && !enemy.isRareButterfly && isTerrainTrapTouching(trap, enemy));
      if (target) {
        burst(target.x, target.y + 7, "#c3a078", 2, 42);
        trap.splashTimer = 0.24;
      }
      continue;
    }
    if (trap.kind !== "vine") continue;
    let captured = false;
    for (const enemy of game.enemies) {
      if (enemy.health <= 0 || enemy.isRareButterfly ||
          trap.hitIds.has(enemy.id) || !isTerrainTrapTouching(trap, enemy)) continue;
      trap.hitIds.add(enemy.id);
      enemy.entangledUntil = Math.max(enemy.entangledUntil ?? 0, game.time + VINE_BIND_SECONDS);
      enemy.entangledStartedAt = game.time;
      captured = true;
      if (trap.hitIds.size <= 4 && game.particles.length < 400) {
        burst(enemy.x, enemy.y, "#a8d879", 5, 85);
      }
    }
    if (captured) {
      trap.rearmTime = VINE_REARM_SECONDS;
      trap.phase = "dormant";
    }
  }
}

function updateShockwaves(dt) {
  for (const shockwave of game.shockwaves) {
    if (shockwave.bossSkill && !game.enemies.some(enemy => enemy.id === shockwave.ownerBoss && enemy.health > 0)) { shockwave.life = 0; continue; }
    shockwave.life -= dt;
    const progress = 1 - shockwave.life / shockwave.maxLife;
    shockwave.radius = 20 + progress * 360;
    const ringDistance = Math.abs(distance(shockwave, game.player) - shockwave.radius);
    if (!shockwave.hitPlayer && ringDistance < 26) {
      shockwave.hitPlayer = true;
      hurtPlayer(18);
    }
  }
  game.shockwaves = game.shockwaves.filter((shockwave) => shockwave.life > 0);
}

function updateLightning(dt) {
  if (!isLightningBurstUnlocked(game.wave)) {
    game.ultimateTimer = 20;
    game.pendingLightningRings = 0;
    game.lightningSpawnTimer = 0;
    game.lightningRings.length = 0;
    return;
  }
  const waveIsResting = game.waveQueue.length === 0 && !game.enemies.some(enemy => !enemy.isRareButterfly);
  if (!waveIsResting) {
    game.ultimateTimer -= dt;
    if (game.ultimateTimer <= 0) {
      game.pendingLightningRings += lightningRingCount(game.bossKills);
      game.lightningSpawnTimer = Math.min(0, game.lightningSpawnTimer);
      game.ultimateTimer += 20;
      game.notice = `雷电降临 ×${lightningRingCount(game.bossKills)}`;
      game.noticeTimer = 1.8;
      ensureSound()(360, 0.24, 0.045, "sawtooth");
    }

    if (game.pendingLightningRings > 0) {
      game.lightningSpawnTimer -= dt;
      if (game.lightningSpawnTimer <= 0) {
        game.lightningRings.push({
          id: game.nextId++,
          x: game.player.x,
          y: game.player.y,
          life: 0.75,
          maxLife: 0.75,
          radius: 32,
          hitIds: new Set(),
        });
        game.pendingLightningRings -= 1;
        game.lightningSpawnTimer = 0.16;
      }
    }
  }

  for (const ring of game.lightningRings) {
    if (!tickLightningRingLifetime(ring, dt)) continue;
    const progress = 1 - ring.life / ring.maxLife;
    ring.radius = 32 + progress * 488;
    for (const enemy of game.enemies) {
      if (ring.hitIds.has(enemy.id)) continue;
      const ringDistance = Math.abs(distance(ring, enemy) - ring.radius);
      if (ringDistance > enemy.radius + 18) continue;
      ring.hitIds.add(enemy.id);
      damageEnemy(enemy, enemy.kind === "boss" ? 40 : 62, "lightning", 0.12);
      if (enemy.kind !== "boss") {
        const push = normalize(enemy.x - ring.x, enemy.y - ring.y);
        enemy.x += push.x * 42;
        enemy.y += push.y * 42;
      }
      burst(enemy.x, enemy.y, "#8edfff", 5, 110);
    }
  }
  game.lightningRings = game.lightningRings.filter((ring) => ring.life > 0);
}

function hurtPlayer(amount) {
  if (developerSession.enabled && developerSession.invincible) return;
  if (isPlayerInvulnerable(game.player) || game.player.hitFlash > 0) return;
  const modifiers = playerModifiers(game.playerUpgrades);
  const effectiveDamage = amount * (1 - modifiers.damageReduction);
  const damage = absorbShieldDamage(
    game.player.shield, effectiveDamage, game.player.maxHealth,
  );
  game.player.shield = damage.shield;
  game.player.health -= damage.healthDamage;
  game.player.hitFlash = 0.24;
  game.combo = Math.max(1, game.combo - 2);
  ensureSound()(74, 0.1, 0.035, "sawtooth");
}

function burst(x, y, color, count, speed) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * TAU;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    const life = 0.18 + Math.random() * 0.34;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life,
      maxLife: life,
      color,
      size: 2 + Math.random() * 4,
    });
  }
}

function updateParticles(dt) {
  if (typeof updateArrowRains === "function") updateArrowRains(dt);
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.94;
    particle.vy *= 0.94;
    if (Number.isFinite(particle.spinSpeed)) {
      particle.spin = (particle.spin ?? 0) + particle.spinSpeed * dt;
    }
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
  for (const beam of game.beams) beam.life -= dt;
  game.beams = game.beams.filter((beam) => beam.life > 0);
  for (const arc of game.lightningArcs) arc.life -= dt;
  game.lightningArcs = game.lightningArcs.filter((arc) => arc.life > 0);
  tickLightningHitEffects(game, dt);
  game.iceStatues ??= [];
  for (const statue of game.iceStatues) statue.life -= dt;
  game.iceStatues = game.iceStatues.filter((statue) => statue.life > 0);
  if (game.decals.length > 80) game.decals.splice(0, game.decals.length - 80);
  game.enemyDeathAnimations = advanceZombieDeaths(game.enemyDeathAnimations, dt);
}

function failActiveTankTrial(reason) {
  const validSession =
    tankTrialSession !== null &&
    typeof tankTrialSession === "object" &&
    !Array.isArray(tankTrialSession);
  const hasSnapshot =
    typeof tankTrialSnapshot !== "undefined" && tankTrialSnapshot !== null;
  if (validSession && tankTrialSession.active === false && !hasSnapshot) {
    return false;
  }
  const activeSession = validSession
    ? { ...tankTrialSession, active: true }
    : { ...createTankTrialSession(), active: true };
  tankTrialSession = failTankTrial(activeSession, reason);
  return restoreFromTankTrial(false, "坦克试炼失败，碎片已清零");
}

function startNextTankTrialStage() {
  const pistol = weapons.find((weapon) => weapon.id === "pistol");
  game.wave = tankTrialSession.stage + 1;
  game.waveQueue = buildTankTrialWave(tankTrialSession.stage);
  game.waveEnhancements = [];
  game.spikeTraps = [];
  game.terrainTraps = [];
  game.spawnTimer = 0;
  game.intermission = 0;
  game.player.weapon = "pistol";
  game.player.ammo.pistol = pistol.ammo;
  cancelReload(game.player);
  game.notice = `坦克试炼 ${tankTrialSession.stage + 1}/${TANK_TRIAL_STAGES.length}`;
  game.noticeTimer = 2;
  renderTankTrialFragments();
  renderWeaponBar();
}

function updateTankTrialWave(dt) {
  try {
    const validSession =
      tankTrialSession !== null &&
      typeof tankTrialSession === "object" &&
      !Array.isArray(tankTrialSession);
    if (!validSession) throw new TypeError("Invalid tank trial session");
    const stage = TANK_TRIAL_STAGES[tankTrialSession.stage];
    if (
      !tankTrialSession.active ||
      !stage ||
      tankTrialSession.fragments !== tankTrialSession.stage ||
      tankTrialSession.targetScore !== stage.targetScore ||
      !Number.isFinite(tankTrialSession.stageScore) ||
      tankTrialSession.stageScore < 0 ||
      !Array.isArray(game.waveQueue) ||
      !Array.isArray(game.enemies)
    ) {
      throw new TypeError("Invalid tank trial runtime state");
    }
    const stageQueue = buildTankTrialWave(tankTrialSession.stage);
    const allowedCounts = new Map();
    for (const kind of stageQueue) {
      allowedCounts.set(kind, (allowedCounts.get(kind) ?? 0) + 1);
    }
    const remainingCounts = new Map();
    const remainingKinds = [
      ...game.waveQueue,
      ...game.enemies.map((enemy) => enemy?.kind),
    ];
    for (const kind of remainingKinds) {
      const count = (remainingCounts.get(kind) ?? 0) + 1;
      if (!allowedCounts.has(kind) || count > allowedCounts.get(kind)) {
        throw new TypeError("Invalid tank trial enemy queue");
      }
      remainingCounts.set(kind, count);
    }

    const spawnLimit = 18;
    if (game.waveQueue.length > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0 && game.enemies.filter(enemy => !enemy.isRareButterfly).length < spawnLimit) {
        const kind = game.waveQueue[0];
        if (spawnEnemy(kind) !== false) game.waveQueue.shift();
        game.spawnTimer = 0.28;
      }
      return "active";
    }
    if (game.enemies.some(enemy => !enemy.isRareButterfly)) return "active";

    game.intermission += dt;
    if (game.intermission < 1.5) return "active";
    const result = finishTankTrialStage(tankTrialSession);
    tankTrialSession = result.session;

    if (result.outcome === "failed") {
      restoreFromTankTrial(false, "坦克试炼失败，碎片已清零");
      return "restored";
    }
    if (result.outcome === "completed") {
      restoreFromTankTrial(true, "坦克已解锁");
      return "restored";
    }
    if (result.outcome !== "next") {
      throw new TypeError("Invalid tank trial stage outcome");
    }
    startNextTankTrialStage();
    return "advanced";
  } catch (error) {
    console.error("坦克试炼状态异常", error);
    failActiveTankTrial("state");
    return "restored";
  }
}

function updateWave(dt) {
  if (typeof modelLab !== "undefined" && modelLab) return "model-lab";
  if (typeof tankTrialSession !== "undefined" && tankTrialSession.active) {
    return updateTankTrialWave(dt);
  }
  const spawnLimit = getEnemySpawnLimit(game, developerSession);
  if (game.waveQueue.length > 0) {
    game.spawnTimer -= dt;
    const bossPair = game.waveQueue[0] === "boss" && game.waveQueue[1] === "boss" && spawnLimit >= 2;
    const batchSize = bossPair ? 2 : 1;
    if (game.spawnTimer <= 0 && game.enemies.filter(enemy => !enemy.isRareButterfly).length + batchSize <= spawnLimit) {
      for (let i = 0; i < batchSize; i++) {
        if (spawnEnemy(game.waveQueue[0]) === false) break;
        game.waveQueue.shift();
      }
      game.spawnTimer = Math.max(0.16, 0.72 - game.wave * 0.025);
    }
    return "active";
  }
  if (game.enemies.some(enemy => !enemy.isRareButterfly)) return "active";
  if (!developerSession.enabled && game.wave > 0 && game.wave % 20 === 0) {
    game.rewardSession = openRewardSession(game.rewardSession, game.wave);
    if (game.rewardSession.active) {
      game.notice = `第 ${game.wave} 波奖励`;
      game.noticeTimer = 0.15;
      openRewardDialog();
      return "reward";
    }
  }
  const nextWave = game.wave + 1;
  if (nextWave < 31) {
    game.spikeTraps = [];
    game.terrainTraps = [];
  } else if (
    ![...(game.spikeTraps ?? []), ...(game.terrainTraps ?? [])]
      .some((trap) => trap?.wave === nextWave)
  ) {
    const prepared = createWaveTraps({
      wave: nextWave,
      width: WIDTH,
      height: HEIGHT,
      obstacles: staticObstacles,
      structures: game.structures,
      player: game.player,
      random: Math.random,
      active: false,
    });
    game.spikeTraps = prepared.spikeTraps;
    game.terrainTraps = prepared.terrainTraps;
  }
  game.intermission += dt;
  if (game.intermission < 7) {
    game.notice = `喘息 ${Math.ceil(7 - game.intermission)}`;
    game.noticeTimer = 0.15;
    return "active";
  }
  game.intermission = 0;
  game.wave += 1;
  if (game.wave >= 31) {
    const spikes = (game.spikeTraps ?? []).filter((trap) => trap?.wave === game.wave);
    const terrain = (game.terrainTraps ?? []).filter((trap) => trap?.wave === game.wave);
    if (spikes.length + terrain.length > 0) {
      game.spikeTraps = activateSpikeTraps(spikes);
      game.terrainTraps = activateTerrainTraps(terrain);
    } else {
      const spawned = createWaveTraps({
        wave: game.wave,
        width: WIDTH,
        height: HEIGHT,
        obstacles: staticObstacles,
        structures: game.structures,
        player: game.player,
        random: Math.random,
        active: true,
      });
      game.spikeTraps = spawned.spikeTraps;
      game.terrainTraps = spawned.terrainTraps;
    }
  } else {
    game.spikeTraps = [];
    game.terrainTraps = [];
  }
  game.waveQueue = buildWave(game.wave);
  game.waveEnhancements = buildWaveEnhancements(game.wave, Math.random);
  if (developerSession.enabled) {
    developerSession.targetWave = game.wave;
    developerSession.totalCount = game.waveQueue.length;
    syncDeveloperControls();
  }
  resetWaveLightning(game);
  game.notice = `第 ${game.wave} 波`;
  game.noticeTimer = 2;
  game.player.reserve.shotgun += 12;
  if (game.unlocked.includes("turret")) game.player.ammo.turret = Math.min(typeof turretStats === "function" ? turretStats().capacity : 2, game.player.ammo.turret + 1);
  if (game.unlocked.includes("tank")) game.player.ammo.tank = Math.min(1, game.player.ammo.tank + 1);
  if (game.unlocked.includes("rocket")) game.player.ammo.rocket = Math.min(6, game.player.ammo.rocket + 2);
  if (game.unlocked.includes("flamethrower")) game.player.ammo.flamethrower = Math.min(100, game.player.ammo.flamethrower + 35);
  if (game.unlocked.includes("laser")) game.player.ammo.laser = Math.min(5, game.player.ammo.laser + 1);
  if (game.unlocked.includes("ricochet")) game.player.ammo.ricochet = Math.min(8, game.player.ammo.ricochet + 2);
  return "advanced";
}

function resolveTankTrialFrameState() {
  const validSession =
    typeof tankTrialSession !== "undefined" &&
    tankTrialSession !== null &&
    typeof tankTrialSession === "object" &&
    !Array.isArray(tankTrialSession);
  const stage =
    validSession &&
    tankTrialSession.active === true &&
    Number.isInteger(tankTrialSession.stage)
      ? TANK_TRIAL_STAGES[tankTrialSession.stage]
      : null;
  const trialActive =
    Boolean(stage) &&
    tankTrialSession.completed === false &&
    tankTrialSession.fragments === tankTrialSession.stage &&
    tankTrialSession.targetScore === stage.targetScore &&
    Number.isFinite(tankTrialSession.stageScore) &&
    tankTrialSession.stageScore >= 0;
  const ordinarySession = validSession && tankTrialSession.active === false;
  const hasSnapshot =
    typeof tankTrialSnapshot !== "undefined" && tankTrialSnapshot !== null;
  if (
    (hasSnapshot && !trialActive) ||
    (!hasSnapshot && !ordinarySession)
  ) {
    failActiveTankTrial("state");
    return "restored";
  }
  return trialActive ? "trial" : "normal";
}

function update(dt) {
  if (typeof modelLab !== "undefined" && modelLab) {
    if (game.mode !== "playing") return "inactive";
    game.time += dt;
    ensureTrainingDummy(game); game.waveQueue.length = 0;
    game.hazards.length = 0; game.pickups.length = 0;
    game.player.health = game.player.maxHealth;
    if (typeof turretReview !== "undefined" && turretReview && !trainingLab.autoFire.checked) {
      for (const structure of game.structures) {
        if (structure.kind === "turret") structure.aimAngle = turretReview.auto.checked ? game.time * 0.6 : turretReview.angle;
      }
    }
    if (typeof tankReview !== "undefined" && tankReview && !trainingLab.autoFire.checked) {
      for (const structure of game.structures) {
        if (structure.kind === "tank") structure.aimAngle = tankReview.auto.checked ? game.time * 0.6 : tankReview.angle;
      }
    }
    updatePlayer(dt); updateDelayedShots(dt); updateEnemies(dt);
    if (trainingLab.autoFire.checked) updateStructures(dt);
    updateShockwaves(dt); updateLightning(dt); updateDamageZones(dt); updateBullets(dt);
    updateSlowZones(dt); updateParticles(dt);
    game.noticeTimer = Math.max(0, game.noticeTimer - dt);
    return "model-lab";
  }
  const trialState = resolveTankTrialFrameState();
  if (trialState === "restored") return "restored";
  const trialActive = trialState === "trial";
  if (game.mode !== "playing") return "inactive";
  if (trialActive && isSurvivalOver(game)) {
    failActiveTankTrial("death");
    return "restored";
  }
  if (trialActive && game.player.weapon !== "pistol") {
    failActiveTankTrial("non-pistol");
    return "restored";
  }
  if (trialActive && game.structures.length > 0) {
    failActiveTankTrial("structure");
    return "restored";
  }
  game.time += dt;
  updatePlayer(dt);
  if (typeof updateDelayedShots === "function") updateDelayedShots(dt);
  if (typeof updateSlowZones === "function") updateSlowZones(dt);
  updateEnemies(dt);
  updateStructures(dt);
  updateShockwaves(dt);
  if (!trialActive) updateLightning(dt);
  if (typeof updateDamageZones === "function") updateDamageZones(dt);
  updateBullets(dt);
  updatePickups();
  updateHazards(dt);
  if (game.spikeTraps?.length > 0) updateSpikeTraps(dt);
  if (game.terrainTraps?.length > 0) updateTerrainTraps(dt);
  if (isSurvivalOver(game) && trialActive) {
    failActiveTankTrial("death");
    return "restored";
  }
  updateParticles(dt);
  const waveStatus = updateWave(dt);
  if (trialActive && waveStatus !== "active") return waveStatus;
  tickCombo(game, dt);
  game.noticeTimer = Math.max(0, game.noticeTimer - dt);
  game.player.health = clamp(game.player.health, 0, game.player.maxHealth);
  if (!trialActive) unlockWeaponsForProgress(game);

  if (isSurvivalOver(game)) {
    finishGame();
    return "finished";
  }
  return trialActive ? "active" : "normal";
}

function finishGame() {
  cancelWatermelonCharge();
  clearTankTrialResult();
  game.mode = "gameover";
  if (typeof scoreBoard !== "undefined" && !modelLab) scoreBoard.record(game, game.scoreboardAssisted || developerSession.enabled);
  rewardReturnFocus = null;
  rewardDialog.hidden = true;
  tankTrialSession = createTankTrialSession();
  tankTrialSnapshot = null;
  tankTrialReturnFocus = null;
  tankTrialDialog.hidden = true;
  tankTrialEntry.hidden = true;
  tankTrialStatus.hidden = true;
  ultimateStatus.hidden = false;
  developerToolbar.hidden = true;
  mouse.down = false;
  hud.hidden = true;
  gameOverPanel.hidden = false;
  const newRecord = game.score > records.highScore || game.wave > records.highWave;
  records.highScore = Math.max(records.highScore, game.score);
  records.highWave = Math.max(records.highWave, game.wave);
  saveRecords();
  document.querySelector("#resultTitle").textContent = "猎人倒在了尸潮之中";
  document.querySelector("#resultScore").textContent = pad(game.score);
  document.querySelector("#resultWave").textContent = String(game.wave);
  document.querySelector("#resultKills").textContent = String(game.kills);
  document.querySelector("#resultCombo").textContent = `×${game.highestCombo}`;
  if (newRecord) gameOverPanel.querySelector(".chapter").textContent = "新纪录";
}

function updateHud() {
  if (typeof modelLab !== "undefined" && modelLab) return;
  if (typeof openDeveloperReward !== "undefined" && openDeveloperReward) {
    openDeveloperReward.disabled = !canOpenDeveloperReward(developerRewardInput());
  }
  tankTrialEntry.hidden =
    game.mode !== "playing" ||
    game.rewardSession.active ||
    tankTrialSession.active ||
    !canOfferTankTrial(tankTrialOfferInput());
  tankTrialStatus.hidden = !tankTrialSession.active;
  ultimateStatus.hidden = tankTrialSession.active;
  if (tankTrialSession.active) {
    tankTrialStage.textContent =
      `坦克试炼 ${tankTrialSession.stage + 1}/${TANK_TRIAL_STAGES.length}`;
    tankTrialFragmentsText.textContent =
      `碎片 ${tankTrialSession.fragments}/${TANK_TRIAL_STAGES.length}`;
    tankTrialScore.textContent =
      `手枪积分 ${String(Math.floor(tankTrialSession.stageScore)).padStart(4, "0")} / ${tankTrialSession.targetScore}`;
    renderTankTrialFragments();
  }
  if (game.mode !== "playing" && game.mode !== "paused") return;
  const healthPercent = clamp(
    (game.player.health / game.player.maxHealth) * 100,
    0,
    100,
  );
  healthFill.style.width = `${healthPercent}%`;
  const capacity = shieldCapacity(game.player.maxHealth);
  const shield = clamp(game.player.shield ?? 0, 0, capacity);
  shieldMeter.hidden = shield <= 0;
  shieldFill.style.width = `${capacity > 0 ? (shield / capacity) * 100 : 0}%`;
  shieldMeter.setAttribute("aria-label", `护盾 ${Math.ceil(shield)} / ${Math.ceil(capacity)}`);
  healthText.textContent =
    `${Math.ceil(game.player.health)} / ${Math.ceil(game.player.maxHealth)}`;
  scoreText.textContent = pad(game.score);
  comboText.textContent = `连杀 ${game.combo} · 积分×${scoreMultiplierForCombo(game.combo)}`;
  comboText.style.opacity = game.combo > 1 ? String(0.62 + 0.38 * (game.comboTimer / 3.4)) : "0.72";
  waveText.textContent = `波次 ${String(game.wave).padStart(2, "0")}`;
  const burstUnlocked = isLightningBurstUnlocked(game.wave);
  ultimateStatus.dataset.locked = String(!burstUnlocked);
  ultimateTimerText.textContent = burstUnlocked
    ? `${Math.max(0, game.ultimateTimer).toFixed(1)} 秒`
    : `第${LIGHTNING_BURST_UNLOCK_WAVE}波解锁`;
  lightningCountText.textContent = burstUnlocked
    ? `雷电 ×${lightningRingCount(game.bossKills)}`
    : `蓄能 ×${lightningRingCount(game.bossKills)}`;
  const bosses = game.enemies.filter(enemy => enemy.kind === "boss" && enemy.health > 0);
  bossBar.hidden = bosses.length === 0;
  if (bosses.length) {
    const totalHealth = bosses.reduce((sum, boss) => sum + boss.health, 0);
    const totalMaxHealth = bosses.reduce((sum, boss) => sum + boss.maxHealth, 0);
    bossHealthFill.style.width = `${clamp(totalHealth / totalMaxHealth * 100, 0, 100)}%`;
    bossBar.title = bosses.map(boss => `${boss.bossName ?? "Boss"} ${Math.ceil(boss.health)}/${boss.maxHealth}`).join(" · ");
  }
  const dodgeReady = 1 - game.player.dodgeCooldown / DODGE.cooldown;
  dodgeIndicator.style.setProperty("--ready", clamp(dodgeReady, 0, 1));
  dodgeIndicator.classList.toggle("ready", game.player.dodgeCooldown <= 0);
  dodgeIndicator.setAttribute(
    "aria-label",
    game.player.dodgeCooldown <= 0
      ? "翻滚已就绪"
      : `翻滚冷却剩余 ${game.player.dodgeCooldown.toFixed(1)} 秒`,
  );
  renderWeaponBar();
}

function renderWeaponBar() {
  const infinite = developerSession.enabled && developerSession.infiniteAmmo;
  const trialActive =
    typeof tankTrialSession !== "undefined" && tankTrialSession.active;
  const markup = weapons
    .map((weapon, index) => {
      const unlocked = game.unlocked.includes(weapon.id);
      const active = game.player.weapon === weapon.id;
      const trialLocked = trialActive && weapon.id !== "pistol";
      let label;
      if (unlocked) {
        label = infinite ? "∞" : game.player.ammo[weapon.id];
      } else if (weapon.id === "tank") {
        label = trialActive
          ? `碎片 ${tankTrialSession.fragments}/${TANK_TRIAL_STAGES.length}`
          : "完成手枪试炼";
      } else {
        const scoreLabel = weapon.scoreRequired >= 10000
          ? `${weapon.scoreRequired / 10000}万`
          : String(weapon.scoreRequired);
        label = `${weapon.unlockWave}波 · ${scoreLabel}分`;
      }
      if (unlocked && weapon.maxDeployed) {
        const deployed = (game.structures ?? []).filter(s => s.kind === weapon.id && s.health > 0).length;
        label += ` · 部署 ${deployed}/${weapon.maxDeployed}`;
      }
      const keyLabel = index < 9 ? index + 1 : index === 9 ? "0" : "-";
      const disabled = !unlocked || trialLocked;
      return `<button type="button" data-weapon-index="${index}" class="weapon-slot ${unlocked ? "unlocked" : ""} ${active ? "active" : ""} ${trialLocked ? "trial-locked" : ""}" ${disabled ? "disabled" : ""}>
        ${keyLabel}<small>${unlocked ? `${weapon.name} ${label}` : label}</small>
      </button>`;
    })
    .join("");
  if (renderWeaponBar.lastMarkup !== markup || renderWeaponBar.lastTarget !== weaponBar) {
    weaponBar.innerHTML = markup;
    renderWeaponBar.lastMarkup = markup;
    renderWeaponBar.lastTarget = weaponBar;
  }
}

function drawReviewFloor(target, width, height) {
  if (modelLab && target.canvas?.style) {
    // The floor is static: keep it below the transparent animated canvas.
    // Percentage sizing preserves the same 512 logical-pixel brick repeat.
    if (!target.canvas.dataset.labFloor) {
      target.canvas.style.backgroundImage = `url("${ARENA_FLOOR_TEXTURE_SRC}")`;
      target.canvas.style.backgroundSize = `${512 / width * 100}% auto`;
      target.canvas.style.backgroundColor = "#777064";
      target.canvas.dataset.labFloor = "true";
    }
    target.clearRect(0, 0, width, height);
    return;
  }
  drawArenaFloor(target, arenaFloorTexture, width, height);
}

function drawBackground() {
  if (typeof modelLab !== "undefined" && modelLab) {
    drawReviewFloor(context, WIDTH, HEIGHT);
    context.fillStyle = "#d8d7cb"; context.font = "20px system-ui";
    context.fillText("模型检验场", 32, 40);
    context.font = "14px system-ui";
    context.fillText("WASD 移动 · 鼠标瞄准 / 射击 · 1–9 换枪 · 右侧检查关节与放大细节", 32, 68);
    return;
  }
  // The arena floor and vignette do not change: composite them below the
  // transparent scene instead of repainting a full-screen pattern each frame.
  if (context.canvas?.style) {
    if (!context.canvas.dataset.arenaFloor) {
      context.canvas.style.backgroundImage = `linear-gradient(to bottom, rgba(23,27,28,.34) 0 6.45%, transparent 6.45% 96.89%, rgba(23,27,28,.34) 96.89%), radial-gradient(ellipse at center, rgba(32,36,36,.04) 20%, rgba(20,24,25,.42) 100%), url("${ARENA_FLOOR_TEXTURE_SRC}")`;
      context.canvas.style.backgroundSize = `100% 100%, 100% 100%, ${512 / WIDTH * 100}% auto`;
      context.canvas.style.backgroundColor = "#777064";
      context.canvas.dataset.arenaFloor = "true";
    }
    context.clearRect(0, 0, WIDTH, HEIGHT);
    return;
  }
  drawArenaFloor(context, arenaFloorTexture, WIDTH, HEIGHT);
}

function drawObstacle(obstacle) {
  drawArenaObstacle(context, obstacle);
}

function drawStructure(structure) {
  context.save();
  context.translate(structure.x, structure.y);
  context.fillStyle = "rgba(0,0,0,.25)";
  context.beginPath();
  context.ellipse(3, 5, structure.radius, structure.radius * 0.46, 0, 0, TAU);
  context.fill();

  if (structure.kind === "turret") {
    drawAutomaticTurret(context, turretTexture, structure.aimAngle || 0);
  } else {
    drawTank(context, tankTexture, structure.aimAngle || 0, structure.bodyAngle ?? 0);
  }

  if (structure.health < structure.maxHealth) {
    context.fillStyle = "rgba(0,0,0,.65)";
    context.fillRect(-24, -44, 48, 4);
    context.fillStyle = "#a88b55";
    context.fillRect(-24, -44, 48 * (structure.health / structure.maxHealth), 4);
  }
  context.restore();
}

function resolveEnemyAction(enemy) {
  if (enemy.kind === "boss" && ["windup", "active", "recovery"].includes(enemy.bossCombat?.phase)) return "attack";
  if (enemy.hurtAnimation > 0) return "hurt";
  return resolveZombieAction(enemy);
}

function freezeSpriteFilter(enemy) {
  if (enemy.iceStatue) {
    return "brightness(1.35) saturate(0.55) sepia(0.8) hue-rotate(150deg)";
  }
  const amount = strongestSlow(
    game.time,
    (enemy.slowStatuses ?? []).filter((item) => item?.source === "freeze"),
  );
  const intensity = clamp(amount / (enemy.kind === "boss" ? 0.3 : 0.6), 0, 1);
  return intensity <= 0
    ? "none"
    : `brightness(${1 + intensity * 0.28}) ` +
        `saturate(${1 - intensity * 0.5}) ` +
        `sepia(${intensity * 0.75}) ` +
        `hue-rotate(${intensity * 150}deg)`;
}

function drawEnemySprite(entity, action = resolveEnemyAction(entity)) {
  const baseKind = entity.bossArchetype ?? entity.kind;
  const originalVisual = resolveEnemyVisual(baseKind);
  const size = entity.bossScale ?? 1;
  const visual = size === 1 ? originalVisual : { ...originalVisual,
    drawWidth: originalVisual.drawWidth * size, drawHeight: originalVisual.drawHeight * size,
    anchorX: originalVisual.anchorX * size, anchorY: originalVisual.anchorY * size };
  const atlas = enemyAtlases.get(baseKind);
  if (!atlas) throw new Error(`敌人图集未加载：${entity.kind}`);
  const rect = resolveZombieSourceRect(
    action,
    action === "death" ? entity.elapsed : entity.kind === "boss" && typeof bossAnimationTime === "function"
      ? bossAnimationTime(entity) : entity.animationTime,
    action === "walk" && !entity.bossLocomotion ? entity.animationPhase : 0,
  );
  context.save();
  context.translate(entity.x, entity.y);
  context.fillStyle = "rgba(0,0,0,.26)";
  context.beginPath();
  context.ellipse(
    0,
    Math.max(4, visual.drawHeight - visual.anchorY - 7),
    Math.max(20, visual.drawWidth * 0.33),
    Math.max(12, visual.drawHeight * 0.19),
    0,
    0,
    TAU,
  );
  context.fill();
  let spritePose = null, spriteFacing = 1;
  if (entity.kind === "boss" && entity.bossCombat && typeof bossAttackPose === "function") {
    const pose = bossAttackPose(entity);
    const state = entity.bossCombat;
    const facing = state.phase === "idle" || (state.phase === "recovery" && bossSpriteLayers(entity).every(layer => layer.action === "walk"))
      ? (entity.bossFacing ?? (Math.cos(state.angle ?? 0) < 0 ? -1 : 1))
      : (Math.cos(state.angle ?? 0) < 0 ? -1 : 1);
    spritePose = pose; spriteFacing = facing;
    context.translate(0, pose.lift); context.rotate(pose.lean); context.scale(pose.scaleX * facing, pose.scaleY);
  }
  context.filter = entity.flameHitFlash > 0
    ? "sepia(1) saturate(7) hue-rotate(-45deg)"
    : entity.hitFlash > 0 ? "brightness(1.75) saturate(.7)" : freezeSpriteFilter(entity);
  const recoveryLayers = entity.kind === "boss" && action === "attack" &&
    entity.bossCombat && typeof bossSpriteLayers === "function"
    ? bossSpriteLayers(entity) : null;
  const spriteLayers = recoveryLayers ?? [{ action, rect, alpha: 1 }];
  const groundOffset = sourceRect => spritePose
    ? bossSpriteGroundOffset(baseKind, sourceRect, visual, spritePose, spriteFacing) : 0;
  if (spriteLayers.length === 2) {
    // Add premultiplied weighted pixels on a transparent scratch surface. Drawing
    // two source-over layers directly would darken their overlap during animation transitions.
    const surface = drawEnemySprite.recoverySurface ??= (() => {
      const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(256, 256)
        : document.createElement("canvas");
      canvas.width = 256; canvas.height = 256;
      return { canvas, ctx: canvas.getContext("2d") };
    })();
    surface.ctx.clearRect(0, 0, 256, 256);
    surface.ctx.globalCompositeOperation = "lighter";
    for (const layer of spriteLayers) {
      const sourceRect = resolveZombieSourceRect(layer.action, layer.time);
      surface.ctx.globalAlpha = layer.alpha;
      surface.ctx.drawImage(atlas, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, 64, 64 + groundOffset(sourceRect), 128, 128);
    }
    surface.ctx.globalAlpha = 1;
    surface.ctx.globalCompositeOperation = "source-over";
    context.drawImage(surface.canvas, 0, 0, 256, 256, -visual.anchorX - visual.drawWidth / 2,
      -visual.anchorY - visual.drawHeight / 2, visual.drawWidth * 2, visual.drawHeight * 2);
  } else {
    const layer = spriteLayers[0];
    const sourceRect = layer.rect ?? resolveZombieSourceRect(layer.action, layer.time);
    if (spritePose) context.translate(0, groundOffset(sourceRect) * visual.drawHeight / 128);
    context.drawImage(atlas, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
      -visual.anchorX, -visual.anchorY, visual.drawWidth, visual.drawHeight);
  }
  context.restore();
}

function drawEnemyDeathSprite(death) {
  if (death.elapsed < death.attackLead) {
    drawEnemySprite({ ...death, animationTime: death.elapsed }, "attack");
    return;
  }
  drawEnemySprite({ ...death, elapsed: death.elapsed - death.attackLead }, "death");
}

function drawIceStatue(statue) {
  const alpha = clamp(statue.life / statue.maxLife, 0, 1);
  drawEnemySprite({ ...statue, iceStatue: true }, statue.action);
  context.save();
  context.translate(statue.x, statue.y);
  context.globalAlpha = alpha * 0.62;
  context.fillStyle = "rgba(185,239,255,.38)";
  context.strokeStyle = "rgba(223,248,255,.82)";
  context.lineWidth = 1.5;
  const radius = Math.max(16, statue.radius ?? 18);
  const facets = [
    [[-radius, 2], [-radius * 0.35, -radius * 1.5], [0, radius * 0.7]],
    [[-radius * 0.35, -radius * 1.5], [radius * 0.75, -radius], [0, radius * 0.7]],
    [[radius * 0.75, -radius], [radius, radius * 0.35], [0, radius * 0.7]],
    [[-radius, 2], [0, radius * 0.7], [-radius * 0.45, radius * 1.15]],
  ];
  for (const facet of facets) {
    context.beginPath();
    context.moveTo(facet[0][0], facet[0][1]);
    context.lineTo(facet[1][0], facet[1][1]);
    context.lineTo(facet[2][0], facet[2][1]);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.restore();
}

function drawEnemyFrost(enemy) {
  const frostStatuses = (enemy.slowStatuses ?? []).filter(
    (status) => status?.source !== "lightning",
  );
  const slowAmount = strongestSlow(game.time, frostStatuses);
  const frozen = Number.isFinite(enemy.frozenUntil) && enemy.frozenUntil > game.time;
  if (slowAmount <= 0 && !frozen) return;
  context.save();
  context.globalAlpha = frozen ? 0.95 : slowAmount;
  context.strokeStyle = "#8bdcff";
  context.fillStyle = "#dff8ff";
  context.lineWidth = frozen ? 6 : 3;
  context.shadowBlur = frozen ? 22 : 12;
  context.shadowColor = "#8bdcff";
  if (frozen) {
    context.beginPath();
    context.arc(enemy.x, enemy.y, enemy.radius + 5, 0, TAU);
    context.stroke();
  }
  context.beginPath();
  context.arc(enemy.x, enemy.y, enemy.radius + (frozen ? 11 : 7), 0, TAU);
  context.stroke();
  for (let index = 0; index < 6; index += 1) {
    const angle = index * TAU / 6;
    context.beginPath();
    context.arc(
      enemy.x + Math.cos(angle) * (enemy.radius + 7),
      enemy.y + Math.sin(angle) * (enemy.radius + 7),
      frozen ? 4 : 2.5,
      0,
      TAU,
    );
    context.fill();
  }
  context.restore();
}

function drawEnemyParalysis(enemy) {
  const status = (enemy.slowStatuses ?? []).find(
    (candidate) =>
      candidate?.source === "lightning" && candidate.expiresAt > game.time,
  );
  if (!status) return;
  context.save();
  context.globalAlpha = Math.max(0.35, Math.min(1, (status.expiresAt - game.time) / 0.5));
  context.strokeStyle = "#ffd84a";
  context.fillStyle = "#fff2a8";
  context.lineWidth = 3;
  context.shadowBlur = 18;
  context.shadowColor = "#ffd84a";
  context.beginPath();
  context.arc(enemy.x, enemy.y, enemy.radius + 9, 0, TAU);
  context.stroke();
  for (let index = 0; index < 4; index += 1) {
    const angle = index * TAU / 4 + game.time * 8;
    const inner = enemy.radius + 4;
    const outer = enemy.radius + 15;
    context.beginPath();
    context.moveTo(
      enemy.x + Math.cos(angle) * inner,
      enemy.y + Math.sin(angle) * inner,
    );
    context.lineTo(
      enemy.x + Math.cos(angle + 0.18) * (inner + 6),
      enemy.y + Math.sin(angle + 0.18) * (inner + 6),
    );
    context.lineTo(
      enemy.x + Math.cos(angle) * outer,
      enemy.y + Math.sin(angle) * outer,
    );
    context.stroke();
  }
  context.restore();
}

function spawnRareButterfly(color, x = game.player.x + 140, y = game.player.y - 90) {
  if (!color || (typeof tankTrialSession !== "undefined" && tankTrialSession.active)) return;
  if (game.enemies.some(enemy => enemy.isRareButterfly && enemy.health > 0 && enemy.butterflyColor === color)) return;
  game.enemies.push(createRareButterfly(game.nextId++, color, clamp(x, 140, WIDTH - 140), clamp(y, 140, HEIGHT - 100), game.time));
}

function drawRareButterfly(enemy) {
  const blue = enemy.butterflyColor === "blue", color = blue ? "#62caff" : "#ffe066";
  const phase = game.time * 16 + enemy.id, flap = 0.35 + Math.abs(Math.sin(phase)) * 0.65;
  context.save(); context.translate(enemy.x, enemy.y);
  context.rotate(Math.sin(game.time * 2 + enemy.id) * 0.18);
  context.shadowColor = color; context.shadowBlur = 12;
  for (const side of [-1, 1]) {
    context.save(); context.scale(side * flap, 1);
    context.fillStyle = blue ? "#258fea" : "#e5a929";
    context.beginPath(); context.ellipse(11, -6, 12, 16, -0.55, 0, TAU); context.fill();
    context.fillStyle = color; context.beginPath(); context.ellipse(9, 9, 9, 11, 0.5, 0, TAU); context.fill();
    context.strokeStyle = "#fff7d6"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(2, 0); context.lineTo(16, -13); context.moveTo(2, 1); context.lineTo(12, 14); context.stroke();
    context.restore();
  }
  context.shadowBlur = 0; context.fillStyle = "#f9f4d9";
  context.beginPath(); context.ellipse(0, 1, 2.2, 12, 0, 0, TAU); context.fill();
  context.strokeStyle = color; context.beginPath(); context.moveTo(0, -8); context.lineTo(-5, -17); context.moveTo(0, -8); context.lineTo(5, -17); context.stroke();
  for (let i = 0; i < 4; i++) {
    context.globalAlpha = 0.25 + 0.15 * Math.sin(phase + i);
    context.fillStyle = color; context.beginPath(); context.arc(Math.sin(phase * 0.15 + i * 2) * 28, 20 + i * 7, 1.8, 0, TAU); context.fill();
  }
  context.restore();
}

function drawButterflyBuffs() {
  const buffs = [[game.player.butterflyDamageUntil, "#62caff", "蓝蝶 · 伤害 ×2"], [game.player.butterflySpeedUntil, "#ffe066", "金蝶 · 移速 +50%"]];
  context.save(); context.font = "bold 15px system-ui"; context.textAlign = "center";
  let row = 0;
  for (const [until, color, text] of buffs) {
    const remaining = Math.max(0, (until ?? 0) - game.time); if (!remaining) continue;
    const x = WIDTH / 2, y = 45 + row++ * 34;
    context.fillStyle = "#111b29dd"; context.fillRect(x - 130, y - 20, 260, 30);
    context.fillStyle = color; context.fillText(`${text}  ${remaining.toFixed(1)}s`, x, y);
    context.fillRect(x - 130, y + 7, 260 * remaining / 10, 2);
  }
  context.restore();
}

function drawEnemyVines(enemy) {
  if (!(enemy.entangledUntil > game.time)) return;
  const remaining = clamp((enemy.entangledUntil - game.time) / VINE_BIND_SECONDS, 0, 1);
  const growth = clamp((game.time - (enemy.entangledStartedAt ?? game.time - 0.45)) / 0.45, 0, 1);
  const r = enemy.radius;
  const baseY = enemy.y + r * 0.65;
  const sway = Math.sin(game.time * 4 + enemy.id) * 1.5;
  context.save();
  context.globalAlpha = 0.64 + remaining * 0.3;

  // The climbing strands hug the silhouette, leaving the zombie visible.
  for (const side of [-1, 1]) {
    const startX = enemy.x + side * (r + 7);
    const endY = baseY - growth * r * 2.15;
    const endX = enemy.x + side * (r * 0.55 + sway);
    context.strokeStyle = "#21462c";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(startX, baseY);
    context.bezierCurveTo(startX + side * 5, baseY - growth * r * 0.55,
      enemy.x + side * (r + 4), endY + r * 0.45, endX, endY);
    context.stroke();
    context.strokeStyle = "#a8d977";
    context.lineWidth = 2;
    context.stroke();
    if (growth > 0.35) {
      for (let leaf = 0; leaf < 2; leaf += 1) {
        const y = baseY - growth * r * (0.7 + leaf * 0.65);
        const x = enemy.x + side * (r + 2);
        context.fillStyle = leaf ? "#8fc365" : "#b4df84";
        context.beginPath();
        context.ellipse(x, y, 6, 3, side * 0.55, 0, TAU);
        context.fill();
      }
    }
  }

  // Two light diagonal ties make the immobilization legible without a solid halo.
  if (growth > 0.3) {
    context.strokeStyle = "#badf83";
    context.lineWidth = 2.2;
    for (let level = 0; level < 2; level += 1) {
      const y = baseY - growth * r * (0.65 + level * 0.72);
      context.beginPath();
      context.moveTo(enemy.x - r * 0.72, y + 4);
      context.quadraticCurveTo(enemy.x, y - 4, enemy.x + r * 0.72, y + 2);
      context.stroke();
    }
  }

  // Five leaves above the head replace the large ring as a duration cue.
  context.globalAlpha = 0.92;
  for (let index = 0; index < 5; index += 1) {
    const x = enemy.x + (index - 2) * 7;
    const y = enemy.y - r * 2.35;
    context.fillStyle = remaining * 5 > index ? "#d5ee9d" : "#516a4d";
    context.beginPath();
    context.ellipse(x, y, 3, 2, -0.35, 0, TAU);
    context.fill();
  }
  context.restore();
}

function drawEnemy(enemy) {
  if (enemy.isRareButterfly) { drawRareButterfly(enemy); return; }
  if (enemy.isTrainingDummy) {
    drawTrainingDummy(context, trainingDummyTexture, enemy, game.time);
    return;
  }
  drawEnemySprite(enemy);
  drawEnemyFrost(enemy);
  drawEnemyParalysis(enemy);
  drawEnemyVines(enemy);
}

function drawPlayerSprite(player, x, y, alpha = 1, rolling = false, drawingContext = context, scaleOverride = null) {
  const context = drawingContext;
  context.save();
  context.translate(x, y);
  if (adultReview?.mode === "upright" && adultReview.enabled.checked && adultReview.atlas) {
    const uprightVisual = resolveWeaponVisual(player.weapon);
    const uprightWeapon = weaponSprites.get(player.weapon);
    const ratios = weaponVisualRatios(player, player.weapon);
    context.globalAlpha = alpha * (player.hitFlash > 0 && Math.floor(game.time * 30) % 2 ? 0.35 : 1);
    // The character identity must not depend on having a handheld weapon sprite.
    drawUprightReviewPlayer(context, adultReview.atlas, uprightWeapon,
      uprightWeapon?.naturalWidth ? uprightVisual : null, {
        ...uprightReviewOptions(player, ratios.recoil), feedbackRatio: ratios.feedback, rolling,
        ...(scaleOverride === null ? {} : { scale: scaleOverride }),
      }, adultReview);
    context.restore();
    return;
  }
  const progress = 1 - player.dodgeDuration / DODGE.duration;
  const rollPose = getStableRollPose(progress);
  const baseAngle = rolling
    ? Math.atan2(player.dodgeY, player.dodgeX)
    : Math.atan2(player.aimY, player.aimX);
  context.rotate(baseAngle);
  if (rolling) {
    context.rotate(rollPose.tilt * Math.sign(player.dodgeX || 1));
  }
  context.scale(rollPose.scale, rollPose.scale);
  context.globalAlpha =
    alpha * (player.hitFlash > 0 && Math.floor(game.time * 30) % 2 ? 0.35 : 1);
  const visual = resolveWeaponVisual(player.weapon);
  const weaponSprite = weaponSprites.get(player.weapon);
  const handProfile = resolvePlayerWeaponHandProfile(player.weapon);
  const activeRigImages = resolvePlayerRigImages(playerRigSprites, player.weapon);
  if (adultReview?.enabled.checked && adultReview.body && visual && weaponSprite?.naturalWidth) {
    const ratios = weaponVisualRatios(player, player.weapon);
    const maximumCharge = player.weapon === "watermelon" ? watermelonStats().chargeTime : 2;
    drawAdultReviewPlayer(context, activeRigImages, weaponSprite, visual, handProfile, {
      recoilRatio: ratios.recoil,
      feedbackRatio: ratios.feedback,
      chargeRatio: ["watermelon", "lightning"].includes(player.chargeWeapon) ? clamp(player.chargeTime / maximumCharge, 0, 1) : 0,
      time: game.time,
    }, adultReview);
    context.restore();
    return;
  }
  let pose = null;
  drawPlayerBody(context, activeRigImages);
  if (visual && weaponSprite?.complete && weaponSprite.naturalWidth) {
    const ratios = weaponVisualRatios(player, player.weapon);
    const visualRecoil = ratios.recoil * PLAYER_RIG_VISUAL.recoilScale;
    const maximumCharge =
      player.weapon === "watermelon" && typeof watermelonStats === "function"
        ? watermelonStats().chargeTime
        : 2;
    const chargeRatio =
      ["watermelon", "lightning"].includes(player.chargeWeapon)
        ? clamp(player.chargeTime / maximumCharge, 0, 1)
        : 0;
    const grips = resolveWeaponGripPoints(visual, visualRecoil);
    pose = resolvePlayerArmPose(grips, { chargeRatio });
    if (pose) {
      drawPlayerArm(context, activeRigImages, pose.far, "far", handProfile);
    }
    drawWeaponModel(context, weaponSprite, visual, {
      recoilRatio: visualRecoil,
      feedbackRatio: ratios.feedback,
      chargeRatio,
      time: game.time,
    });
    if (pose) {
      drawPlayerArm(context, activeRigImages, pose.near, "near", handProfile);
    }
  }
  context.restore();
}

function drawWatermelonCharge() {
  const player = game.player;
  if (player.chargeWeapon !== "watermelon") return;
  const maximum =
    typeof watermelonStats === "function" ? watermelonStats().chargeTime : 1.5;
  const ratio = clamp(player.chargeTime / maximum, 0, 1);
  const x = player.x - 32;
  const y = player.y - 54;
  const full = ratio >= 1;
  context.save();
  context.fillStyle = "#202728";
  context.fillRect(x, y, 64, 9);
  context.strokeStyle = "#aeb7b5";
  context.lineWidth = 2;
  context.strokeRect(x, y, 64, 9);
  context.fillStyle = full
    ? Math.floor(game.time * 12) % 2 === 0 ? "#d62f2f" : "#ff5a4f"
    : "#77bd55";
  context.fillRect(x + 2, y + 2, 60 * ratio, 5);
  const markerX = x + 2 + 60 * clamp(0.3 / maximum, 0, 1);
  context.strokeStyle = "#f2e6c9";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(markerX, y + 1);
  context.lineTo(markerX, y + 8);
  context.stroke();
  context.restore();
}

function drawPlayer() {
  const player = game.player;
  const rolling = player.dodgeDuration > 0;
  const rollProgress = rolling ? 1 - player.dodgeDuration / DODGE.duration : 0;
  const shadowStretch = rolling ? Math.sin(rollProgress * Math.PI) * 4 : 0;
  context.save();
  context.fillStyle = adultReview?.mode === "upright" && adultReview.enabled.checked ? "transparent" : "rgba(0,0,0,.38)";
  context.beginPath();
  context.ellipse(
    player.x,
    player.y + 3,
    20 + shadowStretch,
    7,
    Math.atan2(player.dodgeY, player.dodgeX),
    0,
    TAU,
  );
  context.fill();
  context.restore();

  drawPlayerSprite(player, player.x, player.y, 1, rolling);
  drawWatermelonCharge();

  if (player.reload > 0) {
    context.strokeStyle = "#d4ba7e";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(player.x, player.y - 38, 13, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - player.reload / 1.25));
    context.stroke();
  }
}

function drawArrowRainAimIndicator() {
  const player = game.player;
  if (player.weapon !== "lightning" || game.mode !== "playing" || player.dodgeDuration > 0) return;
  const seconds = player.chargeWeapon === "lightning" ? player.chargeTime : 0;
  const layout = arrowRainLayout(seconds);
  const muzzle = adultShotOrigin() ?? {
    x: player.x + player.aimX * 28,
    y: player.y + player.aimY * 18,
  };
  // Use the actual constrained landing centre, including arena-edge adjustments.
  const dx = layout.center.x - muzzle.x, dy = layout.center.y - muzzle.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 6) return;
  const gap = Math.min(22, distance * 0.3);
  const scale = Math.min(1, (distance - gap - 2) / 38);
  context.save();
  context.translate(muzzle.x + dx / distance * gap, muzzle.y + dy / distance * gap);
  context.rotate(Math.atan2(dy, dx));
  context.scale(scale, scale);
  context.globalAlpha = player.cooldown > 0 ? 0.55 : 0.78 + layout.ratio * 0.22;
  context.lineJoin = "miter";
  context.beginPath();
  context.moveTo(0, -3); context.lineTo(19, -3); context.lineTo(15, -10);
  context.lineTo(38, 0); context.lineTo(15, 10); context.lineTo(19, 3);
  context.lineTo(0, 3); context.lineTo(5, 0); context.closePath();
  context.fillStyle = "rgba(43,35,27,0.8)";
  context.fill();
  context.strokeStyle = "#655036";
  context.lineWidth = 5;
  context.stroke();
  context.strokeStyle = layout.ratio >= 1 ? "#fff49a" : "#ffe24a";
  context.lineWidth = 1.8;
  context.stroke();
  // A restrained electric inlay matches the weapon without a radial muzzle glow.
  context.strokeStyle = layout.ratio >= 1 ? "#fff6ad" : "#ffdc55";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(8, 0); context.lineTo(17, 0); context.lineTo(21, -2);
  context.lineTo(25, 0); context.lineTo(31, 0);
  context.stroke();
  context.restore();
}

function drawArrowRains() {
  context.save();
  for (const rain of game.arrowRains ?? []) {
    for (const arrow of rain.arrows) {
      if (rain.age < arrow.delay || rain.age >= arrow.impactAt + 0.38) continue;
      const progress = clamp((rain.age - arrow.delay) / arrow.fallTime, 0, 1);
      const landed = progress >= 1;
      const fade = landed ? clamp(1 - (rain.age - arrow.impactAt) / 0.38, 0, 1) : Math.min(1, progress * 8);
      const height = (1 - progress * progress) * (320 + rain.layout.ratio * 100);
      const tipX = arrow.x + height * 0.2, tipY = arrow.y - height;
      context.globalAlpha = fade;
      context.save();
      context.translate(tipX, tipY);
      context.rotate(Math.atan2(1, -0.2));
      // Short bright arrow with a translucent longer trail, never a lightning branch.
      context.strokeStyle = "rgba(255,205,48,0.28)";
      context.lineWidth = 5;
      context.beginPath(); context.moveTo(-10, 0); context.lineTo(landed ? -32 : -102, 0); context.stroke();
      context.strokeStyle = "#ffdf55";
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(-5, 0); context.lineTo(-44, 0); context.stroke();
      context.fillStyle = "#fff18a";
      context.beginPath(); context.moveTo(3, 0); context.lineTo(-12, -5); context.lineTo(-8, 0); context.lineTo(-12, 5); context.closePath(); context.fill();
      context.fillStyle = "#ffd23f";
      context.beginPath(); context.moveTo(-32, 0); context.lineTo(-43, -7); context.lineTo(-48, -7); context.lineTo(-42, 0);
      context.lineTo(-48, 7); context.lineTo(-43, 7); context.closePath(); context.fill();
      context.restore();
      if (landed) {
        const radius = 5 + (1 - fade) * (rain.traits.terminalBlast ? 65 : 18);
        context.strokeStyle = "#ffdb55"; context.lineWidth = 1.5;
        context.beginPath(); context.ellipse(arrow.x, arrow.y, radius, radius * 0.45, 0, 0, TAU); context.stroke();
      }
    }
  }
  const player = game.player;
  if (player.weapon === "lightning" && game.mode === "playing" && player.cooldown <= 0) {
    const charging = player.chargeWeapon === "lightning";
    const layout = arrowRainLayout(charging ? player.chargeTime : 0);
    const x = clamp(player.x, 120, WIDTH - 120), y = clamp(player.y + 38, 34, HEIGHT - 45);
    context.globalAlpha = 0.95;
    context.fillStyle = "#172137"; context.fillRect(x - 80, y, 160, 7);
    context.fillStyle = layout.ratio >= 1 ? "#fff18a" : "#ffd84a";
    context.fillRect(x - 80, y, 160 * layout.ratio, 7);

  }
  context.restore();
}

function drawLightningArc(arc) {
  const alpha = clamp(arc.life / arc.maxLife, 0, 1);
  const { points, branches } = buildLightningArcGeometry(arc);
  const strokePath = (path, color, width) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(path[0].x, path[0].y);
    for (const point of path.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  };

  context.save();
  context.globalAlpha = alpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 10;
  context.shadowColor = "#e6efff";
  strokePath(points, "#e6efff", 11);
  context.shadowBlur = 6;
  strokePath(points, "#ffffff", 5.5);
  context.shadowBlur = 8;
  for (const branch of branches) strokePath(branch, "#ffffff", 2.5);

  context.fillStyle = "#ffffff";
  for (const { x, y } of [points[0], points.at(-1)]) {
    context.beginPath();
    context.arc(x, y, 3, 0, TAU);
    context.fill();
  }
  // Age-derived motes follow the actual jagged path, without persistent queues.
  const age = 1 - alpha;
  context.shadowBlur = 0;
  for (let i = 1; i < points.length; i += 2) {
    const point = points[i], direction = i * 2.399963;
    const travel = age * (16 + i % 5 * 5);
    const x = point.x + Math.cos(direction) * travel, y = point.y + Math.sin(direction) * travel;
    const size = 1 + alpha * 2;
    context.fillRect(x - size / 2, y - size / 2, size, size);
  }
  context.restore();
}

function drawLightningHitEffect(effect) {
  const target = (game.enemies ?? []).find(
    (enemy) => enemy.id === effect.targetId && enemy.health > 0,
  );
  const x = target?.x ?? effect.x;
  const y = target?.y ?? effect.y;
  const radius = target?.radius ?? effect.radius ?? 16;
  const alpha = clamp(effect.life / effect.maxLife, 0, 1);
  const flashAlpha = clamp((effect.life - 0.08) / 0.1, 0, 1);
  const seed = Number.isFinite(effect.seed) ? effect.seed : x * 0.73 + y * 0.37;
  const noise = (index) => Math.sin(seed * 0.017 + index * 12.9898);

  context.save();
  context.globalAlpha = flashAlpha;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 12;
  context.shadowColor = "#e6efff";

  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.8;
  context.beginPath();
  context.arc(x, y, radius + 5 + (1 - alpha) * 8, 0, TAU);
  context.stroke();

  context.strokeStyle = "#e6efff";
  context.lineWidth = 1.3;
  for (let index = 0; index < 6; index += 1) {
    const angle = index * TAU / 6 + noise(index) * 0.22;
    const inner = radius + 2;
    const middle = inner + 5 + Math.abs(noise(index + 10)) * 4;
    const outer = inner + 12 + Math.abs(noise(index + 20)) * 8;
    const bend = angle + noise(index + 30) * 0.18;
    context.beginPath();
    context.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    context.lineTo(x + Math.cos(bend) * middle, y + Math.sin(bend) * middle);
    context.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    context.stroke();
  }

  context.globalAlpha = alpha;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1.5;
  for (let index = 0; index < 3; index += 1) {
    const startAngle = index * TAU / 3 + noise(index + 40) * 0.45;
    const middleAngle = startAngle + noise(index + 50) * 0.35;
    const endAngle = middleAngle + noise(index + 60) * 0.35;
    context.beginPath();
    context.moveTo(
      x + Math.cos(startAngle) * radius * 0.55,
      y + Math.sin(startAngle) * radius * 0.55,
    );
    context.lineTo(
      x + Math.cos(middleAngle) * radius * 0.95,
      y + Math.sin(middleAngle) * radius * 0.95,
    );
    context.lineTo(
      x + Math.cos(endAngle) * radius * 0.68,
      y + Math.sin(endAngle) * radius * 0.68,
    );
    context.stroke();
  }
  context.restore();
}

function drawFreezeProjectile(bullet) {
  const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
  const trailLength = bullet.radius * 2;
  const tailX = bullet.x - bullet.vx / speed * trailLength;
  const tailY = bullet.y - bullet.vy / speed * trailLength;
  context.save();
  context.shadowBlur = bullet.radius * 1.5;
  context.shadowColor = "#8bdcff";
  context.strokeStyle = "#8bdcff";
  context.lineWidth = Math.max(3, bullet.radius * 0.75);
  context.beginPath();
  context.moveTo(tailX, tailY);
  context.lineTo(bullet.x, bullet.y);
  context.stroke();
  context.fillStyle = "#dff8ff";
  context.beginPath();
  context.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(1.5, bullet.radius / 3);
  context.beginPath();
  context.arc(
    bullet.x - bullet.radius / 3,
    bullet.y - bullet.radius / 3,
    bullet.radius * 0.55,
    0,
    TAU,
  );
  context.stroke();
  context.restore();
}

function drawFallbackWatermelon(radius) {
  context.shadowBlur = 12;
  context.shadowColor = "#77bd55";
  context.fillStyle = "#4c9b42";
  context.strokeStyle = "#b7d95b";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, 0, radius, radius * 0.78, 0, 0, TAU);
  context.fill();
  context.stroke();
  context.strokeStyle = "#77bd55";
  context.lineWidth = 2;
  for (const offset of [-0.45, 0, 0.45]) {
    context.beginPath();
    context.ellipse(
      0,
      0,
      radius * (1 - Math.abs(offset) * 0.18),
      radius * 0.78,
      0,
      offset,
      TAU + offset,
    );
    context.stroke();
  }
}

function drawWatermelonProjectile(bullet) {
  const angle = Math.atan2(bullet.vy, bullet.vx) + (bullet.spin ?? 0);
  context.save();
  context.translate(bullet.x, bullet.y);
  context.rotate(angle);
  if (watermelonProjectileSprite.complete && watermelonProjectileSprite.naturalWidth) {
    context.drawImage(
      watermelonProjectileSprite,
      -bullet.radius * 1.2,
      -bullet.radius,
      bullet.radius * 2.4,
      bullet.radius * 2,
    );
  } else {
    drawFallbackWatermelon(bullet.radius);
  }
  context.restore();
}

function drawWatermelonSlice(bullet) {
  context.save();
  context.translate(bullet.x, bullet.y);
  context.rotate(Number.isFinite(bullet.spin) ? bullet.spin : 0);

  context.fillStyle = "#d94a45";
  context.beginPath();
  context.moveTo(-6, -4.5);
  context.lineTo(6, 0);
  context.lineTo(-6, 4.5);
  context.closePath();
  context.fill();

  context.strokeStyle = "#4c9b42";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(-6, -4.5);
  context.lineTo(-6, 4.5);
  context.stroke();

  context.fillStyle = "#263126";
  for (const y of [-1.7, 1.7]) {
    context.beginPath();
    context.ellipse(-0.5, y, 1.1, 0.55, 0, 0, TAU);
    context.fill();
  }
  context.restore();
}

function drawWatermelonSeed(bullet) {
  context.save();
  context.translate(bullet.x, bullet.y);
  context.rotate(Math.atan2(bullet.vy, bullet.vx));
  context.fillStyle = "#263126";
  context.strokeStyle = "#d94a45";
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(0, 0, bullet.radius * 1.8, bullet.radius * 0.8, 0, 0, TAU);
  context.fill();
  context.stroke();
  context.restore();
}

function drawShotgunPellet(bullet) {
  context.save();
  context.translate(bullet.x, bullet.y);
  context.rotate(Math.atan2(bullet.vy, bullet.vx));
  context.fillStyle = bullet.color;
  context.beginPath();
  context.arc(0, 0, 3, 0, TAU);
  context.fill();
  context.fillStyle = "#fff2bd";
  context.beginPath();
  context.arc(0.75, -0.75, 0.55, 0, TAU);
  context.fill();
  context.restore();
}

function drawBullet(bullet) {
  if (bullet.kind === "freeze") {
    drawFreezeProjectile(bullet);
    return;
  }
  if (bullet.kind === "watermelon") {
    drawWatermelonProjectile(bullet);
    return;
  }
  if (bullet.kind === "watermelon-slice") {
    drawWatermelonSlice(bullet);
    return;
  }
  if (bullet.kind === "watermelon-seed") {
    drawWatermelonSeed(bullet);
    return;
  }
  if (bullet.source === "shotgun") {
    drawShotgunPellet(bullet);
    return;
  }
  context.save();
  context.strokeStyle = bullet.color;
  context.fillStyle = bullet.color;
  if (bullet.kind === "rocket") {
    context.beginPath();
    context.arc(bullet.x, bullet.y, 7, 0, TAU);
    context.fill();
    context.strokeStyle = "rgba(255,193,92,.65)";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(bullet.x, bullet.y);
    context.lineTo(bullet.x - bullet.vx * 0.035, bullet.y - bullet.vy * 0.035);
    context.stroke();
  } else if (bullet.owner === "tank") {
    context.beginPath();
    context.arc(bullet.x, bullet.y, 6, 0, TAU);
    context.fill();
    context.strokeStyle = "rgba(230,196,123,.3)";
    context.beginPath();
    context.arc(bullet.x, bullet.y, bullet.blastRadius, 0, TAU);
    context.stroke();
  } else {
    context.lineWidth = bullet.radius * 1.2;
    if (bullet.kind === "ricochet") context.shadowBlur = 14;
    if (bullet.kind === "ricochet") context.shadowColor = bullet.color;
    context.beginPath();
    context.moveTo(bullet.x, bullet.y);
    context.lineTo(bullet.x - bullet.vx * 0.018, bullet.y - bullet.vy * 0.018);
    context.stroke();
  }
  context.restore();
}

function drawParticle(particle) {
  context.save();
  context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
  if (["watermelon-rind", "watermelon-flesh"].includes(particle.type)) {
    context.translate(particle.x, particle.y);
    context.rotate((particle.angle ?? 0) + (particle.spin ?? 0));
    context.fillStyle = particle.type === "watermelon-rind" ? "#4c9b42" : "#d94a45";
    context.beginPath();
    context.moveTo(particle.size, 0);
    context.lineTo(-particle.size * 0.65, particle.size * 0.58);
    context.lineTo(-particle.size * 0.45, -particle.size * 0.58);
    context.closePath();
    context.fill();
    context.restore();
    return;
  }
  context.fillStyle = particle.color;
  context.beginPath();
  context.arc(particle.x, particle.y, particle.size * (0.5 + particle.life / particle.maxLife), 0, TAU);
  context.fill();
  context.restore();
}

function drawHealthPack(pickup) {
  context.save();
  context.translate(pickup.x, pickup.y);
  const pulse = 1 + Math.sin(game.time * 4 + pickup.id) * 0.06;
  context.scale(pulse, pulse);
  context.fillStyle = "rgba(104, 208, 135, 0.16)";
  context.beginPath();
  context.arc(0, 0, 27, 0, TAU);
  context.fill();
  context.fillStyle = "rgba(0,0,0,.28)";
  context.beginPath();
  context.ellipse(3, 8, 20, 8, 0, 0, TAU);
  context.fill();
  context.fillStyle = "#8f2e35";
  context.fillRect(-18, -13, 36, 27);
  context.strokeStyle = "#321c1f";
  context.lineWidth = 3;
  context.strokeRect(-18, -13, 36, 27);
  context.fillStyle = "#e8dfc8";
  context.fillRect(-4, -9, 8, 19);
  context.fillRect(-10, -4, 20, 8);
  context.strokeStyle = "rgba(255,255,255,.35)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-14, -9);
  context.lineTo(14, -9);
  context.stroke();
  context.restore();
}

function drawAmmoPack(pickup) {
  context.save();
  context.translate(pickup.x, pickup.y);
  const pulse = 1 + Math.sin(game.time * 4 + pickup.id) * 0.045;
  context.scale(pulse, pulse);
  context.fillStyle = "rgba(0,0,0,.28)";
  context.beginPath();
  context.ellipse(3, 8, 20, 8, 0, 0, TAU);
  context.fill();
  if (ammoCrateSprite.complete && ammoCrateSprite.naturalWidth > 0) {
    context.drawImage(ammoCrateSprite, -24, -26, 48, 48);
  } else {
    // Keep unloaded or failed assets visible as the same unlabelled ammo crate.
    context.fillStyle = "#56613d";
    context.fillRect(-18, -13, 36, 27);
    context.strokeStyle = "#252f25";
    context.lineWidth = 3;
    context.strokeRect(-18, -13, 36, 27);
    context.fillStyle = "#849062";
    context.fillRect(-18, -13, 36, 6);
    context.fillStyle = "#c7b67b";
    for (const x of [-8, -2, 4]) context.fillRect(x, -3, 4, 11);
  }
  context.restore();
}

function drawShieldPack(pickup) {
  context.save();
  context.translate(pickup.x, pickup.y);
  const pulse = 1 + Math.sin(game.time * 5 + pickup.id) * 0.05;
  context.scale(pulse, pulse);
  context.fillStyle = "rgba(79, 185, 255, 0.15)";
  context.beginPath();
  context.arc(0, 0, 28, 0, TAU);
  context.fill();
  context.fillStyle = "rgba(0, 0, 0, 0.27)";
  context.beginPath();
  context.ellipse(3, 10, 19, 7, 0, 0, TAU);
  context.fill();
  if (shieldPickupSprite.complete && shieldPickupSprite.naturalWidth > 0) {
    context.drawImage(shieldPickupSprite, -24, -24, 48, 48);
  } else {
    context.beginPath();
    context.moveTo(0, -20);
    context.lineTo(17, -12);
    context.lineTo(15, 5);
    context.quadraticCurveTo(8, 15, 0, 19);
    context.quadraticCurveTo(-8, 15, -15, 5);
    context.lineTo(-17, -12);
    context.closePath();
    context.fillStyle = "#225a89";
    context.fill();
    context.strokeStyle = "#94e4ff";
    context.lineWidth = 3;
    context.stroke();
    context.beginPath();
    context.moveTo(0, -12);
    context.lineTo(0, 11);
    context.moveTo(-8, -3);
    context.lineTo(8, -3);
    context.strokeStyle = "#d6f8ff";
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

function drawPickup(pickup) {
  if (pickup.kind === "health") {
    drawHealthPack(pickup);
    return;
  }
  if (pickup.kind === "ammo") drawAmmoPack(pickup);
  if (pickup.kind === "shield") drawShieldPack(pickup);
}

function drawSpikeWarning(trap) {
  const progress = clamp(trap.phaseTime, 0, 1);
  const pulse = 0.82 + Math.sin(game.time * 13) * 0.08;
  context.save();
  context.globalAlpha = 0.62 + progress * 0.28;
  context.fillStyle = `rgba(220,72,30,${0.16 + progress * 0.24})`;
  context.beginPath();
  context.ellipse(
    0,
    2,
    trap.radius * 0.7 * pulse,
    trap.radius * 0.34 * pulse,
    0,
    0,
    TAU,
  );
  context.fill();
  context.strokeStyle = "#d76a32";
  context.lineWidth = 3 + progress * 2;
  context.beginPath();
  context.ellipse(
    0,
    1,
    trap.radius * (0.82 + progress * 0.1),
    trap.radius * (0.43 + progress * 0.05),
    0,
    0,
    TAU,
  );
  context.stroke();
  context.strokeStyle = "#ff9b45";
  context.lineWidth = 2;
  for (let index = 0; index < 6; index += 1) {
    const angle = index * TAU / 6 + 0.2;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 25, Math.sin(angle) * 12);
    context.lineTo(
      Math.cos(angle + 0.12) * (31 + progress * 6),
      Math.sin(angle + 0.12) * (16 + progress * 4),
    );
    context.stroke();
  }
  context.restore();
}

function drawSpikeCone(x, baseY, halfWidth, height, rise) {
  const tipY = baseY - height * rise;
  context.fillStyle = "#1a2022";
  context.beginPath();
  context.moveTo(x, tipY);
  context.lineTo(x, baseY);
  context.lineTo(x - halfWidth, baseY + 3);
  context.closePath();
  context.fill();

  context.fillStyle = "#8f9691";
  context.beginPath();
  context.moveTo(x, tipY);
  context.lineTo(x + halfWidth, baseY + 3);
  context.lineTo(x, baseY);
  context.closePath();
  context.fill();
}

function drawRaisedSpikes(trap) {
  const rise = Math.min(1, clamp(trap.phaseTime / 0.12, 0, 1));
  const cones = [
    [-22, 2, 8, 36],
    [23, 2, 8, 36],
    [-11, 5, 9, 52],
    [12, 5, 9, 52],
    [0, 7, 11, 72],
  ];
  for (const cone of cones) drawSpikeCone(...cone, rise);
}

function drawSpikeTrap(trap) {
  if (
    !trap ||
    !Number.isFinite(trap.x) ||
    !Number.isFinite(trap.y) ||
    !Number.isFinite(trap.radius) ||
    trap.radius <= 0
  ) return;
  context.save();
  context.translate(trap.x, trap.y);
  context.fillStyle = "rgba(77,68,57,.34)";
  context.beginPath();
  context.ellipse(0, 8, trap.radius * 1.08, trap.radius * 0.52, 0, 0, TAU);
  context.fill();
  context.fillStyle = "#4b4b45";
  context.strokeStyle = "#77766e";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, 0, trap.radius, trap.radius * 0.56, 0, 0, TAU);
  context.fill();
  context.stroke();
  context.fillStyle = "#090b0c";
  context.strokeStyle = "#24282a";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, 2, trap.radius * 0.76, trap.radius * 0.38, 0, 0, TAU);
  context.fill();
  context.stroke();
  if (trap.phase === "warning") drawSpikeWarning(trap);
  if (trap.phase === "active") drawRaisedSpikes(trap);
  context.strokeStyle = "rgba(151,148,136,.58)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-trap.radius * 0.68, 7);
  context.lineTo(0, trap.radius * 0.38 + 4);
  context.lineTo(trap.radius * 0.68, 7);
  context.stroke();
  context.restore();
}

function drawMudTrap(trap, active) {
  context.save();
  context.translate(trap.x, trap.y);
  context.scale(trap.radius / 52, trap.radius / 52);
  context.globalAlpha = trap.armed ? 1 : 0.7;

  // Broken clay lip and uneven sediment stay readable even while dormant.
  context.fillStyle = "#302b25";
  context.beginPath();
  for (let i = 0; i <= 18; i += 1) {
    const angle = i * TAU / 18;
    const reach = 50 + Math.sin(i * 2.8 + trap.x) * 4;
    const x = Math.cos(angle) * reach;
    const y = Math.sin(angle) * reach * 0.56 + 3;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.strokeStyle = "#b69a72";
  context.lineWidth = 3;
  context.stroke();

  context.fillStyle = active ? "#8a6948" : "#68523b";
  context.beginPath();
  context.ellipse(-3, 0, 44, 23, -0.14, 0, TAU);
  context.fill();
  context.fillStyle = active ? "#534634" : "#493d30";
  context.beginPath();
  context.ellipse(5, 3, 31, 16, -0.2, 0, TAU);
  context.fill();

  // A few exposed stones and shallow bars add scale without visual noise.
  for (let i = 0; i < 5; i += 1) {
    const angle = i * 2.36 + 0.4;
    const x = Math.cos(angle) * 37;
    const y = Math.sin(angle) * 19;
    context.fillStyle = i % 2 ? "#a48a68" : "#756249";
    context.beginPath();
    context.ellipse(x, y, 6, 3, angle * 0.25, 0, TAU);
    context.fill();
  }

  context.strokeStyle = active ? "#d5b78b" : "#a18561";
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(-4, -6, 23, 5, -0.12, Math.PI * 1.05, Math.PI * 1.88);
  context.stroke();
  if (active) {
    for (let i = 0; i < 2; i += 1) {
      const age = (game.time * 0.7 + i * 0.51 + trap.y * 0.003) % 1;
      context.globalAlpha = 0.7 * (1 - age);
      context.strokeStyle = "#ddc49d";
      context.lineWidth = 2 - age;
      context.beginPath();
      context.ellipse(-11 + i * 20, 1 - i * 5, 4 + age * 23, 2 + age * 10, -0.15, 0, TAU);
      context.stroke();
    }
    context.globalAlpha = 1;
    for (let i = 0; i < 4; i += 1) {
      const age = (game.time * 0.55 + i * 0.27 + trap.x * 0.001) % 1;
      const x = [-22, 16, -1, 25][i];
      const y = [6, -8, -2, 7][i] - age * 7;
      context.fillStyle = "#c7a37a";
      context.beginPath();
      context.arc(x, y, (1 - age) * 3.2 + 0.5, 0, TAU);
      context.fill();
      context.fillStyle = "#f2dbb6";
      context.beginPath();
      context.arc(x - 1, y - 1, Math.max(0.5, (1 - age) * 1.2), 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

function drawVineTrap(trap, active) {
  context.save();
  context.translate(trap.x, trap.y);
  context.scale(trap.radius / 44, trap.radius / 44);
  context.globalAlpha = active ? 1 : trap.armed ? 0.48 : 0.35;

  // Root-cracked soil distinguishes the snare from a green puddle.
  context.fillStyle = "#243024";
  context.beginPath();
  context.ellipse(0, 3, 46, 26, 0, 0, TAU);
  context.fill();
  context.strokeStyle = active ? "#9ac66d" : "#668554";
  context.lineWidth = 3;
  context.beginPath();
  context.ellipse(0, 3, 45, 25, 0, 0, TAU);
  context.stroke();

  const sway = active ? Math.sin(game.time * 3 + trap.y * 0.01) * 2.5 : 0;
  for (let i = 0; i < 8; i += 1) {
    const angle = i * TAU / 8 + 0.18;
    const x = Math.cos(angle) * 41;
    const y = Math.sin(angle) * 22;
    const bend = (i % 2 ? 1 : -1) * (7 + sway);
    context.strokeStyle = i % 2 ? "#507644" : "#729957";
    context.lineWidth = i % 3 === 0 ? 5 : 4;
    context.beginPath();
    context.moveTo(0, 3);
    context.quadraticCurveTo(x * 0.53 - bend, y * 0.38 + bend * 0.3, x, y);
    context.stroke();
    context.strokeStyle = active ? "#b8db80" : "#86aa6a";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x * 0.35 - bend * 0.5, y * 0.25);
    context.lineTo(x * 0.84, y * 0.82);
    context.stroke();

    const leafX = x * 0.82;
    const leafY = y * 0.8;
    context.fillStyle = i % 2 ? "#8caf61" : "#6e9f58";
    context.beginPath();
    context.ellipse(leafX - 3, leafY - 4, 8, 4, angle - 0.8, 0, TAU);
    context.fill();
    context.beginPath();
    context.ellipse(leafX + 4, leafY + 2, 7, 3.5, angle + 0.7, 0, TAU);
    context.fill();
  }
  context.fillStyle = active ? "#b9dd7a" : "#779957";
  context.beginPath();
  context.arc(0, 2, active ? 9 : 7, 0, TAU);
  context.fill();
  context.fillStyle = "#324b32";
  context.beginPath();
  context.arc(0, 2, 3, 0, TAU);
  context.fill();

  if (active) {
    const pulse = (game.time * 0.9 + trap.x * 0.002) % 1;
    context.globalAlpha = 0.75 * (1 - pulse);
    context.strokeStyle = "#dcf2a1";
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(0, 2, 12 + pulse * 31, 7 + pulse * 17, 0, 0, TAU);
    context.stroke();
    context.globalAlpha = 0.9;
    context.fillStyle = "#d8ed96";
    for (let i = 0; i < 5; i += 1) {
      const angle = i * TAU / 5 + game.time * 0.7;
      const radius = 21 + Math.sin(game.time * 2 + i) * 4;
      context.beginPath();
      context.arc(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, 1.8, 0, TAU);
      context.fill();
    }
  }
  context.restore();
}

function drawTerrainTrap(trap) {
  if (!trap || !Number.isFinite(trap.x) || !Number.isFinite(trap.y) ||
      !Number.isFinite(trap.radius) || trap.radius <= 0) return;
  const active = trap.armed && trap.phase === "active";
  if (trap.kind === "mud") drawMudTrap(trap, active);
  else if (trap.kind === "vine") drawVineTrap(trap, active);
}

function drawHazard(hazard) {
  context.save();
  const fade = clamp(hazard.life / 1.2, 0, 1);
  context.globalAlpha = 0.66 * fade;
  const gradient = context.createRadialGradient(hazard.x, hazard.y, 8, hazard.x, hazard.y, hazard.radius);
  gradient.addColorStop(0, "rgba(77,126,50,.90)");
  gradient.addColorStop(0.58, "rgba(38,78,40,.64)");
  gradient.addColorStop(1, "rgba(18,43,29,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(hazard.x, hazard.y, hazard.radius, 0, TAU);
  context.fill();
  context.fillStyle = "rgba(99,144,59,.38)";
  for (let index = 0; index < 6; index += 1) {
    const angle = index * 2.3 + game.time * 0.35;
    const range = 18 + ((index * 17) % 48);
    context.beginPath();
    context.arc(hazard.x + Math.cos(angle) * range, hazard.y + Math.sin(angle) * range, 7 + (index % 3) * 4, 0, TAU);
    context.fill();
  }
  context.restore();
}

function drawDamageZone(zone) {
  context.save();
  const fade = clamp(zone.life / zone.maxLife, 0, 1);
  const isFlame = zone.source === "flamethrower";
  const gradient = context.createRadialGradient(
    zone.x,
    zone.y,
    zone.radius * 0.08,
    zone.x,
    zone.y,
    zone.radius,
  );
  gradient.addColorStop(0, isFlame ? "rgba(255,211,107,.62)" : "rgba(255,167,63,.66)");
  gradient.addColorStop(0.52, "rgba(201,72,29,.42)");
  gradient.addColorStop(1, "rgba(66,23,15,0)");
  context.globalAlpha = 0.72 * fade;
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(zone.x, zone.y, zone.radius, 0, TAU);
  context.fill();
  context.fillStyle = "rgba(255,183,64,.58)";
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 2.1 + game.time * 2.4;
    const range = zone.radius * (0.2 + ((index * 23) % 45) / 100);
    const size = 3 + (index % 3) * 2;
    context.beginPath();
    context.arc(
      zone.x + Math.cos(angle) * range,
      zone.y + Math.sin(angle) * range,
      size,
      0,
      TAU,
    );
    context.fill();
  }
  context.restore();
}

function drawSlowZone(zone) {
  const maximum = Number.isFinite(zone.maxLife) && zone.maxLife > 0
    ? zone.maxLife
    : Math.max(1, zone.life);
  const fade = clamp(zone.life / maximum, 0, 1);
  const frost = zone.source === "freeze";
  const gradient = context.createRadialGradient(
    zone.x,
    zone.y,
    zone.radius * 0.08,
    zone.x,
    zone.y,
    zone.radius,
  );
  if (frost) {
    gradient.addColorStop(0, "rgba(223,248,255,.48)");
    gradient.addColorStop(0.58, "rgba(139,220,255,.28)");
    gradient.addColorStop(1, "rgba(139,220,255,0)");
  } else {
    gradient.addColorStop(0, "rgba(217,74,69,.46)");
    gradient.addColorStop(0.58, "rgba(76,155,66,.26)");
    gradient.addColorStop(1, "rgba(76,155,66,0)");
  }
  context.save();
  context.globalAlpha = 0.72 * fade;
  context.fillStyle = gradient;
  context.strokeStyle = frost ? "#8bdcff" : "#4c9b42";
  context.lineWidth = frost ? 2 : 3;
  context.beginPath();
  context.arc(zone.x, zone.y, zone.radius, 0, TAU);
  context.fill();
  context.stroke();
  context.restore();
}

function drawBeam(beam) {
  context.save();
  context.globalAlpha = clamp(beam.life / beam.maxLife, 0, 1);
  context.strokeStyle = "#d9fbff";
  context.lineWidth = beam.width ?? 5;
  context.shadowBlur = 18;
  context.shadowColor = "#72d9ff";
  context.beginPath();
  context.moveTo(beam.x1, beam.y1);
  context.lineTo(beam.x2, beam.y2);
  context.stroke();
  context.restore();
}

function drawShockwave(shockwave) {
  if (shockwave.bossSkill) { drawBossShockwave(context, shockwave); return; }
  context.save();
  context.globalAlpha = clamp(shockwave.life / shockwave.maxLife, 0, 1) * 0.72;
  context.strokeStyle = "#a44a45";
  context.lineWidth = 9;
  context.beginPath();
  context.arc(shockwave.x, shockwave.y, shockwave.radius, 0, TAU);
  context.stroke();
  context.restore();
}

function drawLightningRing(ring, detailed = true) {
  if (![ring.x, ring.y, ring.radius, ring.life, ring.maxLife].every(Number.isFinite) || ring.life <= 0 || ring.maxLife <= 0 || ring.radius < 0) return;
  const progress = clamp(1 - ring.life / ring.maxLife, 0, 1);
  const fade = 1 - progress;
  const seed = Number.isFinite(ring.id) ? ring.id : 0;
  const noise = index => Math.sin(index * 12.9898 + seed * 7.173);
  context.save();
  context.translate(ring.x, ring.y);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowBlur = 0;

  // Restore the original outward electric ring. Layered strokes supply its
  // white glow without reintroducing expensive blurred canvas surfaces.
  for (const [color, width, alpha] of [["#e6efff", 17, fade * 0.2], ["#ffffff", 7, fade]]) {
    context.strokeStyle = color; context.lineWidth = width; context.globalAlpha = alpha;
    context.beginPath();
    for (let i = 0; i < 54; i++) {
      const angle = i * TAU / 54;
      const radius = ring.radius + ((i * 19 + seed * 7) % 11) - 5;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); context.stroke();
  }

  // Point sparks stay outside the wave so no streaks cross its interior.
  // Derive their positions from ring age without persistent particle queues.
  const count = detailed ? 48 : 12;
  context.fillStyle = "#ffffff";
  context.globalAlpha = Math.min(1, fade * 3);
  context.beginPath();
  for (let i = 0; i < count; i++) {
    const birth = (i % 8) * 0.085;
    const age = progress - birth;
    const duration = 0.3 + Math.abs(noise(i + 50)) * 0.16;
    if (age <= 0 || age >= duration) continue;
    const life = 1 - age / duration;
    const angle = i * 2.399963 + seed * 0.31;
    const travel = ring.radius + 12 + age * (25 + Math.abs(noise(i + 90)) * 25);
    const x = Math.cos(angle) * travel, y = Math.sin(angle) * travel;
    const size = life * 2.6;
    context.rect(x - size / 2, y - size / 2, size, size);
  }
  context.fill();
  context.restore();
}

function drawPlacementPreview() {
  const weapon = game.player.weapon;
  if (!["turret", "tank"].includes(weapon)) return;
  const valid =
    validPlacement(mouse.x, mouse.y) &&
    hasUsableAmmo(game.player, weapon, developerSession);
  context.save();
  context.globalAlpha = 0.45;
  context.fillStyle = valid ? "#9fbd7d" : "#a33b43";
  const radius = { turret: 24, tank: 38 }[weapon];
  context.beginPath();
  context.arc(mouse.x, mouse.y, radius, 0, TAU);
  context.fill();
  context.restore();
}

function validPlacement(x, y, kind = game.player.weapon) {
  if (!canPlace(game, x, y, kind)) return false;
  return !staticObstacles.some((obstacle) => {
    const dx = (x - obstacle.x) / (obstacle.rx + 32);
    const dy = (y - obstacle.y) / (obstacle.ry + 32);
    return dx * dx + dy * dy < 1;
  });
}

function drawNotice() {
  if (game.noticeTimer <= 0) return;
  context.save();
  context.textAlign = "center";
  context.font = "700 26px 'Microsoft YaHei', sans-serif";
  context.fillStyle = "rgba(16,19,19,.78)";
  context.fillRect(WIDTH / 2 - 170, 92, 340, 46);
  context.strokeStyle = "rgba(183,154,98,.62)";
  context.strokeRect(WIDTH / 2 - 170, 92, 340, 46);
  context.fillStyle = "#e5d5af";
  context.fillText(game.notice, WIDTH / 2, 123);
  context.restore();
}

function drawTitleAmbient() {
  drawBackground();
  for (const obstacle of staticObstacles) drawObstacle(obstacle);
  context.fillStyle = "rgba(8,10,10,.28)";
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function render() {
  drawBackground();
  for (const enemy of game.enemies) if (enemy.kind === "boss") drawBossCombat(context, enemy);
  for (const hazard of game.hazards) drawHazard(hazard);
  for (const zone of game.damageZones) drawDamageZone(zone);
  for (const zone of game.slowZones) drawSlowZone(zone);
  for (const trap of game.terrainTraps ?? []) drawTerrainTrap(trap);
  for (const trap of game.spikeTraps) drawSpikeTrap(trap);
  for (const shockwave of game.shockwaves) drawShockwave(shockwave);
  for (const decal of game.decals) {
    context.save();
    context.globalAlpha = decal.alpha;
    context.fillStyle = "#5e2025";
    context.beginPath();
    context.ellipse(decal.x, decal.y, decal.radius, decal.radius * 0.55, -0.3, 0, TAU);
    context.fill();
    context.restore();
  }
  for (const pickup of game.pickups) drawPickup(pickup);
  const entities = [
    ...staticObstacles.map((obstacle) => ({
      y: obstacle.y,
      draw: () => drawObstacle(obstacle),
    })),
    ...game.structures.map((structure) => ({
      y: structure.y,
      draw: () => drawStructure(structure),
    })),
    ...game.enemyDeathAnimations.map((death) => ({
      y: death.y,
      draw: () => drawEnemyDeathSprite(death),
    })),
    ...game.iceStatues.map((statue) => ({
      y: statue.y,
      draw: () => drawIceStatue(statue),
    })),
    ...game.enemies.map((enemy) => ({ y: enemy.y, draw: () => drawEnemy(enemy) })),
    { y: game.player.y, draw: drawPlayer },
  ].sort((a, b) => a.y - b.y);
  for (const entity of entities) entity.draw();
  for (const bullet of game.bullets) drawBullet(bullet);
  drawArrowRains();
  drawArrowRainAimIndicator();
  for (const beam of game.beams) drawBeam(beam);
  for (const arc of game.lightningArcs) drawLightningArc(arc);
  for (const effect of game.lightningHitEffects ?? []) drawLightningHitEffect(effect);
  for (const ring of game.lightningRings) drawLightningRing(ring, ring === game.lightningRings.at(-1));
  for (const particle of game.particles) drawParticle(particle);
  drawPlacementPreview();
  drawNotice();
  drawButterflyBuffs();
  if (trainingLab) {
    const dummy = game.enemies.find(enemy => enemy.isTrainingDummy);
    const sourceName = weapons.find(weapon => weapon.id === dummy?.lastDamageSource)?.name;
    updateTrainingLab(trainingLab, dummy, game.time, sourceName);
  }
  if (tankReview) {
    updateTurretReview(tankReview, tankTexture, game.structures.find((item) => item.kind === "tank"), drawTank, drawReviewFloor);
  } else if (turretReview) {
    updateTurretReview(turretReview, turretTexture, game.structures.find((item) => item.kind === "turret"), drawAutomaticTurret, drawReviewFloor);
  } else {
    updateAdultReviewMagnifier(adultReview, canvas, game.player, (detailContext) => {
      drawPlayerSprite(game.player, 0, 0, 1, game.player.dodgeDuration > 0, detailContext, 1);
    }, drawReviewFloor);
  }
}

function frame(now) {
  if (typeof scoreBoard !== "undefined" && scoreBoard.isOpen) { lastFrame = now; requestAnimationFrame(frame); return; }
  if (game.mode === "playing" && developerSession.enabled) game.scoreboardAssisted = true;
  const trialState = resolveTankTrialFrameState();
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  accumulator += elapsed;
  if (trialState === "restored") {
    accumulator = 0;
  } else {
    while (accumulator >= 1 / 60) {
      const updateStatus = update(1 / 60);
      accumulator -= 1 / 60;
      if (updateStatus === "restored" || updateStatus === "advanced") {
        accumulator = 0;
        break;
      }
    }
  }

  if (game.mode === "title") drawTitleAmbient();
  else render();
  updateHud();
  requestAnimationFrame(frame);
}

renderWeaponBar();
requestAnimationFrame(frame);
