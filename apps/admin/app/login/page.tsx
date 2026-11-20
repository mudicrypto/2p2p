'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@p2p/ui';
import { aapi } from '@/lib/api';

/**
 * Password first, then the passkey on its own button. Browsers (Safari on iPhone in particular) only open the
 * passkey prompt straight after a tap, so the prompt must not wait behind network calls.
 */
type Step = { kind: 'password' } | { kind: 'register'; options: any } | { kind: 'key'; options: any };
export default function Login() {
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '' });
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toKeyStep = async () => {
    const l = await aapi('/auth/login', { body: f });
    if (l.needsRegistration) setStep({ kind: 'register', options: await aapi('/auth/register-key/options', { body: {} }) });
    else setStep({ kind: 'key', options: l.webauthnOptions });
  };
  const run = async (fn: () => Promise<void>) => {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) {
      const m = (e as Error).message;
      setErr(/not allowed|denied|cancel|timed out/i.test(m) ? 'The passkey prompt was closed or timed out. Tap the button to try again.' : m);
    } finally { setBusy(false); }
  };
  const submitPassword = (e: React.FormEvent) => { e.preventDefault(); void run(toKeyStep); };
  // These run the browser prompt first, with nothing awaited before it.
  const register = () => run(async () => {
    if (step.kind !== 'register') return;
    const response = await startRegistration({ optionsJSON: step.options });
    await aapi('/auth/register-key', { body: { response } });
    await toKeyStep(); // now sign in with the new passkey (one more tap)
  });
  const useKey = () => run(async () => {
    if (step.kind !== 'key') return;
    const response = await startAuthentication({ optionsJSON: step.options });
    await aapi('/auth/webauthn', { body: { response } });
    router.push('/');
  });
  return <Card className="mx-auto mt-24 max-w-sm"><CardHeader><CardTitle>Admin sign-in</CardTitle>
    <p className="text-xs text-muted-foreground">Password + passkey (Face ID, Touch ID or a security key).</p></CardHeader>
    <CardContent className="space-y-3">
      {step.kind === 'password' && <form className="space-y-3" onSubmit={submitPassword}>
        <div><Label htmlFor="e">Email</Label><Input id="e" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div><Label htmlFor="p">Password</Label><Input id="p" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        {err && <Alert variant="error">{err}</Alert>}
        <Button type="submit" className="w-full" loading={busy} data-testid="admin-password-next">Continue</Button>
      </form>}
      {step.kind === 'register' && <>
        <p className="text-sm">No passkey is set up for this admin account yet. Create one now: your phone or computer will ask for Face ID, Touch ID or your screen lock. It stays on this device (and in your iCloud Keychain or Google Password Manager).</p>
        {err && <Alert variant="error">{err}</Alert>}
        <Button className="w-full" loading={busy} onClick={register} data-testid="admin-create-passkey">Create passkey</Button>
      </>}
      {step.kind === 'key' && <>
        <p className="text-sm">Password accepted. Confirm with your passkey.</p>
        {err && <Alert variant="error">{err}</Alert>}
        <Button className="w-full" loading={busy} onClick={useKey} data-testid="admin-use-passkey">Use passkey</Button>
        <p className="text-xs text-muted-foreground">Passkeys only work on the address where they were created. If you made yours on another address, sign in there, or ask another superadmin to reset your passkey.</p>
      </>}
      {step.kind !== 'password' && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setStep({ kind: 'password' }); setErr(''); }}>Back</button>}
    </CardContent></Card>;
}
