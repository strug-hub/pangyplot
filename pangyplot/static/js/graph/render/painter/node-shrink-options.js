function shrinkLogistic(z, L, opts = {}) {
  const { L0 = 200, p = 0.5, kSmall = 10, kLarge = 4, floor = 0.08 } = opts;
  // Midpoint zoom where shrink = ~0.5, smaller for larger L
  const zMid = 1 / (1 + Math.pow(L / L0, p));
  const s = Math.min(1, Math.log1p(L) / Math.log1p(1e5));
  const k = kSmall * (1 - s) + kLarge * s; // slope: tiny nodes steeper

  // logistic in normalized space
  const t = z / zMid;
  const shrink = Math.max(1 / (1 + Math.exp(-k * (t - 1))), floor);
  return Math.min(shrink, 1);
}

function shrinkPowerExpo(z, L, opts = {}) {
  const { L0 = 100, p = 0.6, betaSmall = 2.0, betaLarge = 0.6, floor = 0.08 } = opts;
  const threshold = 1 / (1 + Math.pow(L / L0, p));
  const t = Math.min(1, z / threshold);

  // Map seq length to beta: small L → big beta (shrink fast), large L → small beta (gentle)
  const s = Math.min(1, Math.log1p(L) / Math.log1p(1e5)); // normalize using 100kb as “large”
  const beta = betaSmall * (1 - s) + betaLarge * s;

  const shrink = Math.max(Math.pow(t, beta), floor);
  return shrink;
}

function shrinkTwoStage(z, L, opts = {}) {
  const { tinyCutoff = 50, floor = 0.08 } = opts;
  if (L < tinyCutoff) {
    // tiny: linear (or even quadratic) shrink
    return Math.max(Math.min(z, 1), floor);
  } else {
    // larger: gentle power/log
    return shrinkPowerExpo(z, L, { floor, L0: 200, p: 0.5, betaSmall: 1.2, betaLarge: 0.6 });
  }
}