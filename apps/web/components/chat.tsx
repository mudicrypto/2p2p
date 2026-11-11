'use client';
import { useEffect, useRef, useState } from 'react';
import { Paperclip, SendHorizontal, ShieldAlert, FileText } from 'lucide-react';
import { Avatar, Button, Card, Input, cn } from '@p2p/ui';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/session';
import { api, ApiError } from '../lib/api';
import { socket } from '../lib/socket';

export async function uploadAttachment(orderId: string, file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const r = await api(`/orders/${orderId}/attachments`, { body: { contentType: file.type, dataBase64: btoa(bin) } });
  return r.key as string;
}

export function Chat({ orderId, counterparty, className }: { orderId: string; counterparty?: { id: string; displayName?: string }; className?: string }) {
  const { t, date } = useI18n();
  const { me } = useSession();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [warn, setWarn] = useState('');
  const [typing, setTyping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<any[]>(`/orders/${orderId}/messages`).then(setMsgs).catch(() => {});
    const s = socket();
    const onOrder = (p: any) => { if (p.type === 'chat.message') setMsgs((m) => (m.some((x) => x.id === p.id) ? m : [...m, p])); };
    const onTyping = (p: any) => { if (p.userId !== me?.id) { setTyping(true); setTimeout(() => setTyping(false), 2000); } };
    s.on('order', onOrder); s.on('typing', onTyping);
    return () => { s.off('order', onOrder); s.off('typing', onTyping); };
  }, [orderId, me?.id]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs.length]);
  const send = async (body: string, attachmentKey?: string) => {
    setWarn('');
    try {
      const m = await api(`/orders/${orderId}/messages`, { body: { body, attachmentKey } });
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); setText('');
    } catch (e) { if (e instanceof ApiError && e.code === 'FORBIDDEN') setWarn(t('chat.blocked')); }
  };
  const name = counterparty?.displayName ?? counterparty?.id?.slice(0, 8) ?? '';
  return (
    <Card className={cn('flex h-[560px] flex-col overflow-hidden lg:h-[calc(100vh-8rem)] lg:max-h-[720px]', className)}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Avatar name={name || '?'} seed={counterparty?.id} size={36} online />
        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{name}</div><div className="text-xs text-muted-foreground">{typing ? <span className="text-primary">{t('chat.typing')}</span> : t('chat.title')}</div></div>
      </div>
      <div className="flex items-start gap-2 bg-warn/10 px-4 py-2 text-[11px] leading-snug text-warn"><ShieldAlert size={14} className="mt-px shrink-0" />{t('ui.chatSafety')}</div>
      <div ref={logRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4" data-testid="chat-log">
        {msgs.map((m) => {
          const mine = m.senderId === me?.id;
          const system = !m.senderId;
          if (system) return <div key={m.id} className="mx-auto max-w-[90%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">{m.body}</div>;
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', mine ? 'rounded-ee-md bg-primary text-primary-foreground' : 'rounded-es-md bg-muted')}>
                {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                {m.attachmentKey && <a className="mt-1 flex items-center gap-1.5 underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={`/v1/orders/${orderId}/attachments?key=${encodeURIComponent(m.attachmentKey)}`}><FileText size={14} />{t('chat.attach')}</a>}
                <div className={cn('mt-0.5 text-end text-[10px]', mine ? 'text-white/70' : 'text-muted-foreground')}>{date(m.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {warn && <div className="mx-4 mb-2 rounded-lg bg-sell/10 px-3 py-2 text-xs text-sell" role="alert" data-testid="chat-warning">{warn}</div>}
      <form className="flex items-center gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(text); }}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden data-testid="chat-file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await send('', await uploadAttachment(orderId, f)); e.target.value = ''; }} />
        <Button type="button" variant="ghost" size="icon" onClick={() => fileRef.current?.click()} aria-label={t('chat.attach')}><Paperclip size={18} /></Button>
        <Input data-testid="chat-input" className="flex-1" value={text} placeholder={t('chat.placeholder')} onChange={(e) => { setText(e.target.value); socket().emit('typing', orderId); }} />
        <Button type="submit" size="icon" data-testid="chat-send" aria-label={t('chat.send')} disabled={!text.trim()}><SendHorizontal size={18} className="rtl:-scale-x-100" /></Button>
      </form>
    </Card>
  );
}
