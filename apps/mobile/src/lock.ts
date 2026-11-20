/** Biometric unlock policy: lock on cold start and after the app was in the background longer than the grace period. */
export interface LockState { locked: boolean; backgroundedAt: number | null }
export const GRACE_MS = 60_000;
export const initialLock = (): LockState => ({ locked: true, backgroundedAt: null });
export function onAppState(s: LockState, next: 'active' | 'background' | 'inactive', now: number, graceMs = GRACE_MS): LockState {
  if (next === 'background' || next === 'inactive') return { ...s, backgroundedAt: s.backgroundedAt ?? now };
  const away = s.backgroundedAt === null ? 0 : now - s.backgroundedAt;
  return { locked: s.locked || away > graceMs, backgroundedAt: null };
}
export const onUnlock = (s: LockState): LockState => ({ ...s, locked: false });
/** Sensitive actions (release, withdraw) always re-prompt biometrics, on top of the server-side 2FA. */
export const requiresBiometric = (action: string) => ['release', 'withdraw', 'security'].includes(action);
