import { createHash } from 'node:crypto';
import type { AvatarConfig } from '../shared/types.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import type { StateManager } from './state.js';

export interface AvatarProfileRepository {
  loadAvatarProfiles(): Promise<Array<{ ownerId: string; avatar: AvatarConfig }>>;
  saveAvatarProfile(ownerId: string, avatar: AvatarConfig): Promise<void>;
}

export class AvatarConflict extends Error {
  constructor(public profile: ReturnType<AvatarProfiles['get']>) { super('avatar_changed'); }
}
export class AvatarProfiles {
  private profiles = new Map<string, AvatarConfig>();
  private uncertain = new Set<string>();
  private writes = new Map<string, Promise<void>>();
  constructor(private repository: AvatarProfileRepository, private state: StateManager) {}

  async initialize() {
    for (const profile of await this.repository.loadAvatarProfiles()) this.profiles.set(profile.ownerId, profile.avatar);
    this.state.setAvatarResolver(ownerId => this.profiles.get(ownerId));
    for (const [ownerId, avatar] of this.profiles) this.state.updateOwnerAvatar(ownerId, avatar);
  }

  get(ownerId: string) {
    if (this.uncertain.has(ownerId)) throw new Error('avatar_store_unconfirmed');
    const avatar = structuredClone(this.profiles.get(ownerId) ?? this.state.findSessionByOwnerId(ownerId)?.avatar ?? DEFAULT_AVATAR);
    const saved = this.profiles.has(ownerId);
    const canonical = JSON.stringify(Object.fromEntries(Object.entries(avatar).sort(([a], [b]) => a.localeCompare(b))));
    // Content revisions survive restart without a migration. One factory process owns writes.
    const revision = createHash('sha256').update(ownerId + ':' + saved + ':' + canonical).digest('base64url');
    return { avatar, saved, revision };
  }

  async read(ownerId: string) {
    if (this.uncertain.has(ownerId)) {
      const pending = (this.writes.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(async () => { if (this.uncertain.has(ownerId)) await this.reconcile(ownerId); });
      this.writes.set(ownerId, pending);
      try { await pending; } finally { if (this.writes.get(ownerId) === pending) this.writes.delete(ownerId); }
    }
    return this.get(ownerId);
  }

  private async reconcile(ownerId: string) {
    const stored = (await this.repository.loadAvatarProfiles()).find(profile => profile.ownerId === ownerId);
    if (stored) { this.profiles.set(ownerId, stored.avatar); this.state.updateOwnerAvatar(ownerId, stored.avatar); }
    else this.profiles.delete(ownerId);
    this.uncertain.delete(ownerId);
  }

  async save(ownerId: string, avatar: AvatarConfig, expectedRevision?: string) {
    const next = structuredClone(avatar);
    let committed: ReturnType<AvatarProfiles['get']>;
    // Serialize one owner's saves so memory, the broadcast, and durable storage agree.
    const pending = (this.writes.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (this.uncertain.has(ownerId)) await this.reconcile(ownerId);
      if (expectedRevision !== undefined && this.get(ownerId).revision !== expectedRevision) throw new AvatarConflict(this.get(ownerId));
      try { await this.repository.saveAvatarProfile(ownerId, next); }
      catch (error) {
        this.uncertain.add(ownerId);
        try { await this.reconcile(ownerId); } catch { /* Block stale reads until storage recovers. */ }
        throw error;
      }
      this.profiles.set(ownerId, next);
      this.state.updateOwnerAvatar(ownerId, next);
      committed = this.get(ownerId);
    });
    this.writes.set(ownerId, pending);
    try { await pending; } finally { if (this.writes.get(ownerId) === pending) this.writes.delete(ownerId); }
    return committed!;
  }
}
