import type { SourceRepository } from '../ports/source-repository.js';
import {
  toSourcePublicView,
  type SourcePublicView,
} from './source-public-view.js';

export class ListSources {
  constructor(private readonly sources: SourceRepository) {}

  async execute(accountId: string): Promise<readonly SourcePublicView[]> {
    const rows = await this.sources.listByAccount(accountId);
    return rows.map(toSourcePublicView);
  }
}
