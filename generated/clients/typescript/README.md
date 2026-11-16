# Mi IPTV TypeScript client stubs

Generated from `openapi/openapi.json` (v1.0.0) by `npm run openapi:generate-clients`.

## Usage

```ts
import { MiIptvApiClient } from './client.js';

const client = new MiIptvApiClient({
  baseUrl: 'http://localhost:4011', // OpenAPI mock (`npm run mock:api`)
  getAccessToken: () => process.env.MI_IPTV_ACCESS_TOKEN,
  defaultHeaders: {
    'x-account-id': process.env.MI_IPTV_ACCOUNT_ID ?? '',
  },
});

const health = await client.getHealth();
const hits = await client.searchCatalog({ q: 'news', limit: 10 });
```

Query parameters are typed per operation. Custom headers such as `x-account-id` go through `defaultHeaders` (Sprint 0 stand-ins until JWT scope lands everywhere).

Regenerate after OpenAPI changes; do not hand-edit `types.ts` / `client.ts`.
