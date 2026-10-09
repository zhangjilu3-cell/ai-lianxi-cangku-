import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import test from "node:test";
import assert from "node:assert/strict";
import {
  HANDHELD_WEAPON_IDS,
  WEAPON_VISUALS,
} from "../src/weapon-visuals.js";
import { PLAYER_RIG_ASSETS } from "../src/player-arm-rig.js";
import { PLAYER_WEAPON_HAND_ASSET_ENTRIES } from "../src/player-weapon-hands.js";
import {
  PLAYER_STYLE_IDS,
  PLAYER_STYLE_RIGS,
} from "../src/player-style-rigs.js";

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbaPng(buffer) {
  assert.equal(buffer.subarray(0, 8).equals(signature), true, "PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
    if (type === "IEND") break;
  }
  assert.equal(bitDepth, 8, "PNG must use 8-bit channels");
  assert.equal(colorType, 6, "PNG must be RGBA");
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const compressed = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = compressed[input];
    input += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = compressed[input + x];
      const output = y * stride + x;
      const left = x >= bytesPerPixel ? pixels[output - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[output - stride] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[output - stride - bytesPerPixel]
          : 0;
      if (filter === 0) pixels[output] = raw;
      else if (filter === 1) pixels[output] = (raw + left) & 255;
      else if (filter === 2) pixels[output] = (raw + above) & 255;
      else if (filter === 3) {
        pixels[output] = (raw + Math.floor((left + above) / 2)) & 255;
      } else if (filter === 4) {
        pixels[output] = (raw + paeth(left, above, upperLeft)) & 255;
      } else {
        assert.fail("unsupported PNG filter " + filter);
      }
    }
    input += stride;
  }
  return {
    width,
    height,
    alphaAt(x, y) {
      return pixels[(y * width + x) * 4 + 3];
    },
    rgbaAt(x, y) {
      const offset = (y * width + x) * 4;
      return [
        pixels[offset],
        pixels[offset + 1],
        pixels[offset + 2],
        pixels[offset + 3],
      ];
    },
    hasVisiblePixel() {
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) return true;
      }
      return false;
    },
    visibleBounds(minAlpha = 0) {
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[(y * width + x) * 4 + 3] <= minAlpha) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      return { minX, minY, maxX, maxY };
    },
  };
}

async function readProjectFile(relativePath) {
  return readFile(new URL("../" + relativePath, import.meta.url));
}

function hasVisiblePixelNear(png, normalizedX, normalizedY, radius = 4) {
  const centerX = Math.round(normalizedX * (png.width - 1));
  const centerY = Math.round(normalizedY * (png.height - 1));
  for (
    let y = Math.max(0, centerY - radius);
    y <= Math.min(png.height - 1, centerY + radius);
    y += 1
  ) {
    for (
      let x = Math.max(0, centerX - radius);
      x <= Math.min(png.width - 1, centerX + radius);
      x += 1
    ) {
      if (png.alphaAt(x, y) > 0) return true;
    }
  }
  return false;
}

function visibleColorRatio(png, predicate) {
  let visible = 0;
  let matching = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const [red, green, blue, alpha] = png.rgbaAt(x, y);
      if (alpha <= 32) continue;
      visible += 1;
      if (predicate(red, green, blue)) matching += 1;
    }
  }
  return visible ? matching / visible : 0;
}

test("clean Maria remains a same-size transparent edit and preserves the original", async () => {
  const original = await readProjectFile("public/maria-topdown.png");
  const clean = await readProjectFile("public/maria-topdown-clean.png");
  const originalPng = decodeRgbaPng(original);
  const cleanPng = decodeRgbaPng(clean);
  assert.equal(cleanPng.width, originalPng.width);
  assert.equal(cleanPng.height, originalPng.height);
  assert.equal(cleanPng.hasVisiblePixel(), true);
  assert.notEqual(
    createHash("sha256").update(clean).digest("hex"),
    createHash("sha256").update(original).digest("hex"),
  );
});

test("nine weapon PNGs are non-empty unique RGBA images with transparent corners", async () => {
  const hashes = new Set();
  for (const id of HANDHELD_WEAPON_IDS) {
    const relativePath = "public" + WEAPON_VISUALS[id].src;
    const buffer = await readProjectFile(relativePath);
    const png = decodeRgbaPng(buffer);
    assert.ok(png.width >= 256 && png.width <= 2048, id + " width");
    assert.ok(png.height >= 256 && png.height <= 2048, id + " height");
    assert.equal(png.hasVisiblePixel(), true, id + " visible body");
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1],
    ]) {
      assert.equal(png.alphaAt(x, y), 0, id + " transparent corner");
    }
    hashes.add(createHash("sha256").update(buffer).digest("hex"));
  }
  assert.equal(hashes.size, HANDHELD_WEAPON_IDS.length);
});

test("ricochet art is a horizontal graphite amethyst prism gun", async () => {
  const buffer = await readProjectFile("public/weapons/ricochet.png");
  const png = decodeRgbaPng(buffer);
  assert.deepEqual([png.width, png.height], [1536, 1024]);
  const bounds = png.visibleBounds(32);
  const visibleWidth = bounds.maxX - bounds.minX + 1;
  const visibleHeight = bounds.maxY - bounds.minY + 1;
  const silhouetteRatio = visibleWidth / visibleHeight;
  assert.ok(
    silhouetteRatio >= 2.15,
    "horizontal gun silhouette " + silhouetteRatio.toFixed(3),
  );
  const graphite = visibleColorRatio(
    png,
    (red, green, blue) =>
      Math.max(red, green, blue) - Math.min(red, green, blue) <= 42 &&
      Math.max(red, green, blue) <= 175,
  );
  const amethyst = visibleColorRatio(
    png,
    (red, green, blue) => red >= 55 && blue >= 90 && blue > green * 1.08,
  );
  const cyan = visibleColorRatio(
    png,
    (red, green, blue) => green >= 105 && blue >= 105 && green > red * 1.15,
  );
  assert.ok(graphite >= 0.12, "graphite load-bearing body");
  assert.ok(amethyst >= 0.015, "amethyst prism core");
  assert.ok(cyan >= 0.004, "restrained cyan energy path");
  const visual = WEAPON_VISUALS.ricochet;
  for (const [label, x, y] of [
    ["main grip", visual.gripX, visual.gripY],
    ["support grip", visual.supportGripX, visual.supportGripY],
    ["muzzle", visual.muzzleX, visual.muzzleY],
  ]) {
    assert.equal(
      hasVisiblePixelNear(png, x, y, 7),
      true,
      label + " visible contact",
    );
  }
});

test("every main and support grip touches visible weapon structure", async () => {
  const missed = [];
  for (const id of HANDHELD_WEAPON_IDS) {
    const visual = WEAPON_VISUALS[id];
    const buffer = await readProjectFile("public" + visual.src);
    const png = decodeRgbaPng(buffer);
    for (const [side, x, y] of [
      ["main", visual.gripX, visual.gripY],
      ["support", visual.supportGripX, visual.supportGripY],
    ]) {
      if (!hasVisiblePixelNear(png, x, y)) {
        missed.push(`${id} ${side} grip ${x},${y}`);
      }
    }
  }
  assert.deepEqual(missed, [], "grips must touch visible weapon pixels");
});

test("five Maria rig PNGs are unique transparent RGBA layers", async () => {
  const hashes = new Set();
  for (const [id, route] of Object.entries(PLAYER_RIG_ASSETS)) {
    const buffer = await readProjectFile("public" + route);
    const png = decodeRgbaPng(buffer);
    assert.equal(png.hasVisiblePixel(), true, id + " visible pixels");
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1],
    ]) {
      assert.equal(png.alphaAt(x, y), 0, id + " transparent corner");
    }
    if (id === "body") {
      assert.deepEqual([png.width, png.height], [405, 472]);
    } else {
      assert.ok(png.width >= 96 && png.width <= 1024, id + " width");
      assert.ok(png.height >= 48 && png.height <= 512, id + " height");
      assert.ok(png.width > png.height, id + " horizontal orientation");
      const bounds = png.visibleBounds();
      assert.ok(
        bounds.maxX - bounds.minX >= png.width * 0.65,
        id + " visible horizontal span",
      );
    }
    hashes.add(createHash("sha256").update(buffer).digest("hex"));
  }
  assert.equal(hashes.size, Object.keys(PLAYER_RIG_ASSETS).length);
});

test("production player rig promotes approved Q arcade style A", async () => {
  const pairs = [
    ["maria-body.png", "body.png"],
    ["far-upper-arm.png", "far-upper-arm.png"],
    ["near-upper-arm.png", "near-upper-arm.png"],
  ];
  for (const [productionName, reviewName] of pairs) {
    const production = await readProjectFile("public/player-rig/" + productionName);
    const approved = await readProjectFile(
      "public/player-style-review/a/" + reviewName,
    );
    assert.equal(
      createHash("sha256").update(production).digest("hex"),
      createHash("sha256").update(approved).digest("hex"),
      productionName,
    );
  }
  for (const side of ["far", "near"]) {
    const production = await readProjectFile(
      `public/player-rig/${side}-forearm-hand.png`,
    );
    const pistol = await readProjectFile(
      `public/player-rig/weapons/pistol/${side}-forearm-hand.png`,
    );
    assert.equal(
      createHash("sha256").update(production).digest("hex"),
      createHash("sha256").update(pistol).digest("hex"),
      side + " pistol fallback",
    );
  }
});

test("weapon hand layers are transparent horizontal visible and unique", async () => {
  const hashes = new Set();
  for (const entry of PLAYER_WEAPON_HAND_ASSET_ENTRIES) {
    const buffer = await readProjectFile("public" + entry.route);
    const png = decodeRgbaPng(buffer);
    assert.equal(png.width > png.height, true, entry.route + " horizontal");
    assert.equal(png.hasVisiblePixel(), true, entry.route + " visible pixels");
    for (const [x, y] of [
      [0, 0],
      [png.width - 1, 0],
      [0, png.height - 1],
      [png.width - 1, png.height - 1],
    ]) {
      assert.equal(png.alphaAt(x, y), 0, entry.route + " transparent corner");
    }
    const bounds = png.visibleBounds();
    assert.ok(
      bounds.maxX - bounds.minX >= png.width * 0.65,
      entry.route + " visible horizontal span",
    );
    hashes.add(createHash("sha256").update(buffer).digest("hex"));
  }
  assert.equal(hashes.size, 18, "every weapon side needs distinct art");
});

test("three player styles provide fifteen unique transparent rig layers", async () => {
  const hashes = new Set();
  for (const styleId of PLAYER_STYLE_IDS) {
    const style = PLAYER_STYLE_RIGS[styleId];
    for (const [layerId, route] of Object.entries(style.assets)) {
      const buffer = await readProjectFile("public" + route);
      const png = decodeRgbaPng(buffer);
      assert.equal(png.hasVisiblePixel(), true, styleId + ":" + layerId);
      for (const [x, y] of [
        [0, 0],
        [png.width - 1, 0],
        [0, png.height - 1],
        [png.width - 1, png.height - 1],
      ]) {
        assert.equal(
          png.alphaAt(x, y),
          0,
          styleId + ":" + layerId + " corner",
        );
      }
      if (layerId !== "body") {
        assert.ok(
          png.width > png.height,
          styleId + ":" + layerId + " horizontal",
        );
      }
      hashes.add(createHash("sha256").update(buffer).digest("hex"));
    }
  }
  assert.equal(hashes.size, 15);
});

test("build and lint include weapon modules previews and every final image", async () => {
  const [build, lint] = await Promise.all([
    readProjectFile("scripts/build.mjs").then((buffer) => buffer.toString("utf8")),
    readProjectFile("scripts/lint.mjs").then((buffer) => buffer.toString("utf8")),
  ]);
  for (const marker of [
    "weapon-visuals.js",
    "player-weapon-renderer.js",
    "player-arm-rig.js",
    "player-weapon-hands.js",
    "weapon-model-preview.html",
    "weapon-model-preview.css",
    "weapon-model-preview.js",
    "player-style-review.html",
    "player-style-review.css",
    "player-style-review.js",
    "player-style-rigs.js",
    "playerStyleReviewImages",
    "playerWeaponHandImageAssets",
    "player-rig/maria-body.png",
    "player-rig/far-upper-arm.png",
    "player-rig/far-forearm-hand.png",
    "player-rig/near-upper-arm.png",
    "player-rig/near-forearm-hand.png",
  ]) {
    assert.match(build, new RegExp(marker.replaceAll(".", "\\.")));
  }
  for (const id of HANDHELD_WEAPON_IDS) {
    assert.match(build, new RegExp('"' + id + '"'));
  }
  assert.match(build, /"\/weapons\/" \+ weaponId \+ "\.png"/);
  assert.match(build, /"public\/weapons\/" \+ weaponId \+ "\.png"/);
  assert.match(lint, /src\/weapon-visuals\.js/);
  assert.match(lint, /src\/player-weapon-renderer\.js/);
  assert.match(lint, /src\/player-arm-rig\.js/);
  assert.match(lint, /src\/player-weapon-hands\.js/);
  assert.match(lint, /src\/weapon-model-preview\.js/);
  assert.match(lint, /src\/player-style-review\.js/);
  assert.match(lint, /src\/player-style-rigs\.js/);
});
