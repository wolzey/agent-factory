import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthPrincipal } from './auth.js';

export const LINK_TTL_MS = 5 * 60_000;
export const DEVICE_TTL_MS = 90 * 24 * 60 * 60_000;
const TOKEN = /^afn1_[A-Za-z0-9_-]{43}$/;
const HASH = /^[A-Za-z0-9_-]{43}$/;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface LinkedDevice extends AuthPrincipal {
  id: string; name: string; tokenHash: string; createdAt: number; expiresAt: number;
}
export interface DeviceRepository {
  loadLinkedDevices(): Promise<LinkedDevice[]>;
  saveLinkedDevice(device: LinkedDevice): Promise<void>;
  deleteLinkedDevice(id: string): Promise<void>;
  findLinkedDevice(tokenHash: string): Promise<LinkedDevice | null>;
}
interface LinkRequest {
  id: string; code: string; tokenHash: string; name: string; expiresAt: number;
  principal?: AuthPrincipal; deviceId?: string; grant?: LinkedDevice;
}
export class DeviceLinkError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export function nativeTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
export function publicDevice(device: LinkedDevice) {
  return { id: device.id, name: device.name, createdAt: device.createdAt, expiresAt: device.expiresAt };
}

// One authoritative process per factory, as for world state. Pending links expire on restart;
// acknowledged credentials survive it. All grant mutations serialize across durable writes.
export class DeviceLinks {
  private pending = new Map<string, LinkRequest>();
  private devices = new Map<string, LinkedDevice>();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private repository: DeviceRepository, private now = Date.now) {}
  async initialize() {
    for (const device of await this.repository.loadLinkedDevices()) {
      if (!HASH.test(device.tokenHash) || !HASH.test(device.ownerId) || !device.id ||
          !device.name || device.name.length > 60 || !device.username || device.username.length > 100 ||
          !Number.isSafeInteger(device.createdAt) || !Number.isSafeInteger(device.expiresAt)) throw new Error('Invalid stored device');
      if (device.expiresAt > this.now()) this.devices.set(device.id, device);
      else await this.repository.deleteLinkedDevice(device.id);
    }
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => {}).then(work); this.writes = next; return next;
  }
  private prune() {
    for (const [id, device] of this.devices) if (device.expiresAt <= this.now()) this.devices.delete(id);
    for (const [id, link] of this.pending) if (link.expiresAt <= this.now()) this.pending.delete(id);
  }
  begin(name: unknown, tokenHash: unknown) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\x00-\x1f\x7f]/.test(name) ||
        typeof tokenHash !== 'string' || !HASH.test(tokenHash)) throw new DeviceLinkError(400, 'invalid_request');
    this.prune();
    if ([...this.devices.values()].some(device => device.tokenHash === tokenHash)) throw new DeviceLinkError(409, 'credential_already_linked');
    const existing = [...this.pending.values()].find(link => link.tokenHash === tokenHash);
    if (existing) return this.describe(existing);
    if (this.pending.size >= 1000) throw new DeviceLinkError(429, 'busy');
    let code: string;
    do { code = [...randomBytes(10)].map(value => ALPHABET[value % ALPHABET.length]).join(''); }
    while ([...this.pending.values()].some(link => link.code === code));
    const link: LinkRequest = { id: randomBytes(32).toString('base64url'), code, tokenHash, name: name.trim(), expiresAt: this.now() + LINK_TTL_MS };
    this.pending.set(link.id, link); return this.describe(link);
  }
  private describe(link: LinkRequest) {
    return { requestId: link.id, userCode: `${link.code.slice(0,5)}-${link.code.slice(5)}`, deviceName: link.name, expiresAt: link.expiresAt, pollIntervalSeconds: 3 };
  }
  private byCode(value: unknown) {
    this.prune();
    const code = typeof value === 'string' ? value.toUpperCase().replace(/[-\s]/g, '') : '';
    const link = [...this.pending.values()].find(item => item.code === code);
    if (!link || link.deviceId) throw new DeviceLinkError(404, 'link_unavailable');
    return link;
  }
  inspect(code: unknown) { return this.describe(this.byCode(code)); }
  approve(code: unknown, principal: AuthPrincipal) {
    return this.serial(async () => {
      const link = this.byCode(code);
      if (link.principal && link.principal.ownerId !== principal.ownerId) throw new DeviceLinkError(409, 'already_approved');
      link.principal = { ...principal }; return { approved: true };
    });
  }
  private bound(id: unknown, token: string | undefined) {
    this.prune();
    const link = typeof id === 'string' ? this.pending.get(id) : undefined;
    if (!link || !token || !TOKEN.test(token) || nativeTokenHash(token) !== link.tokenHash) throw new DeviceLinkError(404, 'link_unavailable');
    return link;
  }
  exchange(id: unknown, token: string | undefined) {
    return this.serial(async () => {
      const link = this.bound(id, token);
      if (!link.principal) return { status: 'pending' as const };
      if (link.deviceId) {
        const device = this.authenticate(token);
        if (!device || device.id !== link.deviceId) throw new DeviceLinkError(410, 'device_revoked');
        return this.session(device);
      }
      if (this.list(link.principal.ownerId).length >= 30 || this.devices.size >= 10_000) throw new DeviceLinkError(409, 'device_limit');
      // The requester generated and retained the high-entropy credential before starting.
      // Only its commitment was sent at begin; approval cannot be claimed by another device.
      // A lost success response is recoverable via session authentication or this same exchange.
      const device: LinkedDevice = link.grant ??= { ...link.principal, id: randomUUID(), name: link.name,
        tokenHash: link.tokenHash, createdAt: this.now(), expiresAt: this.now() + DEVICE_TTL_MS };
      await this.repository.saveLinkedDevice(device);
      this.devices.set(device.id, device); link.deviceId = device.id;
      return this.session(device);
    });
  }
  cancel(id: unknown, token: string | undefined) {
    return this.serial(async () => {
      if (!token || !TOKEN.test(token)) throw new DeviceLinkError(404, 'link_unavailable');
      const hash = nativeTokenHash(token);
      const link = typeof id === 'string' ? this.pending.get(id) : undefined;
      if (link && link.tokenHash !== hash) throw new DeviceLinkError(404, 'link_unavailable');
      // Display-code expiry is not proof that an in-flight/uncertain save created no grant.
      // Resolve the durable commitment even after the pending request expired or restarted.
      const device = await this.repository.findLinkedDevice(hash);
      if (device) await this.repository.deleteLinkedDevice(device.id);
      for (const [deviceId, known] of this.devices) if (known.tokenHash === hash) this.devices.delete(deviceId);
      if (link) this.pending.delete(link.id);
      return { cancelled: true };
    });
  }
  authenticate(token: string | undefined): LinkedDevice | null {
    if (!token || !TOKEN.test(token)) return null;
    const hash = nativeTokenHash(token);
    return [...this.devices.values()].find(device => device.tokenHash === hash && device.expiresAt > this.now()) ?? null;
  }
  session(device: LinkedDevice) {
    return { status: 'linked' as const, authenticated: true, ownerId: device.ownerId, username: device.username, device: publicDevice(device) };
  }
  list(ownerId: string) {
    return [...this.devices.values()].filter(device => device.ownerId === ownerId && device.expiresAt > this.now()).map(publicDevice);
  }
  revoke(id: string, ownerId: string) {
    return this.serial(async () => {
      const device = this.devices.get(id);
      if (!device || device.ownerId !== ownerId) throw new DeviceLinkError(404, 'device_unavailable');
      await this.repository.deleteLinkedDevice(id); this.devices.delete(id); return { revoked: true };
    });
  }
}
