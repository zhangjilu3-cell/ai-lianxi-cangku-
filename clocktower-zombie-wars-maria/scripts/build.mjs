import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const enemyAtlasAssets = [
  ["zombie", "/zombie-atlas.webp", "public/zombie-atlas.webp"],
  ["runner", "/runner-atlas.webp", "public/runner-atlas.webp"],
  ["exploder", "/exploder-atlas.webp", "public/exploder-atlas.webp"],
  ["toxic", "/toxic-atlas.webp", "public/toxic-atlas.webp"],
  ["brute", "/brute-atlas.webp", "public/brute-atlas.webp"],
  ["devil", "/devil-atlas.webp", "public/devil-atlas.webp"],
  ["boss", "/boss-atlas.webp", "public/boss-atlas.webp"],
];
const handheldWeaponIds = [
  "pistol",
  "shotgun",
  "rocket",
  "flamethrower",
  "laser",
  "ricochet",
  "lightning",
  "freeze",
  "watermelon",
];
const weaponImageAssets = handheldWeaponIds.map((weaponId) => [
  "/weapons/" + weaponId + ".png",
  "public/weapons/" + weaponId + ".png",
]);
const playerRigImageAssets = [
  ["/player-rig/adult-side-review-body.png", "public/player-rig/adult-side-review-body.png"],
  ["/player-rig/adult-review-body.png", "public/player-rig/adult-review-body.png"],
  ["/player-rig/adult-pistol-held-review.png", "public/player-rig/adult-pistol-held-review.png"],
  ["/player-rig/maria-body.png", "public/player-rig/maria-body.png"],
  ["/player-rig/adult-topdown-review-body.png", "public/player-rig/adult-topdown-review-body.png"],
  ["/player-rig/far-upper-arm.png", "public/player-rig/far-upper-arm.png"],
  [
    "/player-rig/far-forearm-hand.png",
    "public/player-rig/far-forearm-hand.png",
  ],
  ["/player-rig/near-upper-arm.png", "public/player-rig/near-upper-arm.png"],
  [
    "/player-rig/near-forearm-hand.png",
    "public/player-rig/near-forearm-hand.png",
  ],
];
const playerWeaponHandImageAssets = handheldWeaponIds.flatMap((weaponId) =>
  ["far", "near"].map((side) => [
    `/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`,
    `public/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`,
  ]),
);
const reviewStyleIds = ["a", "b", "c"];
const reviewLayerNames = [
  "body",
  "far-upper-arm",
  "far-forearm-hand",
  "near-upper-arm",
  "near-forearm-hand",
];
const playerStyleReviewImages = reviewStyleIds.flatMap((styleId) =>
  reviewLayerNames.map((layer) => [
    "/player-style-review/" + styleId + "/" + layer + ".png",
    "public/player-style-review/" + styleId + "/" + layer + ".png",
  ]),
);
const dist = join(root, "dist");
const assets = [
  ["/arena-props.js", "src/arena-props.js", "text/javascript; charset=utf-8"],
  ["/scoreboard.js", "src/scoreboard.js", "text/javascript; charset=utf-8"],
  ["/boss-combat.js", "src/boss-combat.js", "text/javascript; charset=utf-8"],
  ["/boss-effects.js", "src/boss-effects.js", "text/javascript; charset=utf-8"],
  ["/training-dummy.js", "src/training-dummy.js", "text/javascript; charset=utf-8"],
  ["/training/scarecrow.png", "public/training/scarecrow.png", "image/png"],
  ["/arena-background.js", "src/arena-background.js", "text/javascript; charset=utf-8"],
  ["/backgrounds/city-plaza.png", "public/backgrounds/city-plaza.png", "image/png"],
  ["/tank-visual.js", "src/tank-visual.js", "text/javascript; charset=utf-8"],
  ["/structures/tank-cold-steel.png", "public/structures/tank-cold-steel.png", "image/png"],
  ["/turret-visual.js", "src/turret-visual.js", "text/javascript; charset=utf-8"],
  ["/structures/auto-turret.png", "public/structures/auto-turret.png", "image/png"],
  ["/player-upright-review.js", "src/player-upright-review.js", "text/javascript; charset=utf-8"],
  ["/", "src/index.html", "text/html; charset=utf-8"],
  ["/index.html", "src/index.html", "text/html; charset=utf-8"],
  ["/styles.css", "src/styles.css", "text/css; charset=utf-8"],
  [
    "/weapon-model-preview.html",
    "src/weapon-model-preview.html",
    "text/html; charset=utf-8",
  ],
  [
    "/weapon-model-preview.css",
    "src/weapon-model-preview.css",
    "text/css; charset=utf-8",
  ],
  [
    "/weapon-model-preview.js",
    "src/weapon-model-preview.js",
    "text/javascript; charset=utf-8",
  ],
  [
    "/player-front-preview.js",
    "src/player-front-preview.js",
    "text/javascript; charset=utf-8",
  ],
  [
    "/player-style-review.html",
    "src/player-style-review.html",
    "text/html; charset=utf-8",
  ],
  [
    "/player-style-review.css",
    "src/player-style-review.css",
    "text/css; charset=utf-8",
  ],
  [
    "/player-style-review.js",
    "src/player-style-review.js",
    "text/javascript; charset=utf-8",
  ],
  [
    "/player-style-rigs.js",
    "src/player-style-rigs.js",
    "text/javascript; charset=utf-8",
  ],
  ["/game-core.js", "src/game-core.js", "text/javascript; charset=utf-8"],
  ["/player-adult-review.js", "src/player-adult-review.js", "text/javascript; charset=utf-8"],
  ["/weapon-visuals.js", "src/weapon-visuals.js", "text/javascript; charset=utf-8"],
  [
    "/player-weapon-renderer.js",
    "src/player-weapon-renderer.js",
    "text/javascript; charset=utf-8",
  ],
  [
    "/player-arm-rig.js",
    "src/player-arm-rig.js",
    "text/javascript; charset=utf-8",
  ],
  [
    "/player-weapon-hands.js",
    "src/player-weapon-hands.js",
    "text/javascript; charset=utf-8",
  ],
  ["/weapon-traits.js", "src/weapon-traits.js", "text/javascript; charset=utf-8"],
  ["/reward-progression.js", "src/reward-progression.js", "text/javascript; charset=utf-8"],
  ["/weapon-effects.js", "src/weapon-effects.js", "text/javascript; charset=utf-8"],
  ["/developer-mode.js", "src/developer-mode.js", "text/javascript; charset=utf-8"],
  ["/supply-drops.js", "src/supply-drops.js", "text/javascript; charset=utf-8"],
  ["/player-shield.js", "src/player-shield.js", "text/javascript; charset=utf-8"],
  ["/tank-trial.js", "src/tank-trial.js", "text/javascript; charset=utf-8"],
  ["/toxic-gas-trail.js", "src/toxic-gas-trail.js", "text/javascript; charset=utf-8"],
  [
    "/random-wave-enhancements.js",
    "src/random-wave-enhancements.js",
    "text/javascript; charset=utf-8",
  ],
  ["/spike-traps.js", "src/spike-traps.js", "text/javascript; charset=utf-8"],
  ["/game.js", "src/game.js", "text/javascript; charset=utf-8"],
  ["/zombie-animation.js", "src/zombie-animation.js", "text/javascript; charset=utf-8"],
  ...enemyAtlasAssets.map(([, route, file]) => [route, file, "image/webp"]),
  ["/maria-reference.png", "public/maria-reference.png", "image/png"],
  ["/maria-sprite.png", "public/maria-sprite.png", "image/png"],
  ["/maria-topdown.png", "public/maria-topdown.png", "image/png"],
  ["/maria-topdown-clean.png", "public/maria-topdown-clean.png", "image/png"],
  ...playerRigImageAssets.map(([route, file]) => [route, file, "image/png"]),
  ...playerWeaponHandImageAssets.map(([route, file]) => [
    route,
    file,
    "image/png",
  ]),
  ...playerStyleReviewImages.map(([route, file]) => [
    route,
    file,
    "image/png",
  ]),
  ...weaponImageAssets.map(([route, file]) => [route, file, "image/png"]),
  ["/tank-trial-fragments.png", "public/tank-trial-fragments.png", "image/png"],
  ["/ammo-crate.png", "public/ammo-crate.png", "image/png"],
  ["/shield-pickup.png", "public/shield-pickup.png", "image/png"],
  ["/og.png", "public/og.png", "image/png"],
];

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "server"), { recursive: true });

const encoded = {};
for (const [route, file, type] of assets) {
  const contents = await readFile(join(root, file));
  encoded[route] = { type, body: contents.toString("base64") };
}

const worker = `const assets=${JSON.stringify(encoded)};
function decode(value){const raw=atob(value);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes}
export default{async fetch(request){const url=new URL(request.url);const entry=assets[url.pathname]||assets["/"];if(!entry)return new Response("未找到页面",{status:404});return new Response(decode(entry.body),{headers:{"content-type":entry.type,"cache-control":entry.type.startsWith("image/")?"public, max-age=31536000, immutable":"public, max-age=300","x-content-type-options":"nosniff"}})}};`;

await writeFile(join(dist, "server", "index.js"), worker);

const [
  htmlSource,
  cssSource,
  weaponVisualsSource,
  playerWeaponRendererSource,
  playerArmRigSource,
  playerWeaponHandsSource,
  weaponTraitsSource,
  rewardSource,
  weaponEffectsSource,
  coreSource,
  developerSource,
  supplySource,
  shieldSource,
  tankTrialSource,
  toxicGasTrailSource,
  randomWaveEnhancementSource,
  spikeTrapSource,
  animationSource,
  gameSource,
  referenceImage,
  spriteImage,
  trialImage,
] = await Promise.all([
  readFile(join(root, "src/index.html"), "utf8"),
  readFile(join(root, "src/styles.css"), "utf8"),
  readFile(join(root, "src/weapon-visuals.js"), "utf8"),
  readFile(join(root, "src/player-weapon-renderer.js"), "utf8"),
  readFile(join(root, "src/player-arm-rig.js"), "utf8"),
  readFile(join(root, "src/player-weapon-hands.js"), "utf8"),
  readFile(join(root, "src/weapon-traits.js"), "utf8"),
  readFile(join(root, "src/reward-progression.js"), "utf8"),
  readFile(join(root, "src/weapon-effects.js"), "utf8"),
  readFile(join(root, "src/game-core.js"), "utf8"),
  readFile(join(root, "src/developer-mode.js"), "utf8"),
  readFile(join(root, "src/supply-drops.js"), "utf8"),
  readFile(join(root, "src/player-shield.js"), "utf8"),
  readFile(join(root, "src/tank-trial.js"), "utf8"),
  readFile(join(root, "src/toxic-gas-trail.js"), "utf8"),
  readFile(join(root, "src/random-wave-enhancements.js"), "utf8"),
  readFile(join(root, "src/spike-traps.js"), "utf8"),
  readFile(join(root, "src/zombie-animation.js"), "utf8"),
  readFile(join(root, "src/game.js"), "utf8"),
  readFile(join(root, "public/maria-reference.png")),
  readFile(join(root, "public/maria-sprite.png")),
  readFile(join(root, "public/tank-trial-fragments.png")),
]);

const enemyAtlasImages = new Map(
  await Promise.all(
    enemyAtlasAssets.map(async ([kind, , file]) => [kind, await readFile(join(root, file))]),
  ),
);
const weaponImages = new Map(
  await Promise.all(
    weaponImageAssets.map(async ([route, file]) => [
      route,
      await readFile(join(root, file)),
    ]),
  ),
);
const playerRigImages = new Map(
  await Promise.all(
    playerRigImageAssets.map(async ([route, file]) => [
      route,
      await readFile(join(root, file)),
    ]),
  ),
);
const playerWeaponHandImages = new Map(
  await Promise.all(
    playerWeaponHandImageAssets.map(async ([route, file]) => [
      route,
      await readFile(join(root, file)),
    ]),
  ),
);
let standaloneWeaponVisuals = weaponVisualsSource.replace(/\bexport\s+/g, "");
for (const [route] of weaponImageAssets) {
  const dataUri =
    "data:image/png;base64," + weaponImages.get(route).toString("base64");
  standaloneWeaponVisuals = standaloneWeaponVisuals.replaceAll(
    '"' + route + '"',
    '"' + dataUri + '"',
  );
}
const standalonePlayerWeaponRenderer =
  playerWeaponRendererSource.replace(/\bexport\s+/g, "");
const standaloneTrainingDummy = (await readFile(join(root, "src/training-dummy.js"), "utf8"))
  .replace(/\bexport\s+/g, "")
  .replace('"/training/scarecrow.png"', '"data:image/png;base64,' + encoded["/training/scarecrow.png"].body + '"');
const standaloneArenaBackground = (await readFile(join(root, "src/arena-background.js"), "utf8"))
  .replace(/\bexport\s+/g, "")
  .replace('"/backgrounds/city-plaza.png"', '"data:image/png;base64,' + encoded["/backgrounds/city-plaza.png"].body + '"');
const standaloneTankVisual = (await readFile(join(root, "src/tank-visual.js"), "utf8"))
  .replace(/\bexport\s+/g, "")
  .replace('"/structures/tank-cold-steel.png"', '"data:image/png;base64,' + encoded["/structures/tank-cold-steel.png"].body + '"');
const standaloneTurretVisual = (await readFile(join(root, "src/turret-visual.js"), "utf8"))
  .replace(/\bexport\s+/g, "")
  .replace('"/structures/auto-turret.png"', '"data:image/png;base64,' + encoded["/structures/auto-turret.png"].body + '"');
let standaloneUprightReview = (await readFile(join(root, "src/player-upright-review.js"), "utf8"))
  .replace(/^import[^;]+;\s*/gm, "")
  .replace(/\bexport\s+/g, "")
  .replace('"/player-rig/adult-review-body.png"', '"data:image/png;base64,' + encoded["/player-rig/adult-review-body.png"].body + '"');
for (const route of ["/player-rig/adult-side-review-body.png", "/player-rig/near-upper-arm.png", "/player-rig/near-forearm-hand.png"]) {
  standaloneUprightReview = standaloneUprightReview.replaceAll('"' + route + '"', '"data:image/png;base64,' + encoded[route].body + '"');
}
let standaloneAdultReview = (await readFile(join(root, "src/player-adult-review.js"), "utf8"))
  .replace(/^import[^;]+;\s*/gm, "")
  .replace(/\bexport\s+/g, "")
  .replace('"/player-rig/adult-topdown-review-body.png"', '"data:image/png;base64,' + encoded["/player-rig/adult-topdown-review-body.png"].body + '"');
for (const route of ["/player-rig/adult-pistol-held-review.png", "/player-rig/weapons/pistol/near-forearm-hand.png"]) {
  standaloneAdultReview = standaloneAdultReview.replaceAll('"' + route + '"', '"data:image/png;base64,' + encoded[route].body + '"');
}
let standalonePlayerArmRig = playerArmRigSource.replace(/\bexport\s+/g, "");
for (const [route] of playerRigImageAssets) {
  const dataUri =
    "data:image/png;base64," + playerRigImages.get(route).toString("base64");
  standalonePlayerArmRig = standalonePlayerArmRig.replaceAll(
    '"' + route + '"',
    '"' + dataUri + '"',
  );
}
const standalonePlayerWeaponHandRoutes = Object.fromEntries(
  playerWeaponHandImageAssets.map(([route]) => {
    const match = route.match(
      /^\/player-rig\/weapons\/([^/]+)\/(far|near)-forearm-hand\.png$/,
    );
    if (!match) throw new Error("无法解析逐武器手型路由：" + route);
    return [
      match[1] + ":" + match[2],
      "data:image/png;base64," +
        playerWeaponHandImages.get(route).toString("base64"),
    ];
  }),
);
let standalonePlayerWeaponHands = playerWeaponHandsSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/weapon-visuals\.js";\s*/, "")
  .replace(/\bexport\s+/g, "")
  .replace(
    "`/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`",
    'STANDALONE_PLAYER_WEAPON_HAND_ROUTES[weaponId + ":" + side]',
  );
standalonePlayerWeaponHands =
  "const STANDALONE_PLAYER_WEAPON_HAND_ROUTES=" +
  JSON.stringify(standalonePlayerWeaponHandRoutes) +
  ";\n" +
  standalonePlayerWeaponHands;
const standaloneWeaponTraits = weaponTraitsSource.replace(/\bexport\s+/g, "");
const standaloneReward = rewardSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/weapon-traits\.js";\s*/, "")
  .replace(/\bexport\s+/g, "");
const standaloneWeaponEffects = weaponEffectsSource.replace(/\bexport\s+/g, "");
const standaloneCore = coreSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/reward-progression\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/weapon-traits\.js";\s*/, "")
  .replace(/\bexport\s+/g, "");
const standaloneDeveloper = developerSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/game-core\.js";\s*/, "")
  .replace(
    /^import\s*\{[^}]*\}\s*from\s*"\.\/random-wave-enhancements\.js";\s*/,
    "",
  )
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/spike-traps\.js";\s*/, "")
  .replace(/\bexport\s+/g, "");
const standaloneSupply = supplySource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/weapon-traits\.js";\s*/, "")
  .replace(/\bexport\s+/g, "");
const standaloneShield = shieldSource.replace(/\bexport\s+/g, "");
const standaloneTankTrial = tankTrialSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/game-core\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/reward-progression\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\.\/weapon-traits\.js";\s*/, "")
  .replace(/\bexport\s+/g, "");
const standaloneToxicGasTrail = toxicGasTrailSource.replace(/\bexport\s+/g, "");
const standaloneRandomWaveEnhancements =
  randomWaveEnhancementSource.replace(/\bexport\s+/g, "");
const standaloneSpikeTraps = spikeTrapSource.replace(/\bexport\s+/g, "");
let standaloneAnimation = animationSource.replace(/\bexport\s+/g, "");
for (const [kind, route] of enemyAtlasAssets) {
  const dataUri = `data:image/webp;base64,${enemyAtlasImages.get(kind).toString("base64")}`;
  standaloneAnimation = standaloneAnimation.replaceAll(`"${route}"`, `"${dataUri}"`);
}
const standaloneBossCombat = (await readFile(join(root, "src/boss-combat.js"), "utf8")).replace(/\bexport\s+/g, "");
const standaloneBossEffects = (await readFile(join(root, "src/boss-effects.js"), "utf8")).replace(/^import[^;]+;\s*/m, "").replace(/\bexport\s+/g, "");
const standaloneScoreboard = (await readFile(join(root, "src/scoreboard.js"), "utf8")).replace(/\bexport\s+/g, "");
const standaloneArenaProps = (await readFile(join(root, "src/arena-props.js"), "utf8")).replace(/\bexport\s+/g, "");
const standaloneGame = gameSource
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/arena-props\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/scoreboard\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/boss-combat\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/boss-effects\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/training-dummy\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/arena-background\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/tank-visual\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/turret-visual\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/player-upright-review\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/player-adult-review\.js";\s*/m, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/game-core\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/developer-mode\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/supply-drops\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/player-shield\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/reward-progression\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/weapon-traits\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/weapon-effects\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/weapon-visuals\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/player-arm-rig\.js";\s*/, "")
  .replace(
    /^import\s*\{[^}]*\}\s*from\s*"\/player-weapon-hands\.js";\s*/,
    "",
  )
  .replace(
    /^import\s*\{[^}]*\}\s*from\s*"\/player-weapon-renderer\.js";\s*/,
    "",
  )
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/tank-trial\.js";\s*/, "")
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/toxic-gas-trail\.js";\s*/, "")
  .replace(
    /^import\s*\{[^}]*\}\s*from\s*"\/random-wave-enhancements\.js";\s*/,
    "",
  )
  .replace(/^import\s*\{[^}]*\}\s*from\s*"\/spike-traps\.js";\s*/, "")
  .replace(
    /^import\s*\{[^}]*\}\s*from\s*"\/zombie-animation\.js";\s*/,
    "",
  )
  .replace(
    '"/ammo-crate.png"',
    `"data:image/png;base64,${encoded["/ammo-crate.png"].body}"`,
  )
  .replace(
    'shieldPickupSprite.src = "/shield-pickup.png";',
    `shieldPickupSprite.src = "data:image/png;base64,${encoded["/shield-pickup.png"].body}";`,
  )
  .replace(
    'mariaSprite.src = "/maria-sprite.png";',
    `mariaSprite.src = "data:image/png;base64,${spriteImage.toString("base64")}";`,
  );
const standalone = htmlSource
  .replace('<link rel="stylesheet" href="/styles.css" />', `<style>${cssSource}</style>`)
  .replace(
    'src="/maria-reference.png"',
    `src="data:image/png;base64,${referenceImage.toString("base64")}"`,
  )
  .replaceAll(
    'src="/tank-trial-fragments.png"',
    'src="data:image/png;base64,' + trialImage.toString("base64") + '"',
  )
  .replace(
    '<script type="module" src="/game.js"></script>',
    `<script>${standaloneWeaponVisuals}\n${standalonePlayerWeaponRenderer}\n${standalonePlayerArmRig}\n${standalonePlayerWeaponHands}\n${standaloneAdultReview}\n${standaloneUprightReview}\n${standaloneTurretVisual}\n${standaloneTankVisual}\n${standaloneArenaBackground}\n${standaloneTrainingDummy}\n${standaloneWeaponTraits}\n${standaloneReward}\n${standaloneCore}\n${standaloneRandomWaveEnhancements}\n${standaloneSpikeTraps}\n${standaloneDeveloper}\n${standaloneSupply}\n${standaloneShield}\n${standaloneTankTrial}\n${standaloneToxicGasTrail}\n${standaloneWeaponEffects}\n${standaloneAnimation}\n${standaloneBossCombat}\n${standaloneBossEffects}\n${standaloneScoreboard}\n${standaloneArenaProps}\n${standaloneGame}</script>`,
  );

await writeFile(join(dist, "standalone.html"), standalone);
console.log(`构建完成：${assets.length} 个托管资源和一个单文件版本`);
