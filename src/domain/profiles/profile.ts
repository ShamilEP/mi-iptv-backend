/**
 * Account profile row (Backend `app.profiles` / BE-013 cascade + export).
 * MVP typically has one default profile (created at registration in BE-029).
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
  readonly restrictions: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
