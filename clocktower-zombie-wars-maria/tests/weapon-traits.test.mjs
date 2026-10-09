import assert from "node:assert/strict";
import test from "node:test";
import {
  WEAPON_TRAITS,
  availableWeaponTraits,
  createWeaponUpgrades,
  incrementWeaponTrait,
  resolveTraitStat,
  traitAvailable,
  traitLevel,
  weaponStat,
} from "../src/weapon-traits.js";

const IDS = {
  pistol: ["damage", "fire_rate", "bullet_speed", "magazine", "reload", "crit", "pierce", "twin_shot", "execute", "kill_reload"],
  shotgun: ["damage", "spread", "magazine", "reload", "bullet_speed", "close_damage", "pierce", "knockback"],
  rocket: ["damage", "blast_radius", "speed", "fire_rate", "capacity", "supply", "cluster", "burning_ground", "armor_break", "shock_slow"],
  flamethrower: ["damage", "range", "cone", "fire_rate", "capacity", "supply", "burn", "corpse_burst", "heat_armor", "scorched_ground"],
  laser: ["damage", "width", "range", "fire_rate", "capacity", "supply", "prism", "reflect", "boss_focus", "kill_recharge"],
  ricochet: ["damage", "projectiles", "bounces", "speed", "radius", "fire_rate", "bounce_power", "homing", "micro_blast", "split"],
  turret: ["health", "range", "damage", "fire_rate", "speed", "capacity", "twin_barrel", "repair", "grenade_cycle", "heavy_targeting"],
  lightning: ["damage", "chain_range", "retention", "speed", "fire_rate", "capacity", "fork", "paralyze", "kill_arc", "terminal_blast"],
  freeze: ["damage", "blast_radius", "slow_per_hit", "duration", "speed", "capacity", "full_freeze", "shatter", "frost_field", "pierce"],
  watermelon: ["damage", "blast_radius", "charge_time", "speed", "movement_penalty", "capacity", "seed_storm", "crushing", "ripe_core", "juice_field"],
};

const EXPECTED_NUMERIC = {
  pistol: [
    ["damage", "高压弹", "damage", "multiply", 1.2, "伤害 +20%", {}],
    ["fire_rate", "灵敏扳机", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }],
    ["bullet_speed", "高速弹", "bulletSpeed", "multiply", 1.15, "弹速 +15%", {}],
    ["magazine", "扩容弹匣", "magazine", "add", 3, "弹匣 +3", {}],
    ["reload", "快速换匣", "reloadTime", "multiply", 0.85, "换弹时间 -15%", { floorMultiplier: 0.45 }],
    ["crit", "精准射击", "critChance", "add", 0.08, "暴击率 +8%", {}],
  ],
  shotgun: [
    ["damage", "强装火药", "damage", "multiply", 1.12, "单颗伤害 +12%", {}],
    ["spread", "收束枪口", "spread", "multiply", 0.88, "散布角 -12%", {}],
    ["magazine", "扩容弹仓", "magazine", "add", 2, "弹仓 +2", {}],
    ["reload", "熟练装填", "reloadTime", "multiply", 0.88, "换弹时间 -12%", { floorMultiplier: 0.45 }],
    ["bullet_speed", "高速霰弹", "bulletSpeed", "multiply", 1.12, "弹速 +12%", {}],
  ],
  rocket: [
    ["damage", "高爆弹头", "damage", "multiply", 1.2, "爆炸伤害 +20%", {}],
    ["blast_radius", "扩张爆风", "blastRadius", "multiply", 1.15, "爆炸范围 +15%", {}],
    ["speed", "推进燃料", "speed", "multiply", 1.15, "弹速 +15%", {}],
    ["fire_rate", "快速装填", "fireRate", "multiply", 0.88, "射击间隔 -12%", { floorMultiplier: 0.45 }],
    ["capacity", "扩容弹架", "capacity", "add", 2, "携弹上限 +2", {}],
    ["supply", "弹药搜刮", "supplyAmount", "add", 1, "补给数量 +1", {}],
  ],
  flamethrower: [
    ["damage", "高温燃料", "damage", "multiply", 1.18, "伤害 +18%", {}],
    ["range", "增压喷嘴", "range", "multiply", 1.15, "射程 +15%", {}],
    ["cone", "扩散火舌", "cone", "multiply", 1.12, "喷射角度 +12%", {}],
    ["fire_rate", "高速泵机", "fireRate", "multiply", 0.92, "射击间隔 -8%", { floorMultiplier: 0.45 }],
    ["capacity", "加大燃料罐", "capacity", "add", 30, "燃料上限 +30", {}],
    ["supply", "高效补给", "supplyAmount", "add", 20, "补给恢复 +20", {}],
  ],
  laser: [
    ["damage", "聚能光束", "damage", "multiply", 1.2, "伤害 +20%", {}],
    ["width", "宽幅透镜", "width", "multiply", 1.25, "光束宽度 +25%", {}],
    ["range", "延伸镜组", "range", "multiply", 1.15, "射程 +15%", {}],
    ["fire_rate", "快速充能", "fireRate", "multiply", 0.88, "射击间隔 -12%", { floorMultiplier: 0.45 }],
    ["capacity", "电容扩展", "capacity", "add", 2, "携带充能 +2", {}],
    ["supply", "能量回收", "supplyAmount", "add", 1, "补给数量 +1", {}],
  ],
  ricochet: [
    ["damage", "动能弹体", "damage", "multiply", 1.18, "伤害 +18%", {}],
    ["projectiles", "多重弹头", "projectiles", "add", 1, "发射弹数 +1", { maximum: 6 }],
    ["bounces", "超弹材料", "bounces", "add", 2, "反弹次数 +2", {}],
    ["speed", "高速弹芯", "speed", "multiply", 1.15, "弹速 +15%", {}],
    ["radius", "扩大型弹体", "radius", "multiply", 1.15, "碰撞半径 +15%", {}],
    ["fire_rate", "快速复位", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }],
  ],
  turret: [
    ["health", "强化底座", "health", "multiply", 1.25, "最大生命 +25%", {}],
    ["range", "远距瞄具", "range", "multiply", 1.15, "攻击范围 +15%", {}],
    ["damage", "重型弹药", "damage", "multiply", 1.18, "子弹伤害 +18%", {}],
    ["fire_rate", "高速机芯", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }],
    ["speed", "加速枪管", "speed", "multiply", 1.15, "弹速 +15%", {}],
    ["capacity", "部署扩容", "capacity", "add", 1, "携带上限 +1", {}],
  ],
  lightning: [
    ["damage", "淬金箭锋", "damage", "multiply", 1.2, "每支箭伤害 +20%", {}],
    ["chain_range", "展开箭阵", "chainRange", "multiply", 1.15, "箭雨范围尺寸 +15%（最多 1.5 倍）", {}],
    ["retention", "密集箭列", "retention", "add", 0.05, "每次箭雨增加 4 支箭（最多 +12）", { maximum: 0.9 }],
    ["speed", "远距标定", "range", "multiply", 1.15, "落点瞄准距离 +15%", {}],
    ["fire_rate", "快速张弦", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }],
    ["capacity", "箭匣扩容", "capacity", "add", 2, "箭雨弹药上限 +2", {}],
  ],
  freeze: [
    ["damage", "压缩雪球", "damage", "multiply", 1.2, "爆散伤害 +20%", {}],
    ["blast_radius", "寒气扩散", "blastRadius", "multiply", 1.15, "爆散范围 +15%", {}],
    ["slow_per_hit", "深度冻结", "slowPerHit", "add", 0.05, "每次命中减速 +5 个百分点", { maximum: 0.6 }],
    ["duration", "持久寒霜", "duration", "multiply", 1.2, "减速持续时间 +20%", {}],
    ["speed", "冰晶加速", "speed", "multiply", 1.15, "雪球弹速 +15%", {}],
    ["capacity", "雪仓扩容", "capacity", "add", 3, "雪球上限 +3", {}],
  ],
  watermelon: [
    ["damage", "熟透重弹", "damage", "multiply", 1.2, "直击与瓜瓣伤害 +20%", {}],
    ["blast_radius", "巨型果实", "blastRadius", "multiply", 1.15, "瓜瓣扩散距离 +15%", {}],
    ["charge_time", "快速蓄压", "chargeTime", "multiply", 0.88, "满蓄力时间 -12%", { minimum: 0.8 }],
    ["speed", "强力投射", "speed", "multiply", 1.15, "飞行速度 +15%", {}],
    ["movement_penalty", "稳定架势", "movementPenalty", "add", -0.04, "蓄力移动减速降低 4 个百分点", { minimum: 0 }],
    ["capacity", "加大瓜袋", "capacity", "add", 1, "西瓜携带上限 +1", {}],
  ],
};

const EXPECTED_UNIQUE = {
  pistol: [["pierce", "穿甲弹", "额外穿透 2 个敌人"], ["twin_shot", "双发点射", "两枚偏转子弹各造成 70% 伤害"], ["execute", "处决弹", "对低于 20% 生命的非首领敌人伤害 +60%"], ["kill_reload", "趁热装填", "击杀后向当前弹匣补回 1 发"]],
  shotgun: [["close_damage", "近距重击", "150 范围内伤害 +30%"], ["pierce", "穿透钢珠", "每颗弹丸额外穿透 1 个敌人"], ["knockback", "震退射击", "命中推开非首领敌人"]],
  rocket: [["cluster", "子母弹", "爆炸后散出 4 枚 20% 伤害子弹"], ["burning_ground", "燃烧残区", "爆炸处留下 3 秒火焰区"], ["armor_break", "破甲爆破", "对首领和巨尸伤害 +30%"], ["shock_slow", "冲击震荡", "非首领减速 35%，持续 1.5 秒"]],
  flamethrower: [["burn", "持续灼烧", "每秒 25% 伤害，持续 2 秒"], ["corpse_burst", "尸爆引燃", "火焰击杀产生 60% 伤害爆燃"], ["heat_armor", "熔甲高温", "持续命中 1 秒后火焰伤害 +35%"], ["scorched_ground", "焦土喷射", "火舌末端留下 1.5 秒燃烧地面"]],
  laser: [["prism", "棱镜分光", "两侧各生成一条 35% 伤害窄光束"], ["reflect", "镜面反射", "主光束在场地边界反射一次"], ["boss_focus", "首领聚焦", "对首领伤害 +35%"], ["kill_recharge", "击杀回充", "单次击杀至少 4 个敌人返还 1 发"]],
  ricochet: [["bounce_power", "越弹越强", "每次碰撞反弹后伤害 +12%"], ["homing", "目标修正", "碰撞反弹后向最近敌人修正方向"], ["micro_blast", "震荡弹体", "首次命中产生 45 范围微型爆炸"], ["split", "镜像分裂", "第 3 次反弹分裂 2 枚 45% 伤害子弹"]],
  turret: [["twin_barrel", "双联枪管", "额外发射一颗 55% 伤害偏转子弹"], ["repair", "自动维修", "5 秒未受伤后每秒恢复 4% 最大生命"], ["grenade_cycle", "榴弹节拍", "每第 8 发改为 65 范围爆炸弹"], ["heavy_targeting", "重敌锁定", "优先攻击精英和首领并增伤 30%"]],
  lightning: [["fork", "齐射箭阵", "每次箭雨额外增加 12 支箭"], ["paralyze", "震慑箭锋", "命中普通敌人有 12% 概率定身 0.5 秒"], ["kill_arc", "追猎补射", "击杀后在梯形内补射 1 支箭，每轮最多 8 支且不递归"], ["terminal_blast", "碎星箭头", "每支箭落地对 70 范围内其他敌人造成 25% 伤害，仅限梯形内"]],
  freeze: [["full_freeze", "碎冰传染", "小怪冰封死亡或精英碎冰时，为 90 范围敌人增加冰冻值"], ["shatter", "裂冰弹", "命中前冰冻值达到 50% 时伤害 +50%"], ["frost_field", "霜冻区域", "留下 2 秒、20% 独立减速冰面"], ["pierce", "贯穿雪球", "穿透首个敌人并在首次和最终命中各爆散一次"]],
  watermelon: [
    ["seed_storm", "西瓜籽风暴", "碎裂时发射 10 枚各 12% 伤害瓜籽"],
    ["crushing", "碾压飞行", "首个直击目标额外受到 30% 伤害"],
    ["ripe_core", "过熟核心", "满蓄力时瓜瓣伤害提高 50%"],
    ["juice_field", "黏滑瓜汁", "留下 3 秒、25% 非首领减速区"],
  ],
};

test("weapon registry defines ninety-eight immutable weapon-specific traits", () => {
  assert.deepEqual(Object.keys(WEAPON_TRAITS), Object.keys(IDS));
  assert.equal(Object.isFrozen(WEAPON_TRAITS), true);

  for (const [weaponId, ids] of Object.entries(IDS)) {
    const traits = WEAPON_TRAITS[weaponId];
    assert.equal(traits.length, weaponId === "shotgun" ? 8 : 10);
    assert.equal(Object.isFrozen(traits), true);
    assert.deepEqual(traits.map(({ id }) => id), ids);
    assert.equal(new Set(ids).size, traits.length);

    for (const [index, trait] of traits.entries()) {
      assert.equal(Object.isFrozen(trait), true);
      assert.ok(trait.name.trim().length > 0);
      assert.ok(trait.description.trim().length > 0);
      const numericCount = weaponId === "shotgun" ? 5 : 6;
      assert.equal(trait.kind, index < numericCount ? "numeric" : "unique");
      assert.equal(trait.maxLevel, index < numericCount ? 5 : 1);
    }
  }
  assert.equal(Object.values(WEAPON_TRAITS).flat().length, 98);
  assert.equal(
    Object.values(WEAPON_TRAITS).flat().filter(({ kind }) => kind === "unique").length,
    39,
  );
});

test("existing weapon registry preserves every approved numeric value and limit", () => {
  for (const [weaponId, expected] of Object.entries(EXPECTED_NUMERIC)) {
    for (const [index, [id, name, stat, operation, amount, description, limits]] of expected.entries()) {
      assert.deepEqual(WEAPON_TRAITS[weaponId][index], {
        id,
        name,
        kind: "numeric",
        stat,
        operation,
        amount,
        maxLevel: 5,
        description,
        ...limits,
      });
    }
  }
});

test("existing weapon registry preserves every approved unique description", () => {
  for (const [weaponId, expected] of Object.entries(EXPECTED_UNIQUE)) {
    for (const [offset, [id, name, description]] of expected.entries()) {
      assert.deepEqual(WEAPON_TRAITS[weaponId][offset + EXPECTED_NUMERIC[weaponId].length], {
        id,
        name,
        kind: "unique",
        maxLevel: 1,
        description,
      });
    }
  }
});

test("weapon upgrade state is complete, independent, and read defensively", () => {
  const first = createWeaponUpgrades();
  const second = createWeaponUpgrades();
  assert.deepEqual(Object.keys(first), Object.keys(WEAPON_TRAITS));
  for (const [weaponId, traits] of Object.entries(WEAPON_TRAITS)) {
    assert.deepEqual(Object.keys(first[weaponId]), traits.map(({ id }) => id));
    assert.ok(Object.values(first[weaponId]).every((level) => level === 0));
    assert.notEqual(first[weaponId], second[weaponId]);
  }
  first.pistol.damage = 2;
  assert.equal(second.pistol.damage, 0);
  assert.equal(traitLevel(first, "pistol", "damage"), 2);
  assert.equal(traitLevel(first, "pistol", "missing"), 0);
  assert.equal(traitLevel({ pistol: { damage: -1 } }, "pistol", "damage"), 0);
});

test("trait increments are immutable, capped, and report capacity fill", () => {
  const upgrades = createWeaponUpgrades();
  const damage = incrementWeaponTrait(upgrades, "pistol", "damage");
  assert.equal(damage.upgrades.pistol.damage, 1);
  assert.equal(damage.deltaCapacity, 0);
  assert.equal(upgrades.pistol.damage, 0);
  assert.notEqual(damage.upgrades, upgrades);
  assert.notEqual(damage.upgrades.pistol, upgrades.pistol);
  assert.equal(damage.upgrades.shotgun, upgrades.shotgun);

  const magazine = incrementWeaponTrait(upgrades, "pistol", "magazine");
  assert.equal(magazine.upgrades.pistol.magazine, 1);
  assert.equal(magazine.deltaCapacity, 3);
  const capacity = incrementWeaponTrait(upgrades, "rocket", "capacity");
  assert.equal(capacity.upgrades.rocket.capacity, 1);
  assert.equal(capacity.deltaCapacity, 2);

  const capped = createWeaponUpgrades();
  capped.pistol.damage = 5;
  capped.pistol.pierce = 1;
  assert.deepEqual(incrementWeaponTrait(capped, "pistol", "damage"), {
    upgrades: capped,
    deltaCapacity: 0,
  });
  assert.deepEqual(incrementWeaponTrait(capped, "pistol", "pierce"), {
    upgrades: capped,
    deltaCapacity: 0,
  });
  assert.deepEqual(incrementWeaponTrait(capped, "tank", "damage"), {
    upgrades: capped,
    deltaCapacity: 0,
  });
});

test("numeric trait resolution handles add, multiply, floors, caps, and invalid levels", () => {
  assert.equal(resolveTraitStat(100, WEAPON_TRAITS.pistol[0], 2), 144);
  assert.ok(
    Math.abs(resolveTraitStat(1, WEAPON_TRAITS.pistol[1], 5) - 0.59049) < 1e-12,
  );
  assert.equal(resolveTraitStat(10, WEAPON_TRAITS.ricochet[1], 5), 6);
  assert.equal(resolveTraitStat(12, WEAPON_TRAITS.pistol[3], 2), 18);
  assert.equal(resolveTraitStat(100, WEAPON_TRAITS.pistol[0], 0), 100);
  assert.equal(resolveTraitStat(100, WEAPON_TRAITS.pistol[0], -1), 100);
  assert.equal(resolveTraitStat(100, null, 2), 100);

  const floorTrait = { operation: "multiply", amount: 0.5, floorMultiplier: 0.45 };
  assert.equal(resolveTraitStat(1, floorTrait, 5), 0.45);
});

test("trait availability and live stat lookup respect each weapon level", () => {
  assert.equal(traitAvailable({ pierce: 1 }, WEAPON_TRAITS.pistol[6]), false);
  assert.equal(traitAvailable({ pierce: 0 }, WEAPON_TRAITS.pistol[6]), true);
  assert.equal(traitAvailable({ damage: 4 }, WEAPON_TRAITS.pistol[0]), true);
  assert.equal(traitAvailable({ damage: 5 }, WEAPON_TRAITS.pistol[0]), false);

  const upgrades = createWeaponUpgrades();
  upgrades.pistol.damage = 2;
  assert.equal(weaponStat(100, upgrades, "pistol", "damage"), 144);
  assert.equal(weaponStat(100, upgrades, "shotgun", "damage"), 100);
  assert.equal(weaponStat(100, upgrades, "pistol", "missing"), 100);
  assert.equal(availableWeaponTraits(upgrades, "pistol").length, 10);
  upgrades.pistol.pierce = 1;
  assert.equal(availableWeaponTraits(upgrades, "pistol").length, 9);
});
