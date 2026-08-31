export function requireMinorUnits(value, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) throw new TypeError('Invalid minor-unit amount');
  return value;
}
