import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const root = new URL("../src/", import.meta.url);

test("review page exposes controls and a 27-cell matrix host", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("player-style-review.html", root), "utf8"),
    readFile(new URL("player-style-review.css", root), "utf8"),
  ]);
  assert.match(html, /id="styleWeaponMatrix"/);
  assert.match(html, /id="pauseReview"/);
  assert.match(html, /id="reviewDialog"/);
  assert.match(html, /player-style-review\.css/);
  assert.match(html, /player-style-review\.js/);
  assert.match(html, /aria-label="暂停动画"/);
  assert.match(css, /grid-template-columns:\s*repeat\(9/);
  assert.match(css, /review-card\[data-state="error"\]/);
  assert.match(css, /dialog\[open\]/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("review runtime uses official weapons and isolates cell failures", async () => {
  const source = await readFile(
    new URL("player-style-review.js", root),
    "utf8",
  );
  assert.match(source, /buildStyleWeaponReviewCells/);
  assert.match(source, /resolveWeaponVisual/);
  assert.match(source, /resolveWeaponGripPoints/);
  assert.match(source, /resolvePlayerArmPoseForRig/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /drawWeaponModel/);
  assert.match(source, /drawReviewArm/);
  assert.match(source, /drawReviewBody/);
  assert.match(source, /watermelon/);
  assert.match(source, /smoothRecoilRatio/);
  assert.match(source, /PREVIEW_RECOIL_SCALE/);
  assert.match(source, /BODY_FACING_ROTATION/);
  assert.match(
    source,
    /const BODY_FACING_ROTATION = Math\.PI \/ 2;/,
  );
  assert.match(source, /showModal/);
  assert.match(source, /requestAnimationFrame/);
  const farArm = source.indexOf("drawReviewArm(context, cell, pose.far");
  const body = source.lastIndexOf("drawReviewBody(context, cell)");
  const weapon = source.lastIndexOf("drawWeaponModel(");
  const nearArm = source.indexOf("drawReviewArm(context, cell, pose.near");
  assert.ok(farArm >= 0);
  assert.ok(farArm > body);
  assert.ok(weapon > body);
  assert.ok(weapon > farArm);
  assert.ok(nearArm > weapon);
});

test("review matrix is included in hosted build and lint coverage", async () => {
  const [build, lint] = await Promise.all([
    readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/lint.mjs", import.meta.url), "utf8"),
  ]);
  for (const marker of [
    "player-style-review.html",
    "player-style-review.css",
    "player-style-review.js",
    "player-style-rigs.js",
    "playerStyleReviewImages",
    "far-forearm-hand",
    "near-forearm-hand",
  ]) {
    assert.match(build, new RegExp(marker.replaceAll(".", "\\.")));
  }
  assert.match(lint, /src\/player-style-review\.js/);
  assert.match(lint, /src\/player-style-rigs\.js/);
  for (const marker of [
    "PLAYER_STYLE_IDS",
    "PLAYER_STYLE_RIGS",
    "buildStyleWeaponReviewCells",
    "resolvePlayerArmPoseForRig",
    "Promise.allSettled",
  ]) {
    assert.match(lint, new RegExp(marker.replaceAll(".", "\\.")));
  }
});
