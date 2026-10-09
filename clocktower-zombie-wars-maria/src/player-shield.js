export const SHIELD_RATIO = 0.2;

export function shieldCapacity(maxHealth) {
  return Number.isFinite(maxHealth) && maxHealth > 0
    ? maxHealth * SHIELD_RATIO
    : 0;
}

export function refillShield(maxHealth) {
  return shieldCapacity(maxHealth);
}

export function absorbShieldDamage(shield, damage, maxHealth) {
  const current = Number.isFinite(shield)
    ? Math.min(Math.max(0, shield), shieldCapacity(maxHealth))
    : 0;
  const amount = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const absorbed = Math.min(current, amount);
  return { shield: current - absorbed, healthDamage: amount - absorbed };
}
