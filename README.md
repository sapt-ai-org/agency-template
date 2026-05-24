# Agency Onboarding Template

A self-hostable onboarding funnel for agencies running on [Sapt](https://sapt.ai). Fork, brand, and deploy under your own domain in a few minutes. Every client your team onboards lands in a Sapt project with their brand context, audience notes, Meta connection, and an invite to take over.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sapt-ai-org/agency-template)

## What you get

- **Admin view** — sign in with your Sapt account, mint per-client onboarding links, see who's completed what.
- **Client questionnaire** — anyone with the link runs through a five-step flow that fills in their project on your behalf: website → brand context → audience → Meta connect → invite.
- **Branded under your domain** — edit one file (`src/theme.ts`) to swap the logo, name, colors, and copy.

The template is a single Cloudflare Worker that serves both an API and a static SPA. No database. Onboarding state lives in Cloudflare KV. All real writes go through Sapt's public REST API using your Sapt API key.

## Setup

One secret to grab before you click the deploy button.

### 1. Generate a Sapt API key

`app.sapt.ai` → **Account Settings → API Keys → New key**. Use the **reflecting-scope** option so the key automatically covers new projects you create later. Copy the secret.

### 2. Click the deploy button

The button above forks this repo into your GitHub and opens a Cloudflare deploy form. Paste:

- `SAPT_API_KEY` — from step 1

Cloudflare provisions a KV namespace automatically. Deploy.

When it's done, visit your worker URL and click **Sign in with Sapt**. On the first click, the template uses your API key to auto-create a public PKCE OAuth client on Sapt (under your first project — the choice is incidental, the client only verifies identity) and caches its client id in KV. Subsequent sign-ins reuse it.

> The OAuth client's redirect URL is set to whatever host you sign in from. If you later move to a custom domain or test locally, the template appends the new `/auth/callback` URL to the existing client automatically. To force re-provisioning, delete the `oauth-client` key from your worker's KV namespace.

## Customizing

The template is designed to be edited — by you or by an AI coding agent.

### Branding & questions (no code edit needed)

Sign in to the admin view and open **Configure** in the top-right. The page is a JSON editor for everything the questionnaire renders:

- `theme.*` — agency name, logo, colors, welcome and completion copy.
- `questionnaire.questions[]` — ordered list of onboarding questions, each one a `text` or `multiselect`. Order in the array is the order clients see them.
- `memory.{slug,title,description}` — controls the single Sapt memory entry written at the end of every completed questionnaire.

Saves apply immediately. The Meta-connect and email-invite steps are always the last two — they aren't editable through this surface because they call bespoke Sapt endpoints.

`src/theme.ts` and the default question list in `src/lib/config.ts` are the *defaults* — used on a fresh deployment until you save something in the admin UI. The **Reset to defaults** button on the configure page restores them.

### Add a new question type

If `text` and `multiselect` aren't enough, you can extend the schema:

1. Add a new variant to the `Question` union in `src/lib/config.ts`.
2. Write a React component in `src/questionnaire/steps/` that takes a `StepProps` and renders the question.
3. Wire it into `buildSteps` in `src/questionnaire/steps.ts`.
4. Extend `extractAnswer` in `src/worker/routes/steps.ts` to parse and validate the new shape from the request body.
5. Extend `buildMemoryContent` in `src/lib/memory-content.ts` to render the new answer type into markdown.

### Calling new Sapt endpoints

`src/lib/sapt.ts` is the single REST wrapper. Add a method to the `SaptClient` interface, implement it in `createSaptClient`, and use it from anywhere in the worker. Hand-written, ~200 lines, no SDK.

## Local development

```bash
git clone https://github.com/<your-fork>/agency-template.git
cd agency-template
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars with the three secrets from setup
npm run dev
```

`npm run dev` boots `wrangler dev` on `http://localhost:8787`. The first sign-in attempt auto-provisions the OAuth client (or appends `http://localhost:8787/auth/callback` to the existing one), so local OAuth Just Works as long as `SAPT_API_KEY` is set in `.dev.vars`.

Useful commands:

- `npm run dev` — local Cloudflare Worker + SPA
- `npm run build` — production SPA build into `dist/`
- `npm run deploy` — build + `wrangler deploy`
- `npm run typecheck` — TypeScript check
- `npm run lint` — ESLint
- `npm test` — vitest

## Architecture

```
src/
├── theme.ts                  # Default branding values (seed for the first deploy)
├── lib/
│   ├── sapt.ts               # Sapt REST API client (~250 LOC)
│   ├── config.ts             # AgencyConfig type + DEFAULT_AGENCY_CONFIG
│   ├── memory-content.ts     # Markdown builder for the final memory entry
│   ├── kv.ts                 # Cloudflare KV helpers
│   ├── types.ts              # LinkRecord, ProgressRecord, Step
│   └── utils.ts              # cn() Tailwind class merge
├── components/ui/            # Hand-written shadcn-style primitives
├── questionnaire/
│   ├── steps.ts              # buildSteps(config) — derives the flow from KV
│   ├── step-shell.tsx        # Shared layout for each step
│   ├── types.ts              # StepProps, StepDefinition
│   └── steps/
│       ├── welcome.tsx
│       ├── text-question.tsx       # Generic text question component
│       ├── multiselect-question.tsx# Generic multiselect component
│       ├── connect-meta.tsx
│       └── invite.tsx              # Writes the memory entry + sends invite
├── routes/                   # Tanstack Router file-based routes
│   ├── __root.tsx
│   ├── index.tsx             # Landing page (reads theme from /api/public/theme)
│   ├── admin.tsx             # Admin view
│   ├── admin.config.tsx      # Configure page (JSON editor for AgencyConfig)
│   └── start.$linkId.tsx     # Client questionnaire
├── worker/
│   ├── index.ts              # Hono app entry
│   ├── env.ts                # Bindings
│   ├── session.ts            # Signed cookie sessions
│   ├── jwt.ts                # id_token verification
│   ├── sapt.ts               # SaptClient factory
│   ├── oauth-provisioning.ts # First-deploy OAuth client auto-creation
│   └── routes/
│       ├── auth.ts           # OAuth start + callback + logout
│       ├── admin.ts          # /api/admin/* (gated by session)
│       └── steps.ts          # /api/steps/:linkId + /api/public/theme
├── styles.css                # Tailwind + CSS variables
└── main.tsx                  # SPA entry
```

## Known operational cases

A few things to be aware of when running this in production:

### Link points at a project the API key can't reach anymore

If you mint a link for a project, then later lose access to that project in Sapt (membership revoked, project deleted, role changed), the link's questionnaire steps will fail. Recovery: delete the stuck link from the admin view and mint a new one for a project you have access to.

### API key rotation breaks the deployment

The Sapt API key is stored as a Cloudflare Worker secret. If you rotate it on Sapt, every API call from the template fails until you update the secret on Cloudflare (`wrangler secret put SAPT_API_KEY` or via the dashboard).

### The API key follows your Sapt memberships

This template runs on a reflecting-scope API key, which inherits your Sapt permissions live. As you join new Sapt projects, the template's blast radius grows — every project you can write to in Sapt, the template's worker can also write to. That's the design of reflecting-scope keys. If you need tighter scoping, generate a non-reflecting key in Sapt and accept that the template won't see projects created after the key was minted.

## License

MIT. See [LICENSE](./LICENSE).

## Contributing & support

Issues and PRs welcome at [sapt-ai-org/agency-template](https://github.com/sapt-ai-org/agency-template). For Sapt platform questions, see [docs.sapt.ai](https://docs.sapt.ai) or email support@sapt.ai.
