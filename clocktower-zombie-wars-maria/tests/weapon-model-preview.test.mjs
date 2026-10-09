import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("weapon preview uses the shared nine profiles and eight aim directions", async () => {
  const [html, css, source, build, lint] = await Promise.all([
    readFile(new URL("../src/weapon-model-preview.html", import.meta.url), "utf8"),
    readFile(new URL("../src/weapon-model-preview.css", import.meta.url), "utf8"),
    readFile(new URL("../src/weapon-model-preview.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/lint.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="weaponPreviewGrid"/);
  assert.match(html, /id="previousDirection"/);
  assert.match(html, /id="nextDirection"/);
  assert.match(html, /id="toggleAuto"/);
  assert.match(html, /id="showAimMode"/);
  assert.match(html, /id="showFrontMode"/);
  assert.match(html, /id="directionControls"/);
  assert.match(html, /weapon-model-preview\.js/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /\.mode-controls/);
  assert.match(css, /\[aria-pressed="true"\]/);
  assert.match(css, /\[hidden\]/);
  assert.match(source, /HANDHELD_WEAPON_IDS/);
  assert.match(source, /WEAPON_VISUALS/);
  assert.match(source, /PLAYER_RIG_ASSETS/);
  assert.match(source, /PLAYER_WEAPON_HAND_ASSET_ENTRIES/);
  assert.match(source, /resolvePlayerWeaponHandProfile/);
  assert.match(source, /resolvePlayerRigImages/);
  assert.match(source, /drawWeaponModel/);
  assert.match(source, /resolveWeaponGripPoints/);
  assert.match(source, /resolvePlayerArmPose/);
  assert.match(
    source,
    /const PREVIEW_RECOIL_SCALE = PLAYER_RIG_VISUAL\.recoilScale/,
  );
  assert.match(source, /function smoothRecoilRatio/);
  assert.match(source, /weaponId === "watermelon" \? 0 : recoilRatio/);
  assert.match(source, /drawPlayerArm/);
  assert.match(source, /drawPlayerBody/);
  assert.match(source, /Object\.entries\(PLAYER_RIG_ASSETS\)/);
  assert.match(source, /for \(const weaponId of HANDHELD_WEAPON_IDS\)/);
  assert.match(source, /Object\.entries\(PLAYER_RIG_ASSETS\)/);
  assert.match(source, /PLAYER_WEAPON_HAND_ASSET_ENTRIES\.map/);
  assert.match(source, /await import\("\/player-front-preview\.js"\)/);
  assert.match(
    source,
    /frontPreview\?\.resolvePreviewMode\(location\.search\)/,
  );
  assert.match(source, /showFrontMode\.disabled = true/);
  assert.match(source, /function setPreviewMode/);
  assert.match(source, /previewMode === "front"/);
  assert.match(source, /resolvePlayerArmPoseForRig/);
  assert.match(source, /offsetFrontPreviewGrips/);
  assert.match(source, /drawFrontPlayerBody/);
  assert.match(source, /drawFrontFaceDetails/);
  const frontBodyDraw = source.indexOf(
    "frontPreview.drawFrontPlayerBody(context, activeRigImages)",
  );
  const frontFarArmDraw = source.indexOf("frontPose.far", frontBodyDraw);
  const frontWeaponDraw = source.indexOf(
    "FRONT_PREVIEW_VISUAL.weaponOffset.x",
    frontFarArmDraw,
  );
  const frontNearArmDraw = source.indexOf("frontPose.near", frontWeaponDraw);
  const frontFaceDraw = source.indexOf(
    "frontPreview.drawFrontFaceDetails(context)",
  );
  assert.ok(frontBodyDraw >= 0);
  assert.ok(frontFarArmDraw > frontBodyDraw);
  assert.ok(frontWeaponDraw > frontFarArmDraw);
  assert.ok(frontNearArmDraw > frontWeaponDraw);
  assert.ok(frontFaceDraw > frontNearArmDraw);
  const bodyDraw = source.indexOf("drawPlayerBody(context, activeRigImages)");
  const farDraw = source.indexOf(
    'drawPlayerArm(context, activeRigImages, pose.far, "far", handProfile)',
  );
  const weaponDraw = source.indexOf(
    "drawWeaponModel(context, image, visual",
    farDraw,
  );
  const nearDraw = source.indexOf(
    'drawPlayerArm(context, activeRigImages, pose.near, "near", handProfile)',
  );
  assert.ok(bodyDraw >= 0);
  assert.ok(farDraw > bodyDraw);
  assert.ok(weaponDraw > farDraw);
  assert.ok(nearDraw > weaponDraw);
  assert.doesNotMatch(source, /maria-topdown-clean\.png/);
  const directionBlock = source.match(
    /const AIM_DIRECTIONS = Object\.freeze\(\[([\s\S]*?)\]\);/,
  );
  assert.ok(directionBlock);
  assert.equal([...directionBlock[1].matchAll(/angle:/g)].length, 8);
  assert.match(build, /src\/player-front-preview\.js/);
  assert.match(lint, /src\/player-front-preview\.js/);
});
