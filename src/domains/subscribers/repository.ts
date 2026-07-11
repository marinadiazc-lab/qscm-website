import type {
  SubscriberPreferences,
  SubscriberProviderSync,
  SubscriberRecord,
  SubscriberSearchInput,
  SubscriberSearchResult,
  SubscriberSyncRequest,
} from "./types";
import { normalizeSubscriberEmail } from "./service";

export interface InMemorySubscriberRepositorySeed {
  subscribers?: readonly SubscriberRecord[];
  preferences?: readonly SubscriberPreferences[];
  syncs?: readonly SubscriberProviderSync[];
}

export class InMemorySubscriberRepository {
  private readonly subscribers = new Map<string, SubscriberRecord>();
  private readonly preferences = new Map<string, SubscriberPreferences>();
  private readonly syncs = new Map<string, SubscriberProviderSync>();
  private syncSequence = 1;

  constructor(seed: InMemorySubscriberRepositorySeed = {}) {
    seed.subscribers?.forEach((subscriber) => {
      this.subscribers.set(subscriber.id, cloneSubscriber(subscriber));
    });
    seed.preferences?.forEach((preferences) => {
      this.preferences.set(preferences.subscriberId, clonePreferences(preferences));
    });
    seed.syncs?.forEach((sync) => {
      this.syncs.set(syncKey(sync.subscriberId, sync.provider), cloneSync(sync));
    });
  }

  saveSubscriber(subscriber: SubscriberRecord): SubscriberRecord {
    const stored = cloneSubscriber(subscriber);
    this.subscribers.set(stored.id, stored);
    return cloneSubscriber(stored);
  }

  findSubscriberById(id: string): SubscriberRecord | undefined {
    const subscriber = this.subscribers.get(id);
    return subscriber ? cloneSubscriber(subscriber) : undefined;
  }

  findSubscriberByEmail(publicationId: string, email: string): SubscriberRecord | undefined {
    const normalizedEmail = normalizeSubscriberEmail(email);
    const subscriber = Array.from(this.subscribers.values()).find(
      (candidate) =>
        candidate.publicationId === publicationId &&
        normalizeSubscriberEmail(candidate.email) === normalizedEmail,
    );

    return subscriber ? cloneSubscriber(subscriber) : undefined;
  }

  listSubscribers(input: SubscriberSearchInput): SubscriberSearchResult[] {
    const query = input.query ? normalizeSubscriberEmail(input.query) : undefined;

    return Array.from(this.subscribers.values())
      .filter((subscriber) => subscriber.publicationId === input.publicationId)
      .filter((subscriber) => (input.status ? subscriber.status === input.status : true))
      .filter((subscriber) => {
        if (!query) return true;

        const name =
          typeof subscriber.metadata.name === "string"
            ? subscriber.metadata.name.toLowerCase()
            : "";

        return normalizeSubscriberEmail(subscriber.email).includes(query) || name.includes(query);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, input.limit ?? 50)
      .map((subscriber) => ({
        subscriber: cloneSubscriber(subscriber),
        preferences: this.findPreferences(subscriber.id),
        syncs: this.listProviderSyncs(subscriber.id),
      }));
  }

  savePreferences(preferences: SubscriberPreferences): SubscriberPreferences {
    const stored = clonePreferences(preferences);
    this.preferences.set(stored.subscriberId, stored);
    return clonePreferences(stored);
  }

  findPreferences(subscriberId: string): SubscriberPreferences | undefined {
    const preferences = this.preferences.get(subscriberId);
    return preferences ? clonePreferences(preferences) : undefined;
  }

  saveProviderSync(sync: SubscriberProviderSync): SubscriberProviderSync {
    const stored = cloneSync(sync);
    this.syncs.set(syncKey(stored.subscriberId, stored.provider), stored);
    return cloneSync(stored);
  }

  findProviderSync(subscriberId: string, provider: string): SubscriberProviderSync | undefined {
    const sync = this.syncs.get(syncKey(subscriberId, provider));
    return sync ? cloneSync(sync) : undefined;
  }

  listProviderSyncs(subscriberId: string): SubscriberProviderSync[] {
    return Array.from(this.syncs.values())
      .filter((sync) => sync.subscriberId === subscriberId)
      .sort((a, b) => a.provider.localeCompare(b.provider))
      .map(cloneSync);
  }

  listPendingProviderSyncs(provider: string, limit = 50): SubscriberProviderSync[] {
    return Array.from(this.syncs.values())
      .filter((sync) => sync.provider === provider && sync.syncStatus === "pending")
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit)
      .map(cloneSync);
  }

  queueSync(request: SubscriberSyncRequest, now: Date): boolean {
    const current = this.findProviderSync(request.subscriberId, request.provider);
    this.saveProviderSync({
      id: current?.id ?? `sync_${this.syncSequence++}`,
      subscriberId: request.subscriberId,
      provider: request.provider,
      providerContactId: current?.providerContactId,
      syncStatus: "pending",
      lastSyncedAt: current?.lastSyncedAt,
      metadata: {
        ...(current?.metadata ?? {}),
        ...(request.metadata ?? {}),
        pendingReason: request.reason,
      },
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });

    return true;
  }
}

function syncKey(subscriberId: string, provider: string) {
  return `${subscriberId}:${provider}`;
}

function cloneSubscriber(subscriber: SubscriberRecord): SubscriberRecord {
  return {
    ...subscriber,
    subscribedAt: new Date(subscriber.subscribedAt),
    unsubscribedAt: cloneDate(subscriber.unsubscribedAt),
    bouncedAt: cloneDate(subscriber.bouncedAt),
    complainedAt: cloneDate(subscriber.complainedAt),
    suppressedAt: cloneDate(subscriber.suppressedAt),
    metadata: { ...subscriber.metadata },
    createdAt: new Date(subscriber.createdAt),
    updatedAt: new Date(subscriber.updatedAt),
  };
}

function clonePreferences(preferences: SubscriberPreferences): SubscriberPreferences {
  return {
    ...preferences,
    metadata: { ...preferences.metadata },
    updatedAt: new Date(preferences.updatedAt),
  };
}

function cloneSync(sync: SubscriberProviderSync): SubscriberProviderSync {
  return {
    ...sync,
    lastSyncedAt: cloneDate(sync.lastSyncedAt),
    metadata: { ...sync.metadata },
    createdAt: new Date(sync.createdAt),
    updatedAt: new Date(sync.updatedAt),
  };
}

function cloneDate(date: Date | undefined) {
  return date ? new Date(date) : undefined;
}
