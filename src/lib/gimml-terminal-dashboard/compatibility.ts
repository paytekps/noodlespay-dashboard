import type { TerminalLayout } from './types';

const incompatible: Record<TerminalLayout, Set<string>> = {
  ONE: new Set(['KEYPAD_AMOUNT', 'LOCAL_MERCHANT_MENU']),
  MINI: new Set(['FIXED_AMOUNT', 'INCREMENT'])
};

export function capabilityWorksWithLayout(capability: string, layout: TerminalLayout) {
  return !incompatible[layout].has(capability);
}

export function capabilityCompatibilityLabel(capability: string) {
  const one = capabilityWorksWithLayout(capability, 'ONE');
  const mini = capabilityWorksWithLayout(capability, 'MINI');
  if (one && mini) return 'Gimml One & Mini';
  if (one) return 'Gimml One only';
  if (mini) return 'Gimml Mini only';
  return 'Not currently available';
}

export function profileLabel(profile: string) {
  if (profile === 'GIMML_ONE') return 'Gimml One';
  if (profile === 'GIMML_MINI') return 'Gimml Mini';
  return 'Custom';
}

const capabilityLabels: Record<string, string> = {
  CARD_PRESENT: 'Card-present payments', KEYED_ENTRY: 'Manual card entry', FIXED_AMOUNT: 'Fixed amount',
  KEYPAD_AMOUNT: 'Keypad amount entry', PRESETS: 'Preset amounts', INCREMENT: 'Amount increment',
  LOCAL_MERCHANT_MENU: 'Merchant menu', VOID: 'Void transactions', REFUND: 'Refunds',
  SETTLEMENT: 'Batch settlement', CLOSED_LOOP_IDENTIFY: 'Closed-loop card identification',
  DASHBOARD_REPORTING: 'Dashboard reporting', ADVANCED_REPORTING: 'Advanced reporting',
  FLEET_HEALTH: 'Device health monitoring', FLEET_LOCATION: 'Device location'
};

export function capabilityLabel(capability: string) {
  return capabilityLabels[capability] ?? capability.toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
}
