'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@p2p/ui';
import { aapi } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    try {
      const l = await aapi('/auth/login', { body: f });
      if (l.needsRegistration) {
        const opts = await aapi('/auth/register-key/options', { body: {} });
        await aapi('/auth/register-key', { body: { response: await startRegistration({ optionsJSON: opts }) } });
        const l2 = await aapi('/auth/login', { body: f });
        await aapi('/auth/webauthn', { body: { response: await startAuthentication({ optionsJSON: l2.webauthnOptions }) } });
      } else {
        await aapi('/auth/webauthn', { body: { response: await startAuthentication({ optionsJSON: l.webauthnOptions }) } });
      }
      router.push('/');
    } catch (e) { setErr((e as Error).message); }
  };
  return <Card className="mx-auto mt-24 max-w-sm"><CardHeader><CardTitle>Admin sign-in</CardTitle><p className="text-xs text-muted-foreground">Password + hardware security key required.</p></CardHeader>
    <CardContent><form className="space-y-3" onSubmit={submit}>
      <div><Label htmlFor="e">Email</Label><Input id="e" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
      <div><Label htmlFor="p">Password</Label><Input id="p" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
      {err && <Alert variant="error">{err}</Alert>}
      <Button type="submit" className="w-full">Continue with security key</Button>
    </form></CardContent></Card>;
}
