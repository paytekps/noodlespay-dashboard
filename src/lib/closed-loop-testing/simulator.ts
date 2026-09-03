export type SimulatedProgram = { id: string; display_name: string; bin_prefix: string; enabled: boolean };

export function normalizeTestBin(value: unknown) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 8);
}

export function matchConfiguredProgram(testBin: string, programs: SimulatedProgram[]) {
  return programs
    .filter(program => program.enabled && testBin.startsWith(program.bin_prefix))
    .sort((left, right) => right.bin_prefix.length - left.bin_prefix.length)[0] ?? null;
}

export function providerNameMatches(programName: string, providerKey: string) {
  const normalized = programName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (providerKey === 'ojc') return normalized.includes('ojc');
  if (providerKey === 'pledger') return normalized.includes('pledger');
  if (providerKey === 'matbia') return normalized.includes('matbia');
  return normalized.includes('donorsfund');
}

