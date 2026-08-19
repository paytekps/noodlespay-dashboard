export type DevicePlan = 'basic' | 'pro' | 'premium';

export function normalizeDevicePlan(value: unknown): DevicePlan {
  if (value === 'pro' || value === 'premium') return value;
  return 'basic';
}

export function featuresForDevicePlan(
  plan: DevicePlan,
  configuredPresets: unknown,
  configuredIncrement: unknown,
  configuredReset: unknown,
  configuredResetMode: unknown
) {
  const enableReset = configuredReset === true;

  if (plan === 'premium') {
    return {
      enablePresets: configuredPresets === true,
      enableIncrement: configuredIncrement === true,
      enableReset,
      resetMode: enableReset
        ? configuredResetMode === 'auto' ? 'auto' : 'button'
        : 'none'
    } as const;
  }

  if (plan === 'pro') {
    return {
      enablePresets: false,
      enableIncrement: configuredIncrement === true,
      enableReset,
      resetMode: enableReset
        ? configuredResetMode === 'auto' ? 'auto' : 'button'
        : 'none'
    } as const;
  }

  return {
    enablePresets: false,
    enableIncrement: false,
    enableReset: false,
    resetMode: 'none'
  } as const;
}
