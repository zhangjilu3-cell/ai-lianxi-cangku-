export const HANDHELD_WEAPON_IDS = Object.freeze([
  "pistol",
  "shotgun",
  "rocket",
  "flamethrower",
  "laser",
  "ricochet",
  "lightning",
  "freeze",
  "watermelon",
]);

export const SUPPORTED_WEAPON_EFFECTS = new Set([
  "none",
  "heat",
  "crystal",
  "ricochet",
  "tesla",
  "frost",
  "watermelon",
]);

export const WEAPON_VISUALS = Object.freeze({
  pistol: {
    src: "/weapons/pistol.png",
    width: 54,
    height: 28,
    gripX: 0.28,
    gripY: 0.68,
    supportGripX: 0.44,
    supportGripY: 0.56,
    muzzleX: 0.94,
    muzzleY: 0.4,
    playerOffsetX: 0,
    playerOffsetY: 1,
    recoilDistance: 4,
    recoilTilt: 0.04,
    recoilDuration: 0.1,
    feedbackDuration: 0.08,
    effectType: "none",
  },
  shotgun: {
    src: "/weapons/shotgun.png",
    width: 90,
    height: 34,
    gripX: 0.25,
    gripY: 0.62,
    supportGripX: 0.49,
    supportGripY: 0.48,
    muzzleX: 0.97,
    muzzleY: 0.39,
    playerOffsetX: -1,
    playerOffsetY: -1,
    recoilDistance: 10,
    recoilTilt: 0.1,
    recoilDuration: 0.18,
    feedbackDuration: 0.12,
    effectType: "none",
  },
  rocket: {
    src: "/weapons/rocket.png",
    width: 96,
    height: 42,
    gripX: 0.275,
    gripY: 0.57,
    supportGripX: 0.53,
    supportGripY: 0.54,
    muzzleX: 0.93,
    muzzleY: 0.45,
    playerOffsetX: -2,
    playerOffsetY: -2,
    recoilDistance: 12,
    recoilTilt: 0.12,
    recoilDuration: 0.22,
    feedbackDuration: 0.16,
    effectType: "none",
  },
  flamethrower: {
    src: "/weapons/flamethrower.png",
    width: 88,
    height: 40,
    gripX: 0.27,
    gripY: 0.61,
    supportGripX: 0.48,
    supportGripY: 0.55,
    muzzleX: 0.97,
    muzzleY: 0.43,
    playerOffsetX: -1,
    playerOffsetY: -1,
    recoilDistance: 5,
    recoilTilt: 0.04,
    recoilDuration: 0.11,
    feedbackDuration: 0.16,
    effectType: "none",
  },
  laser: {
    src: "/weapons/laser.png",
    width: 86,
    height: 36,
    gripX: 0.23,
    gripY: 0.605,
    supportGripX: 0.46,
    supportGripY: 0.56,
    muzzleX: 0.96,
    muzzleY: 0.42,
    playerOffsetX: 0,
    playerOffsetY: -1,
    recoilDistance: 5,
    recoilTilt: 0.03,
    recoilDuration: 0.12,
    feedbackDuration: 0.2,
    effectType: "crystal",
  },
  ricochet: {
    src: "/weapons/ricochet.png",
    width: 92,
    height: 42,
    gripX: 0.24,
    gripY: 0.58,
    supportGripX: 0.5,
    supportGripY: 0.54,
    muzzleX: 0.96,
    muzzleY: 0.427,
    playerOffsetX: -1,
    playerOffsetY: -2,
    recoilDistance: 7,
    recoilTilt: 0.06,
    recoilDuration: 0.15,
    feedbackDuration: 0.18,
    effectType: "ricochet",
  },
  lightning: {
    src: "/weapons/lightning.png",
    width: 96,
    height: 34,
    gripX: 0.222,
    gripY: 0.585,
    supportGripX: 0.485,
    supportGripY: 0.578,
    muzzleX: 0.98,
    muzzleY: 0.47,
    playerOffsetX: 0,
    playerOffsetY: -1,
    recoilDistance: 6,
    recoilTilt: 0.04,
    recoilDuration: 0.13,
    feedbackDuration: 0.2,
    effectType: "none",
  },
  freeze: {
    src: "/weapons/freeze.png",
    width: 84,
    height: 48,
    gripX: 0.25,
    gripY: 0.66,
    supportGripX: 0.46,
    supportGripY: 0.58,
    muzzleX: 0.96,
    muzzleY: 0.5,
    playerOffsetX: -1,
    playerOffsetY: -4,
    recoilDistance: 7,
    recoilTilt: 0.06,
    recoilDuration: 0.16,
    feedbackDuration: 0.24,
    effectType: "frost",
  },
  watermelon: {
    src: "/weapons/watermelon.png",
    width: 90,
    height: 54,
    gripX: 0.25,
    gripY: 0.68,
    supportGripX: 0.44,
    supportGripY: 0.59,
    muzzleX: 0.95,
    muzzleY: 0.51,
    playerOffsetX: -2,
    playerOffsetY: -5,
    recoilDistance: 11,
    recoilTilt: 0.09,
    recoilDuration: 0.21,
    feedbackDuration: 0.24,
    effectType: "watermelon",
  },
});

export function resolveWeaponVisual(weaponId) {
  return WEAPON_VISUALS[weaponId] ?? null;
}

export function triggerWeaponVisual(player, weaponId) {
  const visual = resolveWeaponVisual(weaponId);
  if (!player || !visual) return false;
  player.weaponVisualId = weaponId;
  player.weaponRecoil = visual.recoilDuration;
  player.weaponFeedback = visual.feedbackDuration;
  return true;
}

export function tickWeaponVisual(player, dt) {
  if (!player) return false;
  const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
  player.weaponRecoil = Math.max(0, (player.weaponRecoil ?? 0) - elapsed);
  player.weaponFeedback = Math.max(0, (player.weaponFeedback ?? 0) - elapsed);
  return player.weaponRecoil > 0 || player.weaponFeedback > 0;
}

export function weaponVisualRatios(player, weaponId) {
  const visual = resolveWeaponVisual(weaponId);
  if (!player || !visual || player.weaponVisualId !== weaponId) {
    return { recoil: 0, feedback: 0 };
  }
  return {
    recoil:
      visual.recoilDuration > 0
        ? Math.min(1, Math.max(0, player.weaponRecoil / visual.recoilDuration))
        : 0,
    feedback:
      visual.feedbackDuration > 0
        ? Math.min(1, Math.max(0, player.weaponFeedback / visual.feedbackDuration))
        : 0,
  };
}
