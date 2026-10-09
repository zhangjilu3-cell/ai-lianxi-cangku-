import { HANDHELD_WEAPON_IDS } from "./weapon-visuals.js";

export const PLAYER_STYLE_IDS = Object.freeze(["a", "b", "c"]);

function assetsFor(styleId) {
  const root = "/player-style-review/" + styleId + "/";
  return Object.freeze({
    body: root + "body.png",
    farUpper: root + "far-upper-arm.png",
    farForearm: root + "far-forearm-hand.png",
    nearUpper: root + "near-upper-arm.png",
    nearForearm: root + "near-forearm-hand.png",
  });
}

function arm(options) {
  return Object.freeze({
    shoulder: Object.freeze({ ...options.shoulder }),
    upperLength: options.upperLength,
    forearmLength: options.forearmLength,
    bendDirection: options.bendDirection,
    minReachRatio: 0.18,
    maxReachRatio: 0.96,
  });
}

function visual(options) {
  return Object.freeze({
    bodyDraw: Object.freeze({ ...options.bodyDraw }),
    limbHeight: options.limbHeight,
    far: arm({ ...options.arm, shoulder: options.farShoulder, bendDirection: -1 }),
    near: arm({ ...options.arm, shoulder: options.nearShoulder, bendDirection: 1 }),
  });
}

function style(id, label, visualOptions) {
  return Object.freeze({
    id,
    label,
    assets: assetsFor(id),
    visual: visual(visualOptions),
  });
}

export const PLAYER_STYLE_RIGS = Object.freeze({
  a: style("a", "Q 版街机", {
    bodyDraw: { x: -38, y: -30, width: 76, height: 60 },
    limbHeight: 18,
    farShoulder: { x: 8, y: -13 },
    nearShoulder: { x: 8, y: 13 },
    arm: { upperLength: 22, forearmLength: 20 },
  }),
  b: style("b", "卡通手办", {
    bodyDraw: { x: -44, y: -28, width: 88, height: 56 },
    limbHeight: 17,
    farShoulder: { x: 9, y: -15 },
    nearShoulder: { x: 9, y: 15 },
    arm: { upperLength: 22, forearmLength: 20 },
  }),
  c: style("c", "柔和漫画", {
    bodyDraw: { x: -42, y: -34, width: 84, height: 68 },
    limbHeight: 22,
    farShoulder: { x: 8, y: -16 },
    nearShoulder: { x: 8, y: 16 },
    arm: { upperLength: 22, forearmLength: 21 },
  }),
});

export function resolvePlayerStyleRig(styleId) {
  return PLAYER_STYLE_RIGS[styleId] ?? null;
}

export function buildStyleWeaponReviewCells() {
  return PLAYER_STYLE_IDS.flatMap((styleId) =>
    HANDHELD_WEAPON_IDS.map((weaponId) =>
      Object.freeze({ styleId, weaponId }),
    ),
  );
}
