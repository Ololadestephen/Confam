// Opt-in pacing so recordings are watchable in a demo. It slows browser actions only, and every
// run that uses it says so, because timing-sensitive results may differ from an unpaced run.
export function pacingLimitations(): string[] {
  const slowMo = viewingSlowMo();
  return slowMo > 0 ? [`Browser actions were paced for viewing (CONFAM_VIEWING_SLOW_MO_MS=${slowMo}); timing-sensitive results may differ from an unpaced run.`] : [];
}

export function viewingSlowMo(value = process.env.CONFAM_VIEWING_SLOW_MO_MS): number {
  if (value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 1000) throw new Error("CONFAM_VIEWING_SLOW_MO_MS must be an integer from 0 to 1000.");
  return parsed;
}
