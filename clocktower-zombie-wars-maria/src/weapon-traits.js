const numeric = (id, name, stat, operation, amount, description, limits = {}) =>
  Object.freeze({
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

const unique = (id, name, description) =>
  Object.freeze({ id, name, kind: "unique", maxLevel: 1, description });

export const WEAPON_TRAITS = Object.freeze({
  pistol: Object.freeze([
    numeric("damage", "高压弹", "damage", "multiply", 1.2, "伤害 +20%"),
    numeric("fire_rate", "灵敏扳机", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }),
    numeric("bullet_speed", "高速弹", "bulletSpeed", "multiply", 1.15, "弹速 +15%"),
    numeric("magazine", "扩容弹匣", "magazine", "add", 3, "弹匣 +3"),
    numeric("reload", "快速换匣", "reloadTime", "multiply", 0.85, "换弹时间 -15%", { floorMultiplier: 0.45 }),
    numeric("crit", "精准射击", "critChance", "add", 0.08, "暴击率 +8%"),
    unique("pierce", "穿甲弹", "额外穿透 2 个敌人"),
    unique("twin_shot", "双发点射", "两枚偏转子弹各造成 70% 伤害"),
    unique("execute", "处决弹", "对低于 20% 生命的非首领敌人伤害 +60%"),
    unique("kill_reload", "趁热装填", "击杀后向当前弹匣补回 1 发"),
  ]),
  shotgun: Object.freeze([
    numeric("damage", "强装火药", "damage", "multiply", 1.12, "单颗伤害 +12%"),
    numeric("spread", "收束枪口", "spread", "multiply", 0.88, "散布角 -12%"),
    numeric("magazine", "扩容弹仓", "magazine", "add", 2, "弹仓 +2"),
    numeric("reload", "熟练装填", "reloadTime", "multiply", 0.88, "换弹时间 -12%", { floorMultiplier: 0.45 }),
    numeric("bullet_speed", "高速霰弹", "bulletSpeed", "multiply", 1.12, "弹速 +12%"),
    unique("close_damage", "近距重击", "150 范围内伤害 +30%"),
    unique("pierce", "穿透钢珠", "每颗弹丸额外穿透 1 个敌人"),
    unique("knockback", "震退射击", "命中推开非首领敌人"),
  ]),
  rocket: Object.freeze([
    numeric("damage", "高爆弹头", "damage", "multiply", 1.2, "爆炸伤害 +20%"),
    numeric("blast_radius", "扩张爆风", "blastRadius", "multiply", 1.15, "爆炸范围 +15%"),
    numeric("speed", "推进燃料", "speed", "multiply", 1.15, "弹速 +15%"),
    numeric("fire_rate", "快速装填", "fireRate", "multiply", 0.88, "射击间隔 -12%", { floorMultiplier: 0.45 }),
    numeric("capacity", "扩容弹架", "capacity", "add", 2, "携弹上限 +2"),
    numeric("supply", "弹药搜刮", "supplyAmount", "add", 1, "补给数量 +1"),
    unique("cluster", "子母弹", "爆炸后散出 4 枚 20% 伤害子弹"),
    unique("burning_ground", "燃烧残区", "爆炸处留下 3 秒火焰区"),
    unique("armor_break", "破甲爆破", "对首领和巨尸伤害 +30%"),
    unique("shock_slow", "冲击震荡", "非首领减速 35%，持续 1.5 秒"),
  ]),
  flamethrower: Object.freeze([
    numeric("damage", "高温燃料", "damage", "multiply", 1.18, "伤害 +18%"),
    numeric("range", "增压喷嘴", "range", "multiply", 1.15, "射程 +15%"),
    numeric("cone", "扩散火舌", "cone", "multiply", 1.12, "喷射角度 +12%"),
    numeric("fire_rate", "高速泵机", "fireRate", "multiply", 0.92, "射击间隔 -8%", { floorMultiplier: 0.45 }),
    numeric("capacity", "加大燃料罐", "capacity", "add", 30, "燃料上限 +30"),
    numeric("supply", "高效补给", "supplyAmount", "add", 20, "补给恢复 +20"),
    unique("burn", "持续灼烧", "每秒 25% 伤害，持续 2 秒"),
    unique("corpse_burst", "尸爆引燃", "火焰击杀产生 60% 伤害爆燃"),
    unique("heat_armor", "熔甲高温", "持续命中 1 秒后火焰伤害 +35%"),
    unique("scorched_ground", "焦土喷射", "火舌末端留下 1.5 秒燃烧地面"),
  ]),
  laser: Object.freeze([
    numeric("damage", "聚能光束", "damage", "multiply", 1.2, "伤害 +20%"),
    numeric("width", "宽幅透镜", "width", "multiply", 1.25, "光束宽度 +25%"),
    numeric("range", "延伸镜组", "range", "multiply", 1.15, "射程 +15%"),
    numeric("fire_rate", "快速充能", "fireRate", "multiply", 0.88, "射击间隔 -12%", { floorMultiplier: 0.45 }),
    numeric("capacity", "电容扩展", "capacity", "add", 2, "携带充能 +2"),
    numeric("supply", "能量回收", "supplyAmount", "add", 1, "补给数量 +1"),
    unique("prism", "棱镜分光", "两侧各生成一条 35% 伤害窄光束"),
    unique("reflect", "镜面反射", "主光束在场地边界反射一次"),
    unique("boss_focus", "首领聚焦", "对首领伤害 +35%"),
    unique("kill_recharge", "击杀回充", "单次击杀至少 4 个敌人返还 1 发"),
  ]),
  ricochet: Object.freeze([
    numeric("damage", "动能弹体", "damage", "multiply", 1.18, "伤害 +18%"),
    numeric("projectiles", "多重弹头", "projectiles", "add", 1, "发射弹数 +1", { maximum: 6 }),
    numeric("bounces", "超弹材料", "bounces", "add", 2, "反弹次数 +2"),
    numeric("speed", "高速弹芯", "speed", "multiply", 1.15, "弹速 +15%"),
    numeric("radius", "扩大型弹体", "radius", "multiply", 1.15, "碰撞半径 +15%"),
    numeric("fire_rate", "快速复位", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }),
    unique("bounce_power", "越弹越强", "每次碰撞反弹后伤害 +12%"),
    unique("homing", "目标修正", "碰撞反弹后向最近敌人修正方向"),
    unique("micro_blast", "震荡弹体", "首次命中产生 45 范围微型爆炸"),
    unique("split", "镜像分裂", "第 3 次反弹分裂 2 枚 45% 伤害子弹"),
  ]),
  turret: Object.freeze([
    numeric("health", "强化底座", "health", "multiply", 1.25, "最大生命 +25%"),
    numeric("range", "远距瞄具", "range", "multiply", 1.15, "攻击范围 +15%"),
    numeric("damage", "重型弹药", "damage", "multiply", 1.18, "子弹伤害 +18%"),
    numeric("fire_rate", "高速机芯", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }),
    numeric("speed", "加速枪管", "speed", "multiply", 1.15, "弹速 +15%"),
    numeric("capacity", "部署扩容", "capacity", "add", 1, "携带上限 +1"),
    unique("twin_barrel", "双联枪管", "额外发射一颗 55% 伤害偏转子弹"),
    unique("repair", "自动维修", "5 秒未受伤后每秒恢复 4% 最大生命"),
    unique("grenade_cycle", "榴弹节拍", "每第 8 发改为 65 范围爆炸弹"),
    unique("heavy_targeting", "重敌锁定", "优先攻击精英和首领并增伤 30%"),
  ]),
  lightning: Object.freeze([
    numeric("damage", "淬金箭锋", "damage", "multiply", 1.2, "每支箭伤害 +20%"),
    numeric("chain_range", "展开箭阵", "chainRange", "multiply", 1.15, "箭雨范围尺寸 +15%（最多 1.5 倍）"),
    numeric("retention", "密集箭列", "retention", "add", 0.05, "每次箭雨增加 4 支箭（最多 +12）", { maximum: 0.9 }),
    numeric("speed", "远距标定", "range", "multiply", 1.15, "落点瞄准距离 +15%"),
    numeric("fire_rate", "快速张弦", "fireRate", "multiply", 0.9, "射击间隔 -10%", { floorMultiplier: 0.45 }),
    numeric("capacity", "箭匣扩容", "capacity", "add", 2, "箭雨弹药上限 +2"),
    unique("fork", "齐射箭阵", "每次箭雨额外增加 12 支箭"),
    unique("paralyze", "震慑箭锋", "命中普通敌人有 12% 概率定身 0.5 秒"),
    unique("kill_arc", "追猎补射", "击杀后在梯形内补射 1 支箭，每轮最多 8 支且不递归"),
    unique("terminal_blast", "碎星箭头", "每支箭落地对 70 范围内其他敌人造成 25% 伤害，仅限梯形内"),
  ]),
  freeze: Object.freeze([
    numeric("damage", "压缩雪球", "damage", "multiply", 1.2, "爆散伤害 +20%"),
    numeric("blast_radius", "寒气扩散", "blastRadius", "multiply", 1.15, "爆散范围 +15%"),
    numeric("slow_per_hit", "深度冻结", "slowPerHit", "add", 0.05, "每次命中减速 +5 个百分点", { maximum: 0.6 }),
    numeric("duration", "持久寒霜", "duration", "multiply", 1.2, "减速持续时间 +20%"),
    numeric("speed", "冰晶加速", "speed", "multiply", 1.15, "雪球弹速 +15%"),
    numeric("capacity", "雪仓扩容", "capacity", "add", 3, "雪球上限 +3"),
    unique("full_freeze", "碎冰传染", "小怪冰封死亡或精英碎冰时，为 90 范围敌人增加冰冻值"),
    unique("shatter", "裂冰弹", "命中前冰冻值达到 50% 时伤害 +50%"),
    unique("frost_field", "霜冻区域", "留下 2 秒、20% 独立减速冰面"),
    unique("pierce", "贯穿雪球", "穿透首个敌人并在首次和最终命中各爆散一次"),
  ]),
  watermelon: Object.freeze([
    numeric("damage", "熟透重弹", "damage", "multiply", 1.2, "直击与瓜瓣伤害 +20%"),
    numeric("blast_radius", "巨型果实", "blastRadius", "multiply", 1.15, "瓜瓣扩散距离 +15%"),
    numeric("charge_time", "快速蓄压", "chargeTime", "multiply", 0.88, "满蓄力时间 -12%", { minimum: 0.8 }),
    numeric("speed", "强力投射", "speed", "multiply", 1.15, "飞行速度 +15%"),
    numeric("movement_penalty", "稳定架势", "movementPenalty", "add", -0.04, "蓄力移动减速降低 4 个百分点", { minimum: 0 }),
    numeric("capacity", "加大瓜袋", "capacity", "add", 1, "西瓜携带上限 +1"),
    unique("seed_storm", "西瓜籽风暴", "碎裂时发射 10 枚各 12% 伤害瓜籽"),
    unique("crushing", "碾压飞行", "首个直击目标额外受到 30% 伤害"),
    unique("ripe_core", "过熟核心", "满蓄力时瓜瓣伤害提高 50%"),
    unique("juice_field", "黏滑瓜汁", "留下 3 秒、25% 非首领减速区"),
  ]),
});

function findTrait(registry, weaponId, traitId) {
  const traits = registry?.[weaponId];
  return Array.isArray(traits)
    ? traits.find(({ id }) => id === traitId)
    : undefined;
}

export function createWeaponUpgrades(registry = WEAPON_TRAITS) {
  return Object.fromEntries(
    Object.entries(registry).map(([weaponId, traits]) => [
      weaponId,
      Object.fromEntries(traits.map(({ id }) => [id, 0])),
    ]),
  );
}

export function traitLevel(upgrades, weaponId, traitId) {
  const level = upgrades?.[weaponId]?.[traitId];
  return Number.isInteger(level) && level >= 0 ? level : 0;
}

export function traitAvailable(levels, trait) {
  if (!trait || !Number.isInteger(trait.maxLevel) || trait.maxLevel <= 0) {
    return false;
  }
  const level = levels?.[trait.id];
  const safeLevel = Number.isInteger(level) && level >= 0 ? level : 0;
  return safeLevel < trait.maxLevel;
}

export function incrementWeaponTrait(
  upgrades,
  weaponId,
  traitId,
  registry = WEAPON_TRAITS,
) {
  const trait = findTrait(registry, weaponId, traitId);
  if (!trait || !traitAvailable(upgrades?.[weaponId], trait)) {
    return { upgrades, deltaCapacity: 0 };
  }
  const nextUpgrades = {
    ...upgrades,
    [weaponId]: {
      ...upgrades?.[weaponId],
      [traitId]: traitLevel(upgrades, weaponId, traitId) + 1,
    },
  };
  const deltaCapacity =
    trait.kind === "numeric" &&
    trait.operation === "add" &&
    ["capacity", "magazine"].includes(trait.stat)
      ? trait.amount
      : 0;
  return { upgrades: nextUpgrades, deltaCapacity };
}

export function resolveTraitStat(base, trait, level) {
  if (
    !trait ||
    !Number.isInteger(level) ||
    level <= 0
  ) {
    return base;
  }
  const raw = trait.operation === "add"
    ? base + trait.amount * level
    : base * trait.amount ** level;
  const floored = trait.floorMultiplier === undefined
    ? raw
    : Math.max(base * trait.floorMultiplier, raw);
  const aboveMinimum = trait.minimum === undefined
    ? floored
    : Math.max(trait.minimum, floored);
  return trait.maximum === undefined
    ? aboveMinimum
    : Math.min(trait.maximum, aboveMinimum);
}

export function weaponStat(
  base,
  upgrades,
  weaponId,
  traitId,
  registry = WEAPON_TRAITS,
) {
  const trait = findTrait(registry, weaponId, traitId);
  return resolveTraitStat(base, trait, traitLevel(upgrades, weaponId, traitId));
}

export function availableWeaponTraits(
  upgrades,
  weaponId,
  registry = WEAPON_TRAITS,
) {
  const traits = registry?.[weaponId];
  if (!Array.isArray(traits)) return [];
  return traits.filter((trait) => traitAvailable(upgrades?.[weaponId], trait));
}
