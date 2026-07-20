# Bethesda n8n Fork — Change Guide

## Authentication

### Upstream Architecture

n8n's auth system has two distinct phases: **login** (proving who you are)
and **session** (proving you already logged in). They use different
mechanisms.

#### Instance-wide login method

n8n supports multiple ways to log in. The active method is an instance-wide
setting — not per-user. Only one is active at a time, stored in the database
and held in memory. Admins can switch it via the Settings UI.

| Method | License required | Mechanism |
|--------|-----------------|-----------|
| `email` | None (Community) | Username + password |
| `ldap` | Enterprise (`feat:ldap`) | LDAP directory bind |
| `saml` | Enterprise (`feat:saml`) | SAML SSO redirect |
| `oidc` | Enterprise (`feat:oidc`) | OIDC SSO redirect |

On every page load, the frontend calls `GET /rest/settings`. The backend
includes the active method in the response. The frontend uses this to decide
which login UI to show.

#### Logging in

| Method | Controller / module | Mechanism |
|--------|-------------------|-----------|
| `email` | `AuthController` (`POST /rest/login`) | Password verified against DB hash; MFA validated if enabled |
| `ldap` | `AuthController` + `ldap.ee` module (`POST /rest/login`) | LDAP bind against configured directory server |
| `saml` | `sso-saml` module (`GET /rest/sso/saml/initsso` → IdP → `POST /rest/sso/saml/acs`) | IdP-initiated redirect; assertion consumed on callback |
| `oidc` | `sso-oidc` module (similar redirect chain) | OIDC authorization code flow |

All login paths end by issuing an `n8n-auth` cookie containing a signed JWT.

#### Authenticated requests (session)

 Every subsequent request — browser navigation, API calls, the realtime
websocket connection used for workflow execution updates — is authenticated
by `AuthService.createAuthMiddleware` (`packages/cli/src/auth/auth.service.ts`), which runs before the route handler.

`packages/cli/src/server.ts` applies this session middleware to all UI and
REST endpoints, static type files, and the push websocket. A separate
`/setup` route is shown instead when the instance has no owner account yet —
see **Roles** below. Once the owner exists, `/setup` redirects away and
normal auth applies.
On the frontend, a Vue Router guard redirects any unauthenticated navigation
to the signin page.

#### Roles

Every user has exactly one global role, stored as a foreign key (`roleSlug`)
on the `user` table.

The role records themselves live in a separate `role`
table and are seeded at startup from the built-in role definitions in
`packages/@n8n/permissions`. Built-in roles have `systemRole = true` and
cannot be edited.

**Global roles** (determine instance-level access):

| Role slug | Display name | Notes |
|-----------|-------------|-------|
| `global:owner` | Owner | One per instance. Created by the `/setup` first-launch wizard. Full access; role cannot be changed or removed. |
| `global:admin` | Admin | Full administrative access. Assigning this role requires the `feat:advancedPermissions` Enterprise license. |
| `global:member` | Member | Standard user; can create and run workflows within their projects. Default for invited users. |
| `global:chatUser` | Chat User | Restricted to chatting with Chat-enabled workflows; no workflow editing. |

There are also project-scoped roles (`project:owner`, `project:admin`,
`project:editor`, `project:viewer`) and resource-scoped roles
(`workflow:owner`, `credential:owner`, etc.), but those govern access within
a project, not instance-level auth.

The `/setup` wizard is shown when no `global:owner` account exists yet. Once
the owner is created, the route is inaccessible.

> **Note:** n8n also has a public REST API (`/api/v1/…`) authenticated via
> API keys rather than session cookies. It requires an Enterprise/Cloud
> license and is always disabled in this deployment — out of scope here.


### Cognito Authentication

| File | Purpose |
| --- | --- |
| `packages/@n8n/config/src/configs/cognito.config.ts` | Cognito config schema (`globalConfig.cognito`) |
| `packages/cli/src/auth/cognito-auth.service.ts` | ALB header validation + JIT user provisioning + JWT cookie issuance |
| `packages/cli/src/server.ts` | Mounts the global Cognito pre-middleware after `cookieParser()` |
| `packages/cli/src/services/frontend.service.ts` | Forces `getShowSetupOnFirstLoad()` to `false` — users are provisioned JIT by Cognito, so the built-in first-run owner wizard must never render |

The design goal is to make Cognito look identical to standard n8n
authentication to every downstream request handler. A single global
pre-middleware validates the ALB identity headers once per request,
provisions/loads the user, and issues a real `n8n-auth` JWT cookie. From
that point on, `AuthService.createAuthMiddleware(...)` handles the request
exactly as upstream — no controllers, push handlers, or chat-hub code paths
need to know Cognito exists.

**Config** — `packages/@n8n/config/src/configs/cognito.config.ts`.
`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `AWS_REGION`, group names
(`N8N_COGNITO_OWNER_GROUP`, `N8N_COGNITO_ADMIN_GROUP`), and claim-name
overrides. Registered as `globalConfig.cognito` via `@Nested` in
`packages/@n8n/config/src/index.ts`.

**Auth service** — `packages/cli/src/auth/cognito-auth.service.ts`.
`createAuthMiddleware()`:

1. Fast-path: if `req.cookies['n8n-auth']` is present, call `next()` — the
   standard `AuthService` middleware will validate it downstream.
2. Otherwise, validate the `x-amzn-oidc-data` (identity) and
   `x-amzn-oidc-accesstoken` (groups) headers against the cached ALB
   public keys and Cognito issuer/client checks.
3. `findOrCreateUser` (JIT provisioning, group→role mapping).
4. `authService.issueCookie(res, user, false, req.browserId)` — sets the
   real `n8n-auth` JWT cookie on the response.
5. `next()`. If no ALB headers are present, the middleware still calls
   `next()`; the standard downstream auth then 401s if the route requires it.

**Server wiring** — `packages/cli/src/server.ts`. One line, mounted
immediately after `cookieParser()`:

```ts
this.app.use(Container.get(CognitoAuthService).createAuthMiddleware());
```

This runs before `ControllerRegistry.activate(app)`, so by the time any
per-route `AuthService` middleware runs, the JWT cookie is already set.

**jws patch** — `patches/jws@4.0.1.patch`. AWS signs identity tokens
with `=` padding in each segment; the upstream regex rejects it. The patch
adds `=` to each character class. Listed under `patchedDependencies` in
`package.json` and added to `PATCHES_TO_KEEP` in `scripts/build-n8n.mjs`.

---

## AWS Bedrock Built-in LLM Provider

Add a single new provider — `awsBedrockBuiltIn` — authenticates via the ECS task role.

1. Add `awsBedrockBuiltIn` to the Chat Hub provider registry alongside the upstream providers.
2. Ship a new node for workflows.

| File | Purpose |
| --- | --- |
| `packages/@n8n/nodes-langchain/nodes/llms/LmChatAwsBedrockBuiltIn/LmChatAwsBedrockBuiltIn.node.ts` | New Bedrock LLM node for workflows. |
| `packages/@n8n/nodes-langchain/package.json` | Registers the new Bedrock node. |
| `packages/@n8n/api-types/src/chat-hub.ts` | Added `awsBedrockBuiltIn` to provider schema and discriminated union; added `PROVIDER_CREDENTIAL_TYPE_MAP` entry pointing at the new `builtin` credential type. |
| `packages/cli/src/modules/chat-hub/chat-hub.constants.ts` | Added `PROVIDER_NODE_TYPE_MAP` entry mapping `awsBedrockBuiltIn` to the new node. |
| `packages/cli/src/modules/chat-hub/chat-hub.models.service.ts` | Added model fetching case; credential short-circuit guard now skips any provider whose credential type is `'builtin'`. |
| `packages/cli/src/modules/chat-hub/context-limits.ts` | Added empty `awsBedrockBuiltIn` entry. |
| `packages/@n8n/nodes-langchain/credentials/BuiltIn.credentials.ts` | New placeholder credential type so `<CredentialIcon credential-type-name="builtin" />` resolves to a real icon. `__skipManagedCreation = true` hides it from the "New credential" picker. |
| `packages/@n8n/nodes-langchain/credentials/icons/BuiltIn.{svg,dark.svg}` | Icon assets for the `builtin` credential type. |
| `packages/frontend/editor-ui/src/features/ai/chatHub/constants.ts` | Added `providerDisplayNames` entry: `"AWS Bedrock (Built-in)"`. |
| `packages/frontend/editor-ui/src/features/agents/provider-capabilities.ts` | Added `awsBedrockBuiltIn` entry with `thinking: 'budgetTokens'` (Claude supports extended thinking with budget tokens). |
| `packages/frontend/editor-ui/src/features/agents/provider-mapping.ts` | Added `awsBedrockBuiltIn: 'aws-bedrock'` to `CHATHUB_TO_CATALOG`. |
| `packages/frontend/editor-ui/src/features/ai/chatHub/ChatView.vue` | Chat input credential check treats any provider whose `PROVIDER_CREDENTIAL_TYPE_MAP` entry is `'builtin'` as pre-authenticated, so the "missing credentials" callout stays hidden and the input stays enabled. |


### Upstream architecture

Chat Hub supports 15 LLM providers upstream, defined in `chatHubLLMProviderSchema`
(in `packages/@n8n/api-types/src/chat-hub.ts`). For each provider to work, five components must be defined:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Zod schema** | `packages/@n8n/api-types/src/chat-hub.ts` | TypeScript type definition describing the provider's configuration shape (e.g., OpenAI config includes `apiKey`, Bedrock doesn't). |
| **`PROVIDER_CREDENTIAL_TYPE_MAP` entry** | `packages/@n8n/api-types/src/chat-hub.ts` | Mapping that says "when using this provider, expect the user to supply *this type* of credential". Example: `openai → credential_type_openai_api_key`. |
| **`ChatHubModelsService.fetchModelsForProvider()` branch** | `packages/cli/src/modules/chat-hub/` | Backend code that fetches the list of available models for this provider (e.g., calling OpenAI API to list `gpt-4o`, `gpt-4-turbo`). |
| **`PROVIDER_CAPABILITIES` descriptor** | `packages/frontend/editor-ui/src/features/agents/provider-capabilities.ts` | Metadata describing what features this provider supports (vision? extended thinking? etc.). Used by the UI to show/hide relevant options. |
| **`providerDisplayNames` & `CHATHUB_TO_CATALOG`** | `packages/frontend/editor-ui/src/features/ai/chatHub/constants.ts` & `packages/frontend/editor-ui/src/features/agents/provider-mapping.ts` | Frontend-facing strings: human-readable label (e.g., "OpenAI", "AWS Bedrock") and catalog ID for icon/branding. |

**Instance AI** is the AI assistant feature accessible in the UI. Upstream, it resolves which LLM to use by:

1. Calling `CredentialsFinderService.findCredentialsForUser(user, ['credential:read'])` — queries the n8n database for all credentials the user owns or has access to via project roles.
2. Filtering those credentials by their `type` field against `PROVIDER_CREDENTIAL_TYPE_MAP`.
3. Reading the user's stored preference and extracting the encrypted API key.

`InstanceAiSettingsService.resolveModelConfig(user)` (in `packages/cli/src/modules/instance-ai/`) builds a
`provider/model` id + `apiKey` + optional `baseUrl` at runtime.
`InstanceAiService.resolveAgentModelConfig` (same package) layers on proxy auth and
`HTTP_PROXY` handling.

**LangChain nodes** — located in `packages/@n8n/nodes-langchain/nodes/llms/`, each provider gets a node that wraps the LangChain integration. Nodes inherit from `N8nLlmNode` base class and expose:
- Credential selection (if provider requires one)
- Model dropdown (dynamically fetched or hardcoded)
- Settings like temperature, max tokens, etc.
- Integration with n8n's workflow execution, error handling, and tracing

**Provider registration** — Adding a new provider means filling in all five touch-points from the upstream architecture table above.

---

## Build & Deployment Infrastructure

Target ECS Fargate on Graviton (arm64).

| Script / Config | Change |
|---|---|
| `scripts/build-n8n.mjs` | Added `'jws'` to `PATCHES_TO_KEEP` — ensures the jws patch survives the build. |
| `scripts/dockerize-n8n.mjs` | Respects a new `DOCKER_PLATFORM` env var that overrides host-detection logic. |
| `scripts/push-to-ecr.sh` (new) | Wraps `pnpm build:docker`, ECR repo management (`describe`, `create`), Docker auth, and `docker push`. Defaults to `linux/arm64` and git short SHA. Auto-creates repo if missing; publishes both SHA tag and `:latest`. |
| `DOCKER_PLATFORM` env var | Defaults to `linux/arm64` (Graviton arm64). Passed to `dockerize-n8n.mjs` to set the build platform. |

---

## Operational Env Var Cheat-Sheet

```
# --- Cognito ---
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXX
N8N_COGNITO_OWNER_GROUP=n8n-owners
N8N_COGNITO_ADMIN_GROUP=n8n-admins

# --- Instance AI ---
N8N_INSTANCE_AI_MODEL=aws-bedrock/us.anthropic.claude-opus-4-6-v1  # default

# --- Build ---
DOCKER_PLATFORM=linux/arm64
ECR_REPO_NAME=n8n
IMAGE_TAG=<git short sha>
```

---

## Developer Workflows

### Updating from Upstream

1. **Fetch upstream changes:**
   ```bash
   git remote add upstream https://github.com/n8n-io/n8n.git
   git fetch upstream master
   ```

2. **Rebase or merge into your branch:**
   ```bash
   git rebase upstream/master
   # or
   git merge upstream/master
   ```

3. **Resolve conflicts** (especially in Bedrock/Cognito customizations). Check `BETHSOFT.md` for files that should not be modified.

4. **Test locally:**
   ```bash
   pnpm install
   pnpm build
   pnpm test:affected
   ```

### Build & Push to ECR

1. **Build and push:**
   ```bash
   ./scripts/push-to-ecr.sh
   ```

2. **Verify in ECR:**
   ```bash
   aws ecr describe-images --repository-name n8n --region us-east-1
   ```

### Local Development

**Start the full stack locally with hot reload:**
```bash
pnpm dev
```

**Run a specific test:**
```bash
cd packages/cli
pnpm test src/auth/cognito-auth.service.ts
```

**Type-check before committing:**
```bash
pnpm typecheck
```


---

## Guidance for AI Agents

**Minimize changes to upstream files.** This fork tracks n8n upstream
and merges from it periodically. Every line we diverge from upstream is
a potential merge conflict, a piece of code that can silently rot when
upstream refactors around it, and a documentation burden here in
BETHSOFT.md. Additive changes (new files, new enum entries, new config
defaults) are almost always cheaper to maintain than edits to existing
upstream code.

Concrete rules when adding fork-specific behavior:

- **Prefer new files over edits to upstream files.** New services,
  middleware, nodes, and config classes cost nothing at merge time.
- **Prefer additive edits over structural changes.** Adding an enum
  variant, a map entry, or a `switch` case rarely conflicts; changing a
  type signature, splitting a function, or moving code between files
  usually does. If a type change would ripple into N upstream call
  sites, look for a compatible alternative first (e.g. reuse an
  existing credential type instead of making a map `Partial`).
- **Use upstream extension points when they exist.** If upstream
  already reads from a config value, an env var, or a registry, wire
  the new behavior through that instead of hardcoding a branch.
- **Revert aggressively.** If a change to an upstream file turns out
  not to be strictly necessary — even if it looks harmless — revert it.
  A smaller diff is worth more than a "nice to have" cleanup.
- **Document the fork surface here.** Every upstream file this fork
  touches must appear in the relevant section of this document with a
  one-line reason. If you can't justify it in a line, revert it.
