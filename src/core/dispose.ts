/** Preserve cleanup order and attempt every owned resource, including after a GPU drain fails. */
export async function disposeSteps(steps: Array<() => unknown | Promise<unknown>>, message = 'Resource cleanup failed'): Promise<void> {
  const failures: unknown[] = [];
  for (const step of steps) { try { await step(); } catch (error) { failures.push(error); } }
  if (failures.length) throw new AggregateError(failures, message);
}
