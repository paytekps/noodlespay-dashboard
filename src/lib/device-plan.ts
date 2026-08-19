export type DevicePlan = 'basic' | 'pro' | 'premium';

export function normalizeDevicePlan(value: unknown): DevicePlan {
  if (value === 'pro' || value === 'premium') return value;
  return 'basic';
}

export function featuresForDevicePlan(
  plan: DevicePlan,
  configuredPresets: unknown,
  configuredIncrement: unknown,
  configuredResetMode: unknown
) {
  if (plan === 'premium') {
    return {
      enablePresets: configuredPresets === true,
      enableIncrement: configuredIncrement === true,
      resetMode: configuredResetMode === 'auto' ? 'auto' : 'button'
    } as const;
  }

  if (plan === 'pro') {
    return {
      enablePresets: false,
      enableIncrement: configuredIncrement === true,
      resetMode: 'button'
    } as const;
  }

  return {
    enablePresets: false,
    enableIncrement: false,
    resetMode: 'none'
  } as const;
}
