/**
 * Field-level envelope encryption (spec 11). Each value gets a fresh 256-bit data key (DEK);
 * the DEK is wrapped by the key-encryption key from KMS. In dev the KEK comes from
 * DATA_ENCRYPTION_KEY. Format: v1.<wrappedDek>.<iv>.<tag>.<ciphertext> (base64url parts).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export interface Kms {
  wrap(dek: Buffer): Buffer;
  unwrap(wrapped: Buffer): Buffer;
}

class LocalKms implements Kms {
  constructor(private kek: Buffer) {}
  wrap(dek: Buffer) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.kek, iv, { authTagLength: 16 });
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]);
  }
  unwrap(w: Buffer) {
    const d = createDecipheriv('aes-256-gcm', this.kek, w.subarray(0, 12), { authTagLength: 16 });
    d.setAuthTag(w.subarray(12, 28));
    return Buffer.concat([d.update(w.subarray(28)), d.final()]);
  }
}

let kms: Kms | undefined;
export function setKms(k: Kms) { kms = k; }
function getKms(): Kms {
  if (kms) return kms;
  // TODO(provider): AWS/GCP KMS adapter when KMS_KEY_ID exists.
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY/KMS required in production');
    kms = new LocalKms(createHash('sha256').update('dev-only-insecure-key').digest());
  } else {
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes base64');
    kms = new LocalKms(key);
  }
  return kms;
}

const b64 = (b: Buffer) => b.toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url');

export function encrypt(plain: string): string {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dek, iv, { authTagLength: 16 });
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', b64(getKms().wrap(dek)), b64(iv), b64(c.getAuthTag()), b64(ct)].join('.');
}
export function decrypt(blob: string): string {
  const [v, w, iv, tag, ct] = blob.split('.');
  if (v !== 'v1') throw new Error('unknown ciphertext version');
  const tagB = unb64(tag);
  if (tagB.length !== 16) throw new Error('invalid auth tag');
  const dek = getKms().unwrap(unb64(w));
  const d = createDecipheriv('aes-256-gcm', dek, unb64(iv), { authTagLength: 16 });
  d.setAuthTag(tagB);
  return Buffer.concat([d.update(unb64(ct)), d.final()]).toString('utf8');
}
export const encryptJson = (v: unknown) => encrypt(JSON.stringify(v));
export const decryptJson = <T>(s: string): T => JSON.parse(decrypt(s)) as T;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) => Array.from(randomBytes(n), (b) => (b % 10).toString()).join('');
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const hmacHex = (key: string, data: string) => createHmac('sha256', key).update(data).digest('hex');

/** PII redaction for logs. */
const EMAIL = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
export function redactPii(s: string): string {
  return s.replace(EMAIL, '$1***@$2').replace(PHONE, (m) => m.slice(0, 3) + '***' + m.slice(-2));
}
