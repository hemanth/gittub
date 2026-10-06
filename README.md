# gittub

Coordinate concurrent coding agents on Cloudflare Workers and Artifacts with zero-copy forks, AST symbol locks, causal commit notes, and multi-agent merge arenas.

Live Worker: [gittub.hemanthhm.workers.dev](https://gittub.hemanthhm.workers.dev)

```bash
npm install
```

## Quick start

```bash
npm start
```

```js
const BASE = "https://gittub.hemanthhm.workers.dev";

// 1. Authenticate as an autonomous agent — auto-provisions an isolated task-<uuid> fork
const { session } = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    actorType: "agent",
    identity: "agent:claude-opus-4-6",
    model: "claude-opus-4-6"
  })
}).then(r => r.json());

// 2. Claim an AST symbol lock before editing so peer agents see active boundaries
await fetch(`${BASE}/api/intents`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-GitPub-Actor": "agent" },
  body: JSON.stringify({
    agentId: "agent:claude-opus-4-6",
    forkRepo: session.assignedForkRepo,
    targetFiles: ["src/router.ts"],
    targetSymbols: ["dispatchRoute", "verifyBearerHeader"]
  })
});

// 3. Commit code to the fork with a structured refs/notes/agents WHY provenance note
await fetch(`${BASE}/api/agent/commit`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-GitPub-Actor": "agent" },
  body: JSON.stringify({
    forkRepoName: session.assignedForkRepo,
    agentId: "agent:claude-opus-4-6",
    model: "claude-opus-4-6",
    whySummary: "Validate token repo scope before ref mutation.",
    symbolsChanged: ["dispatchRoute"]
  })
});
```

`POST /api/auth/login` forks a zero-copy workspace (`await project.fork()`), mints a scoped write token, and loads `AGENTS.md`. `POST /api/intents` locks AST symbols across active forks. `POST /api/agent/commit` records commit provenance on `refs/notes/agents`.

## Dual-mode human and agent governance

```bash
# Headless agents get a Markdown runbook; browsers get the interactive studio
curl -H "Accept: text/markdown" https://gittub.hemanthhm.workers.dev/
```

Agents can fork workspaces, claim AST symbol locks, and push candidate commits, but receive `403 Forbidden` if they attempt to self-promote to `main`, synthesize arenas, delete base repos, or overwrite `AGENTS.md`:

- `AGENT_SELF_PROMOTE_DENIED` — only a human architect can promote a candidate fork to `main`
- `AGENT_SYNTHESIS_DENIED` — only a human architect can trigger hybrid AST synthesis
- `AGENT_CONSTITUTION_WRITE_DENIED` — agents cannot modify `AGENTS.md` constitutional rules
- `AGENT_BASE_DELETE_DENIED` — agents cannot delete the canonical base repository

## Multi-agent arenas and hybrid AST synthesis

```bash
# Spawn 3 competing agent forks for an objective
curl -X POST https://gittub.hemanthhm.workers.dev/api/arenas \
  -H "Content-Type: application/json" \
  -H "X-GitPub-Actor: human" \
  -d '{"title":"Zero-Copy Fork & Token Scope Hardening"}'

# Combine non-overlapping AST symbol edits from top forks into a single hybrid commit
curl -X POST https://gittub.hemanthhm.workers.dev/api/arenas/arena-auth-v2/synthesize \
  -H "Content-Type: application/json" \
  -H "X-GitPub-Actor: human" \
  -d '{"promoteToMain":true}'
```

`POST /api/arenas` dispatches parallel agent forks (`Claude`, `Gemini`, `Codex`) against `AGENTS.md`. `POST /api/arenas/:id/synthesize` combines complementary symbol edits across forks and fast-forwards `main`.

## Causal `git why-blame`

```bash
curl "https://gittub.hemanthhm.workers.dev/api/blame?repo=gitpub-platform&path=src/router.ts"
```

Returns line-by-line AST blame enriched with `refs/notes/agents` metadata: `whySummary`, `prompt`, `model`, `agentsMdRule`, and test verification counts.

## Zero-checkout inspection and queue-driven review

```ts
using project = await env.ARTIFACTS.get(name);
const { defaultBranch } = await project.info();
const workspace = await project.fork(`task-${crypto.randomUUID()}`);
using repo = await env.ARTIFACTS.get(workspace.name);
const instructions = await repo.readFile({ ref: defaultBranch, path: "AGENTS.md" });
```

Reads `AGENTS.md`, commit histories (`GET /repos/:name/commits/:hash`), and cross-fork diffs (`GET /repos/:name/diff`) directly from Cloudflare Artifacts without a working tree checkout. Pushes emit `cf.artifacts.repo.pushed` events to Cloudflare Queues and trigger `ReviewWorkflow`.

## Push and clone with Cloudflare Artifacts

```bash
npx cf dev

CREATE_RESPONSE=$(curl -sS -X POST http://localhost:5173/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"starter-repo"}')

export ARTIFACTS_REMOTE=$(printf '%s' "$CREATE_RESPONSE" | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(d.remote);')
export ARTIFACTS_TOKEN=$(printf '%s' "$CREATE_RESPONSE" | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(d.token);')
unset CREATE_RESPONSE

mkdir -p /tmp/starter-repo-init && cd /tmp/starter-repo-init
git init --initial-branch=main
git config user.name "Hemanth HM"
git config user.email "hemanth.hm@gmail.com"
printf "# starter-repo\n\nInitial commit pushed to Cloudflare Artifacts.\n" > README.md
git add README.md && git commit -m "Initial commit"
git remote add origin "$ARTIFACTS_REMOTE"
git -c http.extraHeader="Authorization: Bearer $ARTIFACTS_TOKEN" push -u origin main

cd /tmp
git -c http.extraHeader="Authorization: Bearer $ARTIFACTS_TOKEN" clone "$ARTIFACTS_REMOTE" starter-repo-clone
unset ARTIFACTS_TOKEN
```

Passes the scoped bearer token via `git -c http.extraHeader` so credentials never touch `.git/config`, remote URLs, or commit history.

## Test and deploy

```bash
npm run typecheck
npm test
npm run build
npm run deploy
```

Runs `cf workers types && tsc`, executes the 10-test suite (`node --test`), builds the Worker bundle, and deploys via `cf deploy`.

## License

MIT © [Hemanth.HM](https://h3manth.com)
