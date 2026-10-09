import { HANDHELD_WEAPON_IDS } from "./weapon-visuals.js";

const PIVOTS = Object.freeze({
  pistol: { far: [0.08, 0.5, 0.91, 0.5], near: [0.07, 0.5, 0.92, 0.5] },
  shotgun: { far: [0.06, 0.5, 0.93, 0.5], near: [0.07, 0.5, 0.92, 0.5] },
  rocket: { far: [0.07, 0.5, 0.9, 0.5], near: [0.08, 0.5, 0.91, 0.5] },
  flamethrower: { far: [0.07, 0.5, 0.91, 0.5], near: [0.07, 0.5, 0.92, 0.5] },
  laser: { far: [0.06, 0.5, 0.92, 0.5], near: [0.07, 0.5, 0.92, 0.5] },
  ricochet: { far: [0.06, 0.5, 0.92, 0.5], near: [0.07, 0.5, 0.92, 0.5] },
  lightning: { far: [0.07, 0.5, 0.91, 0.5], near: [0.08, 0.5, 0.91, 0.5] },
  freeze: { far: [0.08, 0.5, 0.91, 0.5], near: [0.08, 0.5, 0.91, 0.5] },
  watermelon: { far: [0.07, 0.5, 0.9, 0.5], near: [0.08, 0.5, 0.9, 0.5] },
});

export function playerWeaponHandImageKey(weaponId, side) {
  return `${weaponId}-${side}-forearm-hand`;
}

export const PLAYER_WEAPON_HAND_PROFILES = Object.freeze(
  Object.fromEntries(
    HANDHELD_WEAPON_IDS.map((weaponId) => [
      weaponId,
      Object.freeze(
        Object.fromEntries(
          ["far", "near"].map((side) => [
            side,
            Object.freeze({
              route: `/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`,
              pivot: Object.freeze(PIVOTS[weaponId][side]),
            }),
          ]),
        ),
      ),
    ]),
  ),
);

export const PLAYER_WEAPON_HAND_ASSET_ENTRIES = Object.freeze(
  HANDHELD_WEAPON_IDS.flatMap((weaponId) =>
    ["far", "near"].map((side) =>
      Object.freeze({
        key: playerWeaponHandImageKey(weaponId, side),
        route: PLAYER_WEAPON_HAND_PROFILES[weaponId][side].route,
      }),
    ),
  ),
);

export function resolvePlayerWeaponHandProfile(weaponId) {
  return PLAYER_WEAPON_HAND_PROFILES[weaponId] ?? null;
}

export function resolvePlayerRigImages(images, weaponId) {
  const profile = resolvePlayerWeaponHandProfile(weaponId);
  if (!profile) return images;
  return {
    ...images,
    farForearm:
      images[playerWeaponHandImageKey(weaponId, "far")] ?? images.farForearm,
    nearForearm:
      images[playerWeaponHandImageKey(weaponId, "near")] ?? images.nearForearm,
  };
}
