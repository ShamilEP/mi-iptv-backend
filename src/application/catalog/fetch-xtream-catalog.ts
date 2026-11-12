import type { XtreamCatalogSnapshot } from '../../domain/catalog/xtream-catalog.js';
import type {
  XtreamCodesClient,
  XtreamCredentials,
} from '../ports/xtream-codes-client.js';

/**
 * Application entry for Xtream Codes catalog ingest (BE-045).
 */
export class FetchXtreamCatalog {
  constructor(private readonly client: XtreamCodesClient) {}

  execute(credentials: XtreamCredentials): Promise<XtreamCatalogSnapshot> {
    return this.client.fetchCatalog(credentials);
  }
}
