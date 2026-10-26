import type { SessionCredentials, SessionPort } from "../api/session-port";
import { ApiError } from "../api/errors";
import {
  SessionStorageError,
  type SessionGrant,
  type SessionSnapshot,
  type SessionStore,
  type SessionTokens,
  type SessionTransport,
  type StoredSession,
} from "./types";

interface Options {
  store: SessionStore;
  transport: SessionTransport;
  onBoundary?: (generation: number) => void;
  onRevoked?: (generation: number) => void;
}
export class SessionManager implements SessionPort {
  #snapshot: SessionSnapshot = Object.freeze({
    status: "restoring",
    generation: 0,
    sessionId: null,
    networkError: false,
    storageError: false,
  });
  #credentials: SessionCredentials | null = null;
  #record: StoredSession | null = null;
  #listeners = new Set<() => void>();
  #writes: Promise<unknown> = Promise.resolve();
  #controller = new AbortController();
  #flight: { generation: number; promise: Promise<SessionCredentials | null> } | undefined;
  #restoration: { generation: number; promise: Promise<void> } | undefined;
  constructor(private readonly options: Options) {}
  snapshot = (): SessionSnapshot => this.#snapshot;
  credentials = (): SessionCredentials | null => this.#credentials;
  generation = (): number => this.#snapshot.generation;
  signal = (): AbortSignal => this.#controller.signal;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #publish(update: Partial<SessionSnapshot>) {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...update });
    for (const listener of this.#listeners) listener();
  }
  #boundary(status: SessionSnapshot["status"]): number {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#credentials = null;
    this.#record = null;
    this.#flight = undefined;
    const generation = this.generation() + 1;
    this.options.onBoundary?.(generation);
    this.#publish({
      status,
      generation,
      sessionId: null,
      networkError: false,
      storageError: false,
    });
    return generation;
  }
  #persist(generation: number, operation: () => Promise<void>): Promise<boolean> {
    const job = this.#writes.then(async () => {
      if (generation !== this.generation()) return false;
      await operation();
      return generation === this.generation();
    });
    this.#writes = job.catch(() => undefined);
    return job;
  }
  async #storageFailure(generation: number): Promise<never> {
    if (generation === this.generation()) {
      const next = this.#boundary("anonymous");
      this.#publish({ storageError: true });
      try {
        await this.#persist(next, () => this.options.store.clear());
      } catch {
        /* The public error stays sanitized and memory stays anonymous. */
      }
    }
    throw new SessionStorageError();
  }
  async #commit(generation: number, tokens: SessionTokens): Promise<SessionCredentials | null> {
    const discard = () => {
      void Promise.resolve()
        .then(() =>
          this.options.transport.revoke(tokens.data.id, tokens.data.attributes.accessToken),
        )
        .catch(() => undefined);
      return null;
    };
    if (generation !== this.generation()) return discard();
    const { id, attributes } = tokens.data;
    const stored = {
      sessionId: id,
      refreshToken: attributes.refreshToken,
      refreshTokenExpiresAt: attributes.refreshTokenExpiresAt,
    };
    this.#record = null; // Rotation has happened: the previous token must never be retried after a write failure.
    try {
      if (!(await this.#persist(generation, () => this.options.store.write(stored))))
        return discard();
    } catch {
      if (generation !== this.generation()) return discard();
      return this.#storageFailure(generation);
    }
    this.#record = stored;
    this.#credentials = Object.freeze({ generation, accessToken: attributes.accessToken });
    this.#publish({ status: "authenticated", sessionId: id, networkError: false });
    return this.#credentials;
  }

  async signIn(grant: SessionGrant): Promise<void> {
    // Do not populate this generation's optional-auth queries with anonymous responses mid-login.
    const generation = this.#boundary("restoring");
    try {
      if (!(await this.#persist(generation, () => this.options.store.clear()))) return;
    } catch {
      return this.#storageFailure(generation);
    }
    try {
      const tokens = await this.options.transport.grant(grant, this.signal());
      await this.#commit(generation, tokens);
    } catch (error) {
      if (generation === this.generation()) this.#publish({ status: "anonymous" });
      throw error;
    }
  }
  async signOut(): Promise<void> {
    const sessionId = this.#snapshot.sessionId,
      credentials = this.#credentials;
    const generation = this.#boundary("anonymous");
    const revoke =
      sessionId && credentials
        ? this.options.transport.revoke(sessionId, credentials.accessToken).catch(() => undefined)
        : Promise.resolve();
    try {
      await this.#persist(generation, () => this.options.store.clear());
    } catch {
      return this.#storageFailure(generation);
    }
    await revoke;
  }
  restore(): Promise<void> {
    if (this.#restoration?.generation === this.generation()) return this.#restoration.promise;
    const generation = this.#boundary("restoring");
    const promise = this.#restore(generation);
    this.#restoration = { generation, promise };
    void promise
      .finally(() => {
        if (this.#restoration?.promise === promise) this.#restoration = undefined;
      })
      .catch(() => undefined);
    return promise;
  }
  async #restore(generation: number): Promise<void> {
    let stored: StoredSession | null;
    try {
      await this.#writes;
      stored = await this.options.store.read();
    } catch {
      return this.#storageFailure(generation);
    }
    if (generation !== this.generation()) return;
    if (!stored) {
      this.#publish({ status: "anonymous" });
      return;
    }
    this.#record = stored;
    await this.#rotate(generation, stored);
  }
  refresh(failed: SessionCredentials): Promise<SessionCredentials | null> {
    if (failed.generation !== this.generation() || !this.#credentials) return Promise.resolve(null);
    if (failed.accessToken !== this.#credentials.accessToken)
      return Promise.resolve(this.#credentials);
    if (this.#flight?.generation === failed.generation) return this.#flight.promise;
    if (!this.#record) return Promise.resolve(null);
    const promise = this.#rotate(failed.generation, this.#record);
    this.#flight = { generation: failed.generation, promise };
    void promise
      .finally(() => {
        if (this.#flight?.promise === promise) this.#flight = undefined;
      })
      .catch(() => undefined);
    return promise;
  }
  async #rotate(generation: number, stored: StoredSession): Promise<SessionCredentials | null> {
    let tokens: SessionTokens;
    try {
      tokens = await this.options.transport.grant(
        { grantType: "refreshToken", refreshToken: stored.refreshToken },
        this.signal(),
      );
    } catch (error) {
      if (generation !== this.generation()) return null;
      if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
        const next = this.#boundary("anonymous");
        try {
          this.options.onRevoked?.(next);
        } catch {
          /* An observer must not prevent persisted credential removal. */
        }
        try {
          await this.#persist(next, () => this.options.store.clear());
        } catch {
          return this.#storageFailure(next);
        }
      } else
        this.#publish({
          status: this.#credentials ? "authenticated" : "anonymous",
          networkError: true,
        });
      return null;
    }
    return this.#commit(generation, tokens);
  }
}
