import type {
  RealtimeSessionRecord,
  RealtimeSessionStore,
} from '../../application/ports/realtime-session-store.js';

type Entry = {
  readonly record: RealtimeSessionRecord;
  expiresAtMs: number;
};

/**
 * Process-local resume token store (BE-077).
 */
export class InMemoryRealtimeSessionStore implements RealtimeSessionStore {
  private readonly bySession = new Map<string, Entry>();
  private readonly byResume = new Map<string, string>();

  async save(record: RealtimeSessionRecord, ttlSeconds: number): Promise<void> {
    const expiresAtMs = Date.now() + ttlSeconds * 1000;
    this.bySession.set(record.sessionId, { record, expiresAtMs });
    this.byResume.set(record.resumeToken, record.sessionId);
  }

  async findByResumeToken(
    resumeToken: string,
  ): Promise<RealtimeSessionRecord | null> {
    const sessionId = this.byResume.get(resumeToken);
    if (sessionId === undefined) {
      return null;
    }
    const entry = this.bySession.get(sessionId);
    if (!entry || entry.expiresAtMs <= Date.now()) {
      this.byResume.delete(resumeToken);
      if (entry) {
        this.bySession.delete(sessionId);
      }
      return null;
    }
    return entry.record;
  }

  async delete(sessionId: string): Promise<void> {
    const entry = this.bySession.get(sessionId);
    if (!entry) {
      return;
    }
    this.bySession.delete(sessionId);
    this.byResume.delete(entry.record.resumeToken);
  }
}
