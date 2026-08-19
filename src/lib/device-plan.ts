export type DevicePlan = 'basic' | 'pro' | 'premium';

export function normalizeDevicePlan(value: unknown): DevicePlan {
  if (value === 'pro' || value === 'premium') return value;
  return 'basic';
}

export function featuresForDevicePlan(
  plan: DevicePlan,
  configuredPresets: unknown,
  configuredIncrement: unknown
) {
  if (plan === 'premium') {
    return {
      enablePresets: configuredPresets === true,
      enableIncrement: configuredIncrement === true
    } as const;
  }

  if (plan === 'pro') {
    return {
      enablePresets: false,
      enableIncrement: configuredIncrement === true
    } as const;
  }

  return {
    enablePresets: false,
    enableIncrement: false
  } as const;
}
