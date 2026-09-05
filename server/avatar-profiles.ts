import type { AvatarConfig } from '../shared/types.js';
import { DEFAULT_AVATAR } from '../shared/constants.js';
import type { StateManager } from './state.js';

export interface AvatarProfileRepository {
  loadAvatarProfiles(): Promise<Array<{ ownerId: string; avatar: AvatarConfig }>>;
  saveAvatarProfile(ownerId: string, avatar: AvatarConfig): Promise<void>;
}

export class AvatarProfiles {
  private profiles = new Map<string, AvatarConfig>();
  private writes = new Map<string, Promise<void>>();
  constructor(private repository: AvatarProfileRepository, private state: StateManager) {}

  async initialize() {
    for (const profile of await this.repository.loadAvatarProfiles()) this.profiles.set(profile.ownerId, profile.avatar);
    this.state.setAvatarResolver(ownerId => this.profiles.get(ownerId));
    for (const [ownerId, avatar] of this.profiles) this.state.updateOwnerAvatar(ownerId, avatar);
  }

  get(ownerId: string) {
    return { avatar: structuredClone(this.profiles.get(ownerId) ?? this.state.findSessionByOwnerId(ownerId)?.avatar ?? DEFAULT_AVATAR),
      saved: this.profiles.has(ownerId) };
  }

  async save(ownerId: string, avatar: AvatarConfig) {
    const next = structuredClone(avatar);
    // Serialize one owner's saves so memory, the broadcast, and durable storage agree.
    const pending = (this.writes.get(ownerId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await this.repository.saveAvatarProfile(ownerId, next);
      this.profiles.set(ownerId, next);
      this.state.updateOwnerAvatar(ownerId, next);
    });
    this.writes.set(ownerId, pending);
    try { await pending; } finally { if (this.writes.get(ownerId) === pending) this.writes.delete(ownerId); }
    return { avatar: structuredClone(next), saved: true };
  }
}
