# Agency Onboarding Template

A self-hostable onboarding funnel for agencies running on [Sapt](https://sapt.ai). Fork, brand, and deploy under your own domain in a few minutes. Every client your team onboards lands in a Sapt project with their brand context, audience notes, Meta connection, and an invite to take over.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sapt-ai-org/agency-template)

## What you get

- **Admin view** — sign in with your Sapt account, mint per-client onboarding links, see who's completed what.
- **Client questionnaire** — anyone with the link runs through a five-step flow that fills in their project on your behalf: website → brand context → audience → Meta connect → invite.
- **Branded under your domain** — edit one file (`src/theme.ts`) to swap the logo, name, colors, and copy.

The template is a single Cloudflare Worker that serves both an API and a static SPA. No database. Onboarding state lives in Cloudflare KV. All real writes go through Sapt's public REST API using your Sapt API key.

## Setup

Two things to grab before you click the deploy button. All from `app.sapt.ai`.

### 1. Pick your worker name

Decide what you want your deployment URL to look like. Cloudflare's default is `https://<worker-name>.<your-cf-account>.workers.dev`. Pick a name and write it down — you'll need it in step 3.

### 2. Generate a Sapt API key

`app.sapt.ai` → **Account Settings → API Keys → New key**. Use the **reflecting-scope** option so the key automatically covers new projects you create later. Copy the secret.

### 3. Create a Sapt OAuth client

`app.sapt.ai` → pick any of your projects → **Project Settings → OAuth Clients → New client**.

- Name: anything (e.g. "My Onboarding Template")
- Type: **Public** (PKCE) — no client secret needed
- Redirect URL: `https://<your-worker-name>.<your-cf-account>.workers.dev/auth/callback`

Copy the **Client ID**.

> The OAuth client is only used to verify your identity when you sign in to the admin view. It's a one-time setup per agency. The project you create it under is incidental — it isn't tied to the client projects this template creates.

### 4. Click the deploy button

The button above forks this repo into your GitHub and opens a Cloudflare deploy form. Paste:

- `SAPT_API_KEY` — from step 2
- `SAPT_OAUTH_CLIENT_ID` — from step 3

Cloudflare provisions a KV namespace automatically. Deploy.

When it's done, visit your worker URL and click **Sign in with Sapt**.

## Customizing

The template is designed to be edited — by you or by an AI coding agent.

### Branding

Edit `src/theme.ts`:

```ts
export const theme = {
  agencyName: 'Acme Co',
  agencyLogoUrl: 'https://your-cdn.com/logo.svg',
  primaryColor: '220 90% 50%', // HSL triplet without parentheses
  accentColor: '220 30% 90%',
  welcomeCopy: 'We help DTC brands grow…',
  completionCopy: "We'll be in touch within 24 hours.",
}
```

### Add or remove questionnaire steps

Each step is one file in `src/questionnaire/steps/`. Adding a new step:

1. Create `src/questionnaire/steps/my-step.tsx` exporting a React component.
2. Add the step name to the `Step` union in `src/lib/types.ts`.
3. Append it to the `STEPS` array in `src/questionnaire/steps.ts`.
4. Add a `case 'my-step':` handler in `src/worker/routes/steps.ts` that performs whatever Sapt API call the step needs.

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

`npm run dev` boots `wrangler dev` on `http://localhost:8787`. For local OAuth to work, your Sapt OAuth client's redirect URL must include `http://localhost:8787/auth/callback`.

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
├── theme.ts                  # Branding values — edit this
├── lib/
│   ├── sapt.ts               # Sapt REST API client (~200 LOC)
│   ├── kv.ts                 # Cloudflare KV helpers
│   ├── types.ts              # LinkRecord, ProgressRecord, Step
│   └── utils.ts              # cn() Tailwind class merge
├── components/ui/            # Hand-written shadcn-style primitives
├── questionnaire/
│   ├── steps.ts              # STEPS array (single source of truth)
│   ├── step-shell.tsx        # Shared layout for each step
│   ├── types.ts              # StepProps, StepDefinition
│   └── steps/                # One file per step
├── routes/                   # Tanstack Router file-based routes
│   ├── __root.tsx
│   ├── index.tsx             # Landing page
│   ├── admin.tsx             # Admin view
│   └── start.$linkId.tsx     # Client questionnaire
├── worker/
│   ├── index.ts              # Hono app entry
│   ├── env.ts                # Bindings
│   ├── session.ts            # Signed cookie sessions
│   ├── jwt.ts                # id_token verification
│   ├── sapt.ts               # SaptClient factory
│   └── routes/
│       ├── auth.ts           # OAuth start + callback + logout
│       ├── admin.ts          # /api/admin/* (gated by session)
│       └── steps.ts          # /api/steps/:linkId/:stepName
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
