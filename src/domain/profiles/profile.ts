/**
 * Account profile row (Backend `app.profiles` / BE-013 cascade + export).
 * Registration seeds one default (BE-029); Release 1 allows several per account (BE-036 / FR-022).
 */
export type Profile = {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly language: string;
  readonly region: string | null;
  readonly isDefault: boolean;
  readonly autoplay: boolean;
  readonly subtitlePrefs: Readonly<Record<string, unknown>>;
  /** Parental / kid rules (BE-037). Never store the clear PIN here. */
  readonly restrictions: Readonly<Record<string, unknown>>;
  /**
   * Argon2id PHC of parental PIN (BE-037). Null when unset.
   * Never expose in API responses — use `pinConfigured` on public views.
   */
  readonly pinHash: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
