/**
 * Software WebAuthn authenticator (ES256, "none" attestation) for automated tests of the real
 * passkey/hardware-key verification path. Never used in production code paths.
 */
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const s = Buffer.from(v); return Buffer.concat([head(3, s.length), s]); }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) { const b = Buffer.from(v); return Buffer.concat([head(2, b.length), b]); }
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  if (v && typeof v === 'object') return cbor(new Map(Object.entries(v)));
  throw new Error('cbor: unsupported');
}
const b64u = (b: Buffer) => b.toString('base64url');

export class SoftAuthenticator {
  private key: { privateKey: KeyObject; publicKey: KeyObject };
  readonly credentialId = randomBytes(16);
  private counter = 0;
  constructor(private rpId = 'localhost', private origin = 'http://localhost:3000') {
    this.key = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  }
  private rpHash() { return createHash('sha256').update(this.rpId).digest(); }
  register(options: { challenge: string }) {
    const jwk = this.key.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
    const idLen = Buffer.alloc(2); idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([this.rpHash(), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), idLen, this.credentialId, cose]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: this.origin, crossOrigin: false }));
    const attestationObject = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), attestationObject: b64u(attestationObject), transports: ['usb'] } };
  }
  assert(options: { challenge: string }) {
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(++this.counter);
    const authData = Buffer.concat([this.rpHash(), Buffer.from([0x05]), cnt]);
    const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.origin, crossOrigin: false }));
    const sig = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]), this.key.privateKey);
    return { id: b64u(this.credentialId), rawId: b64u(this.credentialId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64u(clientDataJSON), authenticatorData: b64u(authData), signature: b64u(sig), userHandle: undefined } };
  }
}
