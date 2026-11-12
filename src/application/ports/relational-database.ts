/**
 * Port for relational SQL access (PostgreSQL).
 * Infrastructure: `PgPoolRelationalDatabase` (`pg`). Domain/application never import `pg`.
 */
export type SqlQueryResult<T extends object = Record<string, unknown>> = {
  readonly rows: readonly T[];
  readonly rowCount: number;
};

export interface RelationalDatabase {
  query<T extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<T>>;

  withTransaction<T>(
    work: (db: RelationalDatabase) => Promise<T>,
  ): Promise<T>;

  close(): Promise<void>;
}
