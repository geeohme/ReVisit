# Migrating LLM gateway calls to a Supabase Edge Function

## Status / decision

**Current (Option A):** API keys (`llmGateway.apiKey`, `ollama.cloudApiKey`) live as a
**plaintext working copy in `chrome.storage.local`** (`rvData.settings`) and as an
**AES-GCM–encrypted copy in the DB** (`user_settings.secrets`). The LLM gateway request is
made **directly from the browser** (service worker, `background.js`), so the key must be
available client-side — that is the reason the plaintext local copy exists.

This is acceptable for now. This doc records what a future migration to a server-side
(Edge Function) model would take so the key never has to live on the client.

## Why migrate later

- The key currently sits in plaintext in `chrome.storage.local`, readable by anyone with
  local device / DevTools access. DB-side encryption only protects against DB/server
  compromise, not local compromise.
- "Keys should only be in the DB" is only achievable if the gateway call happens somewhere
  that can read the DB secret server-side — i.e. an Edge Function.

## Target architecture

```
Browser (service worker)                Supabase Edge Function            LLM gateway
  - holds Supabase session JWT   ─────►   /functions/v1/llm-proxy   ─────►  llmproxy.api.sparkbright.me
  - NO api key                            - verifies caller JWT             /v1/chat/completions
                                          - reads user_settings.secrets
                                          - decrypts secret server-side
                                          - injects Authorization header
```

The browser sends the chat/completion payload (provider, model, messages) to the Edge
Function with the user's Supabase access token. The function authorizes the user, pulls and
decrypts that user's gateway key, calls the gateway, and streams/returns the response.

## What needs to change

### 1. Secret storage / encryption
- **Decryption must move server-side.** Today the AES key is derived from the user's
  password (PBKDF2) and never leaves the client, so the server *cannot* decrypt
  `user_settings.secrets`. For an Edge Function to read the key, switch to one of:
  - **Supabase Vault** (`vault.secrets`) keyed per-user, decrypted inside the function via
    the service role; or
  - a server-held symmetric key (env var on the function) used to encrypt/decrypt the
    `secrets` column. The client would POST the plaintext key once over TLS; the function
    encrypts and stores it.
- Either way, the **password-derived client key (`deriveEncKey`) is dropped** for these
  secrets, and `rv-sync-core`'s `encryptSecret`/`decryptSecret` are no longer used for the
  gateway key (they can remain for any client-only secrets, if any).
- Remove the plaintext working copy from `rvData.settings` (and the persisted
  `rvEncKeyRaw`). `SECRET_PATHS` in `sync.js` would no longer be synced as ciphertext from
  the client.

### 2. The Edge Function (`supabase/functions/llm-proxy/index.ts`)
- Verify the caller: `supabase.auth.getUser(jwt)` from the `Authorization` header.
- Load the secret for `user.id` (Vault or `user_settings.secrets`), decrypt server-side.
- Re-implement the request shaping currently in `background.js` (`formatProviderRequest`,
  provider/model handling) — or have the client keep sending the same body and the function
  just injects the `Authorization: Bearer <key>` header before forwarding.
- Handle streaming if/when the client uses it.
- CORS: allow the extension origin (`chrome-extension://<id>`).

### 3. Client (`background.js`)
- Replace the direct `fetch('https://llmproxy.api.sparkbright.me/v1/chat/completions', …)`
  with `fetch('<supabase>/functions/v1/llm-proxy', { headers: { Authorization: Bearer <session.access_token> } , body })`.
- Drop reading `settings.llmGateway.apiKey` / `ollama.cloudApiKey` for the request.
- Ollama **local** stays client-side (it talks to `localhost`) — only the **cloud** key and
  the gateway key move server-side.

### 4. Offline / availability tradeoff
- Direct-from-browser works offline against a local Ollama and is resilient to function
  cold starts. The Edge Function path requires connectivity to Supabase for every LLM call.
- Decide whether local Ollama keeps its direct path (recommended) while only the
  cloud/gateway providers route through the function.

## Rough effort
- New Edge Function + deploy + secret-storage change (Vault or server key): ~0.5–1 day.
- Client rewiring + removing local plaintext + tests: ~0.5 day.
- Migration of existing users' keys (re-encrypt under the new scheme on next save): small.

## Related code
- `sync.js` — `SECRET_PATHS`, `pushSettings`/`pullSettings`, `deriveKeyForSession`,
  `getEncKey`, `ENCKEY_KEY`.
- `rv-sync-core.js` — `deriveEncKey`, `encryptSecret`, `decryptSecret`.
- `background.js` — gateway request (`processWithAI`, `formatProviderRequest`, Ollama target builder).
