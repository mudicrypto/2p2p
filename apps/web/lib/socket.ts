'use client';
import { io, type Socket } from 'socket.io-client';
let s: Socket | null = null;
/** Single shared Socket.IO connection (auth via the httpOnly session cookie). */
export function socket(): Socket {
  if (!s) s = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', { withCredentials: true, transports: ['websocket'] });
  return s;
}
export function useRoom(room: string | null, handlers: Record<string, (p: any) => void>) {
  // Implemented in components via useEffect to avoid importing React here.
  return { room, handlers };
}
