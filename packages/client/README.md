# Management Client runbook

`packages/client` is the Next.js Management Client for Cloudflare Workers. It owns the Client D1 management ledger and credential references, then calls the Agent Service from server-side modules with generated Agent RPC descriptors. Browser-visible code must not receive Agent credentials, construct Agent RPC clients, call Agent origins directly, or expose Agent proxy routes.

## Stage 1-8 generated outputs

- Agent contract descriptors consumed by the Client are command-owned under `src/generated/agent-rpc/**`.
- They are generated from the Agent TypeSpec/proto flow; do not edit them in this package.
- Regenerate from the repository root after Agent contract changes:
  ```bash
  pnpm gen:agent:proto
  pnpm gen:agent:rpc
  pnpm check:codegen
  ```
- Stage 8 Client server actions and Server Components should import generated Agent RPC descriptors only from this package's generated tree and call them through server-only modules.

## Local development

```bash
corepack enable
pnpm install
pnpm dev:agent
pnpm dev:client
```

Useful local checks:

```bash
pnpm check:client
pnpm test:client
pnpm lint
```

Use `AGENT_RPC_DEFAULT_ORIGIN` for local Agent RPC origin defaults. Client UI data comes from Client D1 registry records plus server-side Agent RPC; Agent domain snapshots are not stored in Client D1.

## Secret handling

- `CLIENT_DB` stores managed Agent metadata, external credential references, and encrypted Client Service signing key records only: Agent ID, RPC origin, display metadata, signing issuer/kid/public fingerprint, key ID, masked hint, encrypted private JWK, status, and timestamps.
- Store Provider or model credential material outside D1 and resolve it only in server-side code. Agent RPC Client Service signing uses the encrypted signing key store, not Provider credential references.
- Provision Client secrets with `wrangler secret put --config packages/client/wrangler.toml CLIENT_CREDENTIAL_ENCRYPTION_KEY`.
- Do not serialize raw Agent tokens, private JWK, encrypted private JWK, Provider secrets, Authorization headers, raw JWT, or signing material into HTML, browser bundles, actions results, local storage, public Client routes, or logs.
- Do not require operators to paste a Client private signing key JSON into Worker Secrets. `CLIENT_CREDENTIAL_ENCRYPTION_KEY` is the encryption root; Agent Worker receives only public-only `AGENT_CONTROL_PLANE_TRUST`.

## Control-plane signing operations

- `Global Settings > Signing Keys` generates Ed25519 key pairs even when there are no managed Agents. Server-side code encrypts the private JWK with `CLIENT_CREDENTIAL_ENCRYPTION_KEY` before writing Client D1.
- `Global Settings > Trust Config Export` emits public-only `AGENT_CONTROL_PLANE_TRUST` JSON for Agent Worker Variables and Secrets. It must not include private key parameter `d`, private JWK plaintext, encrypted private JWK, or raw JWT.
- Agent settings selects an existing global signing key and runs `AgentHealthService.Check` to verify issuer/kid/fingerprint and trust config fingerprint.
- Rotation, emergency revoke, break-glass recovery, staging smoke, and private-key non-exposure checks are documented in `../../docs/operations/agent-control-plane-auth.md`.

## Deployment and Client D1 migration notes

- Deploy Button 用 artifact は repository root の `pnpm gen:deploy-artifacts` から `.deploy/client` に生成され、`deploy-client` branch root へ CI が publish します。artifact branch は手編集しません。
- Deploy the Management Client with `packages/client/wrangler.toml`; the Worker owns `CLIENT_DB` and credential references only, not `AI_AGENT` or Agent-owned storage.
- Deploy Button users can start from `packages/client/.dev.vars.example`; it contains `AGENT_RPC_DEFAULT_ORIGIN` and `CLIENT_CREDENTIAL_ENCRYPTION_KEY`, not a Client private signing key secret.
- Apply reviewed Client D1 migrations with `wrangler d1 execute --config packages/client/wrangler.toml --file packages/client/src/server/db/migrations/<migration>.sql`.
- Migrations must stay limited to managed Agent registry, external credential reference tables, and encrypted Client Service signing key store tables; do not add Agent-domain snapshot tables or plaintext secret/private JWK columns to Client D1.

## Provider interop profile

The Client manages generic Integration installation and inspection through Agent RPC. It records registry/credential references locally, then server-side actions call Agent Integration, Tool, Schedule, Thread, Run, and Config RPCs through generated Connect clients. The Client does not host Provider endpoints and does not proxy Agent or Provider APIs to the browser.

## Staging smoke checklist

After Agent and Client staging deploys and any required Client D1 migration, verify:

1. Agent registry create/list/update/open flows persist only Client-owned metadata.
2. Server-side Agent RPC calls render overview/config, Thread/Event/Run/Compaction, Schedule, Tool approval, Integration, and Settings views.
3. `/api/client/*`, `/api/agent*`, and arbitrary Agent proxy probes are not public Agent APIs.
4. Browser responses, bundles, and storage contain no Agent credential, private key, raw JWT signing material, or Provider secret.
5. Integration install/uninstall UI remains generic and delegates Provider interop to the Agent Service RPC profile.
