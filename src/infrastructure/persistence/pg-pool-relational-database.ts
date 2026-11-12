import pg from 'pg';
import type {
  RelationalDatabase,
  SqlQueryResult,
} from '../../application/ports/relational-database.js';

const { Pool } = pg;

export type PgPoolRelationalDatabaseOptions = {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
};

/**
 * PostgreSQL adapter using approved `pg` Pool. Wrap all SQL access through this port.
 */
export class PgPoolRelationalDatabase implements RelationalDatabase {
  private readonly pool: pg.Pool;

  constructor(options: PgPoolRelationalDatabaseOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
      idleTimeoutMillis: options.idleTimeoutMillis ?? 10_000,
      connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    });
  }

  async query<T extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlQueryResult<T>> {
    const result = await this.pool.query(
      text,
      values === undefined ? undefined : [...values],
    );
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0,
    };
  }

  async withTransaction<T>(
    work: (db: RelationalDatabase) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    const tx: RelationalDatabase = {
      query: async <R extends object = Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ): Promise<SqlQueryResult<R>> => {
        const result = await client.query(
          text,
          values === undefined ? undefined : [...values],
        );
        return {
          rows: result.rows as R[],
          rowCount: result.rowCount ?? 0,
        };
      },
      withTransaction: async () => {
        throw new Error('Nested transactions are not supported');
      },
      close: async () => {
        /* client released by outer finally */
      },
    };

    try {
      await client.query('BEGIN');
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* prefer original error */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPgPoolRelationalDatabaseFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PgPoolRelationalDatabase | null {
  const connectionString = env['DATABASE_URL']?.trim();
  if (connectionString === undefined || connectionString.length === 0) {
    return null;
  }
  return new PgPoolRelationalDatabase({ connectionString });
}
