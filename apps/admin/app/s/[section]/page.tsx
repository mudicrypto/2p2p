'use client';
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Input, Textarea } from '@p2p/ui';
import { aapi } from '@/lib/api';
import { SECTIONS } from '@/lib/sections';

const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
export default function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const s = SECTIONS.find((x) => x.key === section);
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editor, setEditor] = useState(s?.editor ? JSON.stringify(s.editor.template, null, 2) : '');
  const [editKey, setEditKey] = useState('');
  const load = useCallback(async () => {
    if (!s) return;
    try { const r = await aapi(s.list + (s.search ? encodeURIComponent(q) : '')); setRows(Array.isArray(r) ? r : [r]); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, [s, q]);
  useEffect(() => { void load(); }, [load]);
  if (!s) return <p className="p-6">Unknown section</p>;
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 12);
  const run = async (a: NonNullable<typeof s.actions>[number], row: any) => {
    try { const body = a.body ? await a.body(row) : {}; await aapi(a.path(row), { method: a.method, body }); setMsg({ ok: true, text: `${a.label}: done` }); await load(); }
    catch (e) { if ((e as Error).message !== 'cancelled') setMsg({ ok: false, text: (e as Error).message }); }
  };
  return <main className="mx-auto max-w-7xl space-y-3 p-6">
    <div className="flex items-center gap-3"><Link href="/" className="underline">← Admin</Link><h1 className="text-xl font-semibold">{s.title}</h1></div>
    {s.search && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, phone, id, Telegram id" /><Button type="submit">Search</Button></form>}
    {msg && <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
    {s.editor && <div className="space-y-2 rounded border p-3">
      {s.editor.path.endsWith('/') && <Input placeholder="key (e.g. country code)" value={editKey} onChange={(e) => setEditKey(e.target.value.toUpperCase())} />}
      <Textarea rows={6} value={editor} onChange={(e) => setEditor(e.target.value)} className="font-mono" />
      <Button onClick={async () => { try { await aapi(s.editor!.path + editKey, { method: s.editor!.method, body: JSON.parse(editor) }); setMsg({ ok: true, text: 'saved' }); await load(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }}>Save</Button>
    </div>}
    <div className="overflow-x-auto rounded border"><table className="w-full text-xs">
      <thead className="bg-muted"><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-start">{c}</th>)}{s.actions && <th />}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.id ?? r.code ?? r.country ?? r.tier ?? i} className="border-t">
        {cols.map((c) => <td key={c} className="max-w-56 truncate px-2 py-1" title={cell(r[c])}>{cell(r[c])}</td>)}
        {s.actions && <td className="whitespace-nowrap px-2 py-1">{s.actions.map((a) => <Button key={a.label} size="sm" variant={a.danger ? 'destructive' : 'outline'} className="me-1" onClick={() => run(a, r)}>{a.label}</Button>)}</td>}
      </tr>)}</tbody></table></div>
  </main>;
}
