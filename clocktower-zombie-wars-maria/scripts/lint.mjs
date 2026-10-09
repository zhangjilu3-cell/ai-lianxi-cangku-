import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const files = [
  "scripts/verify.mjs",
  "src/training-dummy.js",
  "src/arena-background.js",
  "src/tank-visual.js",
  "src/turret-visual.js",
  "src/player-upright-review.js",
  "src/weapon-visuals.js",
  "src/player-weapon-renderer.js",
  "src/player-arm-rig.js",
  "src/player-adult-review.js",
  "src/player-front-preview.js",
  "src/weapon-model-preview.js",
  "src/player-style-rigs.js",
  "src/player-style-review.js",
  "src/weapon-traits.js",
  "src/reward-progression.js",
  "src/weapon-effects.js",
  "src/game-core.js",
  "src/developer-mode.js",
  "src/supply-drops.js",
  "src/player-shield.js",
  "src/tank-trial.js",
  "src/toxic-gas-trail.js",
  "src/random-wave-enhancements.js",
  "src/spike-traps.js",
  "src/zombie-animation.js",
  "src/game.js",
  "src/arena-props.js",
  "src/scoreboard.js",
  "src/boss-combat.js",
  "src/boss-effects.js",
  "scripts/build.mjs",
  "scripts/dev-server.mjs",
];
let failed = false;

for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.includes("\t")) {
    console.error(`${file}：包含制表符`);
    failed = true;
  }
  if (/\b(TODO|FIXME)\b/.test(source)) {
    console.error(`${file}：包含未完成标记`);
    failed = true;
  }
  const check = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (check.status !== 0) {
    console.error(`${file}：${check.stderr || check.stdout}`);
    failed = true;
  }
}

const requiredMarkers = [
  [
    "src/weapon-visuals.js",
    ["HANDHELD_WEAPON_IDS", "WEAPON_VISUALS", "triggerWeaponVisual"],
  ],
  [
    "src/player-weapon-renderer.js",
    ["resolveWeaponDrawRect", "resolveWeaponGripPoints", "drawWeaponModel"],
  ],
  [
    "src/player-arm-rig.js",
    [
      "PLAYER_RIG_ASSETS",
      "solveTwoBoneArm",
      "resolvePlayerArmPose",
      "drawPlayerArm",
      "drawPlayerBody",
    ],
  ],
  [
    "src/player-front-preview.js",
    [
      "FRONT_PREVIEW_VISUAL",
      "resolvePreviewMode",
      "offsetFrontPreviewGrips",
      "drawFrontPlayerBody",
      "drawFrontFaceDetails",
    ],
  ],
  [
    "src/player-weapon-hands.js",
    [
      "PLAYER_WEAPON_HAND_PROFILES",
      "PLAYER_WEAPON_HAND_ASSET_ENTRIES",
      "resolvePlayerRigImages",
    ],
  ],
  [
    "src/weapon-model-preview.js",
    ["AIM_DIRECTIONS", "HANDHELD_WEAPON_IDS", "drawWeaponModel"],
  ],
  [
    "src/player-style-rigs.js",
    [
      "PLAYER_STYLE_IDS",
      "PLAYER_STYLE_RIGS",
      "buildStyleWeaponReviewCells",
    ],
  ],
  [
    "src/player-style-review.js",
    [
      "resolvePlayerArmPoseForRig",
      "Promise.allSettled",
      "drawWeaponModel",
    ],
  ],
  [
    "src/weapon-traits.js",
    [
      "WEAPON_TRAITS",
      "createWeaponUpgrades",
      "incrementWeaponTrait",
      "resolveTraitStat",
    ],
  ],
  [
    "src/reward-progression.js",
    [
      "PLAYER_TRAITS",
      "createRewardSession",
      "openRewardSession",
      "claimReward",
      "playerModifiers",
      "buildWeaponCandidates",
    ],
  ],
  [
    "src/weapon-effects.js",
    [
      "buildLightningChain",
      "applyFreezeStatus",
      "strongestSlow",
      "watermelonChargeStats",
      "rayArenaIntersection",
      "reflectRayAtBoundary",
    ],
  ],
  [
    "src/developer-mode.js",
    [
      "DEVELOPER_LIMITS",
      "buildDeveloperWave",
      "applyDeveloperWave",
      "hasUsableAmmo",
    ],
  ],
  [
    "src/supply-drops.js",
    [
      "AMMO_SUPPLIES",
      "ammoDropCandidates",
      "rollEnemyDrops",
      "resolveAmmoPickup",
    ],
  ],
  [
    "src/tank-trial.js",
    [
      "TANK_TRIAL_STAGES",
      "createTankTrialSession",
      "creditTankTrialKill",
      "restoreTankTrialGame",
    ],
  ],
  [
    "src/toxic-gas-trail.js",
    ["TOXIC_GAS_TRAIL", "createToxicGasTrailState", "advanceToxicGasTrail"],
  ],
  [
    "src/random-wave-enhancements.js",
    [
      "ENHANCED_ENEMY_KINDS",
      "buildWaveEnhancements",
      "consumeWaveEnhancement",
    ],
  ],
  [
    "src/spike-traps.js",
    ["SPIKE_TRAP_MIN_WAVE", "createSpikeTraps", "advanceSpikeTrap"],
  ],
  [
    "src/game.js",
    [
      "dodgeIndicator",
      "resolveDodgeDirection",
      "isPlayerInvulnerable",
      "getStableRollPose",
      "PLAYER_RIG_ASSETS",
      "PLAYER_WEAPON_HAND_ASSET_ENTRIES",
      "resolvePlayerArmPose",
      "drawPlayerArm",
      "fireFlame",
      "fireLaser",
      "ricochet",
      "drawHazard",
      "updateLightning",
      "tickLightningRingLifetime",
      "drawLightningRing",
      "healthAfterPack",
      "createSupplyPickups",
      "drawHealthPack",
      "drawAmmoPack",
      "drawPickup",
      "updateSpikeTraps",
      "drawSpikeTrap",
      "ARENA_PILLARS",
      'drawArenaObstacle(context, obstacle)',
      "rewardBossKill",
      '"tank"',
      "enemyAtlases",
      "resolveEnemyVisual",
      "drawEnemySprite",
    ],
  ],
  ["src/index.html", ["空格：翻滚", "dodgeIndicator"]],
  [
    "src/zombie-animation.js",
    [
      "ENEMY_KINDS",
      "ENEMY_VISUALS",
      "ZOMBIE_ATLAS",
      "resolveEnemyVisual",
      "ENEMY_RENDER_ROW",
      "resolveZombieSourceRect",
    ],
  ],
  [
    "scripts/build.mjs",
    [
      "reward-progression.js",
      "weapon-traits.js",
      "weapon-effects.js",
      "weapon-visuals.js",
      "player-weapon-renderer.js",
      "player-arm-rig.js",
      "player-rig/maria-body.png",
      "player-rig/far-upper-arm.png",
      "player-rig/far-forearm-hand.png",
      "player-rig/near-upper-arm.png",
      "player-rig/near-forearm-hand.png",
      "player-style-review.html",
      "player-style-review.css",
      "player-style-review.js",
      "player-style-rigs.js",
      "playerStyleReviewImages",
      "weaponImageAssets",
      "supply-drops.js",
      "tank-trial.js",
      "toxic-gas-trail.js",
      "random-wave-enhancements.js",
      "spike-traps.js",
      "tank-trial-fragments.png",
      "shield-pickup.png",
      "zombie-animation.js",
      "/zombie-atlas.webp",
      "/runner-atlas.webp",
      "/exploder-atlas.webp",
      "/toxic-atlas.webp",
      "/brute-atlas.webp",
      "/devil-atlas.webp",
      "/boss-atlas.webp",
      "data:image/webp;base64",
      "replaceAll",
      'entry.type.startsWith("image/")',
    ],
  ],
  ["src/styles.css", [".dodge-indicator", "conic-gradient"]],
];

for (const [file, markers] of requiredMarkers) {
  const source = await readFile(file, "utf8");
  for (const marker of markers) {
    if (!source.includes(marker)) {
      console.error(`${file}：缺少关键标记 ${marker}`);
      failed = true;
    }
  }
}

const gameSource = await readFile("src/game.js", "utf8");
for (const forbidden of [
  "zombieAtlasReady",
  "drawProgrammaticEnemy",
  "已使用旧外观",
]) {
  if (gameSource.includes(forbidden)) {
    console.error(`src/game.js：仍包含旧敌人图集回退标记 ${forbidden}`);
    failed = true;
  }
}

if (gameSource.includes("rgba(222,228,211")) {
  console.error("src/game.js：仍包含旧版白色无敌圆弧");
  failed = true;
}

if (gameSource.includes("#b9bab2")) {
  console.error("src/game.js：柱体仍包含亮白圆弧");
  failed = true;
}

for (const marker of ["drawArenaFloor", "ARENA_FLOOR_TEXTURE_SRC"]) {
  if (!gameSource.includes(marker)) {
    console.error(`src/game.js：废弃城市石板广场接入缺失 ${marker}`);
    failed = true;
  }
}

if (gameSource.includes("if (waveIsResting) return;")) {
  console.error("src/game.js：休整阶段仍会冻结雷电圈生命周期");
  failed = true;
}

for (const forbidden of ["barrel", "barricade", "mortar"]) {
  if (new RegExp(`["']${forbidden}["']`).test(gameSource)) {
    console.error(`src/game.js：仍包含已移除设施 ${forbidden}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("代码检查通过");
