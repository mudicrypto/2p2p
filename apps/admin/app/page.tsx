'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@p2p/ui';
import { aapi } from '@/lib/api';
import { SECTIONS } from '@/lib/sections';
export default function Home() {
  const router = useRouter();
  const [roles, setRoles] = useState<string[] | null>(null);
  useEffect(() => { aapi('/whoami').then((m) => setRoles(m.roles)).catch(() => aapi('/me').then((m) => setRoles(m.roles)).catch(() => router.push('/login'))); }, [router]);
  if (!roles) return null;
  const visible = SECTIONS.filter((s) => roles.includes('superadmin') || s.roles.some((r) => roles.includes(r)));
  return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-4 text-2xl font-bold">Admin · {roles.join(', ')}</h1>
    <div className="grid gap-3 sm:grid-cols-3">{visible.map((s) => <Link key={s.key} href={`/s/${s.key}`}><Card className="p-4 hover:bg-muted">{s.title}</Card></Link>)}</div></main>;
}
