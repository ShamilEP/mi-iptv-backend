export type RealtimeSessionRecord = {
  readonly sessionId: string;
  readonly resumeToken: string;
  readonly accountId: string;
  readonly deviceId: string;
  readonly createdAtUnix: number;
};

/**
 * Resume/reconnect session ledger (BE-077).
 */
export interface RealtimeSessionStore {
  save(record: RealtimeSessionRecord, ttlSeconds: number): Promise<void>;
  findByResumeToken(resumeToken: string): Promise<RealtimeSessionRecord | null>;
  delete(sessionId: string): Promise<void>;
}
