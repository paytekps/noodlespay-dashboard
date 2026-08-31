import type { TerminalLayout } from './types';

const incompatible: Record<TerminalLayout, Set<string>> = {
  ONE: new Set(['KEYPAD_AMOUNT', 'LOCAL_MERCHANT_MENU']),
  MINI: new Set(['FIXED_AMOUNT', 'INCREMENT'])
};

export function capabilityWorksWithLayout(capability: string, layout: TerminalLayout) {
  return !incompatible[layout].has(capability);
}

export function profileLabel(profile: string) {
  if (profile === 'GIMML_ONE') return 'Gimml One';
  if (profile === 'GIMML_MINI') return 'Gimml Mini';
  return 'Custom';
}
