'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@p2p/ui';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { api, ApiError } from '@/lib/api';
import { socket } from '@/lib/socket';

export function Chat({ orderId }: { orderId: string }) {
  const { t, date } = useI18n();
  const { me } = useSession();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [warn, setWarn] = useState('');
  const [typing, setTyping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<any[]>(`/orders/${orderId}/messages`).then(setMsgs).catch(() => {});
    const s = socket();
    const onOrder = (p: any) => { if (p.type === 'chat.message') setMsgs((m) => (m.some((x) => x.id === p.id) ? m : [...m, p])); };
    const onTyping = (p: any) => { if (p.userId !== me?.id) { setTyping(true); setTimeout(() => setTyping(false), 2000); } };
    s.on('order', onOrder); s.on('typing', onTyping);
    return () => { s.off('order', onOrder); s.off('typing', onTyping); };
  }, [orderId, me?.id]);
  const send = async (body: string, attachmentKey?: string) => {
    setWarn('');
    try {
      const m = await api(`/orders/${orderId}/messages`, { body: { body, attachmentKey } });
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); setText('');
    } catch (e) { if (e instanceof ApiError && e.code === 'FORBIDDEN') setWarn(t('chat.blocked')); }
  };
  const upload = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const r = await api(`/orders/${orderId}/attachments`, { body: { contentType: file.type, dataBase64: btoa(bin) } });
    await send('', r.key);
  };
  return (
    <Card><CardHeader><CardTitle>{t('chat.title')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 space-y-2 overflow-y-auto" data-testid="chat-log">
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.senderId === me?.id ? 'ms-auto bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {m.body && <div>{m.body}</div>}
              {m.attachmentKey && <a className="underline" target="_blank" rel="noreferrer" href={`/v1/orders/${orderId}/attachments?key=${encodeURIComponent(m.attachmentKey)}`}>📎 {t('chat.attach')}</a>}
              <div className="text-[10px] opacity-70">{date(m.createdAt)}</div>
            </div>
          ))}
        </div>
        {typing && <div className="text-xs text-muted-foreground">{t('chat.typing')}</div>}
        {warn && <div className="text-xs text-rose-600" role="alert" data-testid="chat-warning">{warn}</div>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(text); }}>
          <Input data-testid="chat-input" value={text} placeholder={t('chat.placeholder')} onChange={(e) => { setText(e.target.value); socket().emit('typing', orderId); }} />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden data-testid="chat-file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} aria-label={t('chat.attach')}>📎</Button>
          <Button type="submit" data-testid="chat-send">{t('chat.send')}</Button>
        </form>
      </CardContent></Card>
  );
}
