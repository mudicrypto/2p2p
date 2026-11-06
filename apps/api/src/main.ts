import cluster from 'node:cluster';
import { createApp } from './bootstrap';

/** Horizontal scaling on one host: API_WORKERS processes share the port; Socket.IO fans out via the Redis adapter. */
const workers = Number(process.env.API_WORKERS ?? 1);
async function main() {
  const { app } = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}
if (workers > 1 && cluster.isPrimary) {
  const startedAt = new Map<number, number>();
  const fork = () => { const w = cluster.fork(); startedAt.set(w.id, Date.now()); };
  for (let i = 0; i < workers; i++) fork();
  let fastFailures = 0;
  cluster.on('exit', (w, code) => {
    const lived = Date.now() - (startedAt.get(w.id) ?? 0);
    fastFailures = lived < 10_000 ? fastFailures + 1 : 0;
    if (fastFailures > workers * 2) { console.error('api workers keep failing at startup; giving up'); process.exit(1); }
    console.error(`api worker ${w.process.pid} exited (${code}); restarting`);
    setTimeout(fork, Math.min(30_000, 500 * 2 ** fastFailures));
  });
} else {
  main().catch((e) => { console.error(e); process.exit(1); });
}
