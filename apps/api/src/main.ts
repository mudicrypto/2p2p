import { createApp } from './bootstrap';
async function main() {
  const { app } = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}
main().catch((e) => { console.error(e); process.exit(1); });
