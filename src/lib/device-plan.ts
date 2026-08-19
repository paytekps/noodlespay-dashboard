export type DevicePlan = 'basic' | 'pro' | 'premium';

export function normalizeDevicePlan(value: unknown): DevicePlan {
  if (value === 'pro' || value === 'premium') return value;
  return 'basic';
}

export function featuresForDevicePlan(
  plan: DevicePlan,
  configuredResetMode: unknown
) {
  if (plan === 'premium') {
    return {
      enablePresets: true,
      enableIncrement: true,
      resetMode: configuredResetMode === 'auto' ? 'auto' : 'button'
    } as const;
  }

  if (plan === 'pro') {
    return {
      enablePresets: false,
      enableIncrement: true,
      resetMode: 'button'
    } as const;
  }

  return {
    enablePresets: false,
    enableIncrement: false,
    resetMode: 'none'
  } as const;
}
