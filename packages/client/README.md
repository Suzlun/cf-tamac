# Management Client runbook

`packages/client` is the Next.js Management Client for Cloudflare Workers. It owns the Client D1 management ledger, encrypted Client Service signing key store, and acting-user derivation. Server Actions and Server Components reach the Agent Service only through `src/server/agent-rpc/**` server-only adapters, which pass resolved context to `@cf-tamac/sdk`. Browser-visible code must not receive Agent credentials, SDK or Connect construction, generated Agent descriptors, signing logic, call Agent origins directly, or expose Agent proxy routes.

`TamacAgentClient` is the Client Service Ed25519 JWT surface. It is distinct from the Provider-owned detached-signature `TamacProviderIngressClient`, whose only ingress methods are `PublishEvent`, `PublishToolResult`, and `PublishDeliveryResult`; Client D1, acting-user, and Client Service JWT context never move to that Provider surface.

## Stage 1-8 generated outputs

- Agent contract descriptors under `src/generated/agent-rpc/**` are mandatory command-owned outputs; Management Client runtime code must not import them directly.
- They are generated from the Agent TypeSpec/proto flow; do not edit them in this package.
- Regenerate from the repository root after Agent contract changes:
  ```bash
  pnpm gen:agent:proto
  pnpm gen:agent:rpc
  pnpm check:codegen
  ```
- Server Actions and Server Components use `src/server/agent-rpc/**` only. The adapter owns Client D1/signing-key/acting-user resolution and delegates binary Connect transport, generated descriptor use, JWT metadata, and normalized RPC errors to `@cf-tamac/sdk`.

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
pnpm check:codegen
pnpm lint:governance
```

Set `AGENT_RPC_ALLOWED_ORIGINS` to a non-empty JSON array of unique canonical HTTPS Agent origins, for example `['https://agent.example.com']` expressed as JSON: `"[\"https://agent.example.com\"]"`. The configuration literal must equal `URL.origin`; do not include a path, query, fragment, username, password, duplicate, or non-canonical default `:443`. Browser registration input is canonicalized and exact-matched against this server-managed policy. The stored Client D1 origin is revalidated before signing-key, acting-user, or SDK transport resolution, so a Client Service JWT is never sent to an unapproved destination.

Set `AGENT_RPC_AUDIENCE` to the same public value as the Agent Worker `AGENT_RPC_AUDIENCE` and `AGENT_CONTROL_PLANE_TRUST.audiences`; it is the required JWT audience, not an origin or a secret. Client UI data comes from Client D1 registry records plus server-side SDK adapter results; Agent domain snapshots are not stored in Client D1.

## Secret handling

- `CLIENT_DB` stores managed Agent metadata, external credential references, and encrypted Client Service signing key records only: Agent ID, RPC origin, display metadata, signing issuer/kid/public fingerprint, key ID, masked hint, encrypted private JWK, status, and timestamps.
- Store Provider or model credential material outside D1 and resolve it only in server-side code. Agent RPC Client Service signing uses the encrypted signing key store, not Provider credential references.
- Provision Client secrets with `wrangler secret put --config packages/client/wrangler.toml CLIENT_CREDENTIAL_ENCRYPTION_KEY`.
- Do not serialize raw Agent tokens, private JWK, encrypted private JWK, Provider secrets, Authorization headers, raw JWT, or signing material into HTML, browser bundles, actions results, local storage, public Client routes, or logs.
- Do not require operators to paste a Client private signing key JSON into Worker Secrets. `CLIENT_CREDENTIAL_ENCRYPTION_KEY` is the encryption root; Agent Worker receives only public-only `AGENT_CONTROL_PLANE_TRUST`.
- Every SDK-backed Server Action maps both outcomes to `displayData`, `safeStatus`, `safeErrorCategory`, and a secret-free `correlationId`. Browser responses never include raw SDK/Connect diagnostics, origin-policy detail, credentials, JWTs, signing material, or Client D1 records.

## Control-plane signing operations

- `Global Settings > Signing Keys` generates Ed25519 key pairs even when there are no managed Agents. Server-side code encrypts the private JWK with `CLIENT_CREDENTIAL_ENCRYPTION_KEY` before writing Client D1.
- `Global Settings > Trust Config Export` emits public-only `AGENT_CONTROL_PLANE_TRUST` JSON for Agent Worker Variables and Secrets. It must not include private key parameter `d`, private JWK plaintext, encrypted private JWK, or raw JWT.
- Agent settings selects an existing global signing key and runs `AgentHealthService.Check` to verify issuer/kid/fingerprint and trust config fingerprint.
- Rotation, emergency revoke, break-glass recovery, staging smoke, and private-key non-exposure checks are documented in `../../docs/operations/agent-control-plane-auth.md`.

## Deployment and Client D1 migration notes

- Deploy Button 用 artifact は repository root の `pnpm gen:deploy-artifacts` から `.deploy/client` に生成され、`deploy-client` branch root へ CI が publish します。artifact branch は手編集しません。
- Deploy the Management Client with `packages/client/wrangler.toml`; the Worker owns `CLIENT_DB` and credential references only, not `AI_AGENT` or Agent-owned storage.
- Deploy Button users can start from `packages/client/.dev.vars.example`; it contains canonical `AGENT_RPC_ALLOWED_ORIGINS`, public `AGENT_RPC_AUDIENCE`, and `CLIENT_CREDENTIAL_ENCRYPTION_KEY`, not a Client private signing key secret.
- Apply reviewed Client D1 migrations with `wrangler d1 execute --config packages/client/wrangler.toml --file packages/client/src/server/db/migrations/<migration>.sql`.
- Migrations must stay limited to managed Agent registry, external credential reference tables, and encrypted Client Service signing key store tables; do not add Agent-domain snapshot tables or plaintext secret/private JWK columns to Client D1.

## Provider interop profile

The Client manages generic Integration installation and inspection through Agent RPC. It records registry/credential references locally, then server-side actions call Agent Integration, Tool, Schedule, Thread, Run, and Config RPCs through the server-only SDK adapter. The Client does not host Provider endpoints and does not proxy Agent or Provider APIs to the browser.

An Integration Provider owns its Ed25519 private signing key and signs canonical text that binds service/method, Agent/Installation identity, operation identity, timestamp, nonce, idempotency key, and unsigned Protobuf body digest/length. The Agent accepts only the three Provider ingress methods after it verifies active Installation/trust key, identity, digest, signature, and its fixed `300_000` ms timestamp window, then creates the verified `INTEGRATION_INSTALLATION` principal before nonce/idempotency and final Agent-local authorization.

## Staging smoke checklist

After Agent and Client staging deploys and any required Client D1 migration, verify:

1. Agent registry create/list/update/open flows persist only Client-owned metadata.
2. Server-side Agent RPC calls render overview/config, Thread/Event/Run/Compaction, Schedule, Tool approval, Integration, and Settings views.
3. `/api/client/*`, `/api/agent*`, and arbitrary Agent proxy probes are not public Agent APIs.
4. Browser responses, bundles, and storage contain no Agent credential, private key, raw JWT signing material, or Provider secret.
5. A canonical allowlist origin can be registered, and a stored origin outside the current `AGENT_RPC_ALLOWED_ORIGINS` policy fails before signing-key or transport resolution.
6. A successful and a failed SDK-backed action each expose only `displayData`, `safeStatus`, `safeErrorCategory`, and a correlation ID; use that ID to correlate server-side logs without placing diagnostics in the Browser.
7. Integration install/uninstall UI remains generic and delegates Provider interop to the Agent Service RPC profile.
