'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startRegistration } from '@simplewebauthn/browser';
import { Alert, Button, Card } from '@p2p/ui';
import { aapi } from '@/lib/api';
import { SECTIONS } from '@/lib/sections';
export default function Home() {
  const router = useRouter();
  const [roles, setRoles] = useState<string[] | null>(null);
  useEffect(() => { aapi('/whoami').then((m) => setRoles(m.roles)).catch(() => aapi('/me').then((m) => setRoles(m.roles)).catch(() => router.push('/login'))); }, [router]);
  if (!roles) return null;
  const visible = SECTIONS.filter((s) => roles.includes('superadmin') || s.roles.some((r) => roles.includes(r)));
  return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-4 text-2xl font-bold">Admin · {roles.join(', ')}</h1>
    <div className="grid gap-3 sm:grid-cols-3">{visible.map((s) => <Link key={s.key} href={`/s/${s.key}`}><Card className="p-4 hover:bg-muted">{s.title}</Card></Link>)}</div>
    <AddPasskey /></main>;
}

/** Add a passkey for another device or address. Two taps: the browser prompt must open straight from a tap. */
function AddPasskey() {
  const [opts, setOpts] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const prepare = async () => { setMsg(null); setBusy(true); try { setOpts(await aapi('/auth/register-key/options', { body: {} })); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(false); } };
  const create = async () => {
    setBusy(true);
    try { const response = await startRegistration({ optionsJSON: opts }); await aapi('/auth/register-key', { body: { response } }); setMsg({ ok: true, text: 'Passkey added for this device and address.' }); setOpts(null); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); setOpts(null); } finally { setBusy(false); }
  };
  return <Card className="mt-6 space-y-2 p-4">
    <div className="font-semibold">Passkeys</div>
    <p className="text-sm text-muted-foreground">Passkeys work only on the device and web address where they were made. Add one here for this device / this address ({typeof window === 'undefined' ? '' : window.location.host}).</p>
    {msg && <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
    {opts ? <Button loading={busy} onClick={create}>Create passkey now</Button> : <Button variant="outline" loading={busy} onClick={prepare}>Add a passkey</Button>}
  </Card>;
}
