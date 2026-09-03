export const closedLoopTestPrograms = [
  { key: 'ojc', name: 'The OJC Fund', adapterStatus: 'configuration_ready' },
  { key: 'pledger', name: 'Pledger', adapterStatus: 'configuration_ready' },
  { key: 'matbia', name: 'Matbia', adapterStatus: 'configuration_ready' },
  { key: 'donors_fund', name: 'The Donors Fund', adapterStatus: 'adapter_pending' }
] as const;

export type ClosedLoopTestProgramKey = typeof closedLoopTestPrograms[number]['key'];

export function closedLoopTestProgram(key: string) {
  return closedLoopTestPrograms.find(program => program.key === key);
}

