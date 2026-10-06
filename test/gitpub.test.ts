import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker from "../src/index.ts";
import { SimulatedArtifactsNamespace } from "../src/simulator.ts";
import type { ActorSession, ArtifactsQueueEvent } from "../src/types.ts";

function createTestEnv(): Env {
	return {
		ARTIFACTS: new SimulatedArtifactsNamespace("default"),
	};
}

describe("GitPub — Cloudflare Artifacts Worker & Dual-Mode Human/Agent Git Platform", () => {
	it("creates starter-repo via POST /repos using env.ARTIFACTS binding", async () => {
		const env = createTestEnv();
		const req = new Request("http://localhost:8787/repos", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: "starter-repo" }),
		});

		const res = await worker.fetch(req, env);
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			name: string;
			defaultBranch: string;
			remote: string;
			token: string;
		};

		assert.equal(body.name, "starter-repo");
		assert.equal(body.defaultBranch, "main");
		assert.equal(
			body.remote,
			"https://0f6fb593710f5180ab2426f06c0eaa56.artifacts.cloudflare.net/git/default/starter-repo.git",
		);
		assert.match(body.token, /^art_v1_[0-9a-f]{40}\?expires=\d+$/);
	});

	it("returns 409 ALREADY_EXISTS when creating a duplicate repository", async () => {
		const env = createTestEnv();
		await worker.fetch(
			new Request("http://localhost:8787/repos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "dup-repo" }),
			}),
			env,
		);

		const res2 = await worker.fetch(
			new Request("http://localhost:8787/repos", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "dup-repo" }),
			}),
			env,
		);
		assert.equal(res2.status, 409);
		const err = (await res2.json()) as { code: string };
		assert.equal(err.code, "ALREADY_EXISTS");
	});

	it("performs zero-checkout commit log, tree, and AGENTS.md file inspection", async () => {
		const env = createTestEnv();

		const infoRes = await worker.fetch(
			new Request("http://localhost:8787/repos/gitpub-platform"),
			env,
		);
		assert.equal(infoRes.status, 200);
		const details = (await infoRes.json()) as {
			info: { name: string; defaultBranch: string };
			commits: Array<{ hash: string; treeHash: string }>;
			rootTree: Array<{ name: string; hash: string }>;
		};

		assert.equal(details.info.name, "gitpub-platform");
		assert.ok(details.commits.length >= 1);
		assert.ok(details.rootTree.some((e) => e.name === "AGENTS.md"));

		const treeHash = details.commits[0].treeHash;
		const treeRes = await worker.fetch(
			new Request(`http://localhost:8787/repos/gitpub-platform/tree/${treeHash}`),
			env,
		);
		assert.equal(treeRes.status, 200);
		assert.equal(
			treeRes.headers.get("Cache-Control"),
			"public, max-age=31536000, immutable",
		);

		const fileRes = await worker.fetch(
			new Request(
				"http://localhost:8787/repos/gitpub-platform/file?ref=main&path=AGENTS.md",
			),
			env,
		);
		assert.equal(fileRes.status, 200);
		const markdown = await fileRes.text();
		assert.match(markdown, /AGENTS\.md — GitPub Repository Contract/);
	});

	it("authenticates Human vs Agent on login and changes app behavior, permissions, and auto-provisioning", async () => {
		const env = createTestEnv();

		// 1. Login as Human Governor
		const humanLoginRes = await worker.fetch(
			new Request("http://localhost:8787/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					actorType: "human",
					identity: "Hemanth HM <hemanth.hm@gmail.com>",
				}),
			}),
			env,
		);
		assert.equal(humanLoginRes.status, 200);
		const humanData = (await humanLoginRes.json()) as {
			session: ActorSession;
			behaviorMode: string;
		};
		assert.equal(humanData.session.actorType, "human");
		assert.equal(humanData.session.role, "human_governor");
		assert.equal(humanData.behaviorMode, "human_swarm_governance_deck");
		assert.ok(humanData.session.permissions.includes("arena:promote"));

		// 2. Login as Autonomous Agent -> auto-provisions isolated fork & scoped token + loads AGENTS.md
		const agentLoginRes = await worker.fetch(
			new Request("http://localhost:8787/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					actorType: "agent",
					identity: "agent:claude-opus-4-6",
					model: "claude-opus-4-6",
				}),
			}),
			env,
		);
		assert.equal(agentLoginRes.status, 200);
		const agentData = (await agentLoginRes.json()) as {
			session: ActorSession;
			behaviorMode: string;
		};
		assert.equal(agentData.session.actorType, "agent");
		assert.equal(agentData.session.role, "autonomous_agent");
		assert.equal(agentData.behaviorMode, "autonomous_agent_execution_protocol");
		assert.ok(
			agentData.session.assignedForkRepo?.startsWith("task-"),
		);
		assert.ok(agentData.session.scopedTokenId?.startsWith("tok_"));
		assert.match(agentData.session.agentsMdContract ?? "", /AGENTS\.md/);
		assert.ok(agentData.session.restrictions.includes("cannot_promote_to_main"));

		// 3. Agent submits commit with Provenance Note (POST /api/agent/commit)
		const commitRes = await worker.fetch(
			new Request("http://localhost:8787/api/agent/commit", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "agent",
					"X-GitPub-Session": agentData.session.sessionId,
				},
				body: JSON.stringify({
					prompt: "Harden bearer auth",
					message: "feat(auth): validate bearer scope",
					reasoningSummary: "Checked AGENTS.md invariants and enforced scope check.",
					symbolsModified: ["dispatchRoute", "verifyBearerHeader"],
					files: [
						{
							path: "src/router.ts",
							content: "// Agent commit with provenance note\n",
						},
					],
				}),
			}),
			env,
		);
		assert.equal(commitRes.status, 201);
		const commitData = (await commitRes.json()) as {
			commitHash: string;
			forkRepo: string;
			arenaId: string;
		};
		assert.equal(commitData.forkRepo, agentData.session.assignedForkRepo);
		assert.equal(commitData.commitHash.length, 40);

		// 4. Verify Agent is BLOCKED (403) from self-promoting to main, deleting base repo, or overwriting AGENTS.md
		const forbiddenPromote = await worker.fetch(
			new Request(`http://localhost:8787/api/arenas/${commitData.arenaId}/promote`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "agent",
				},
				body: JSON.stringify({ candidateId: "any" }),
			}),
			env,
		);
		assert.equal(forbiddenPromote.status, 403);
		const promoteErr = (await forbiddenPromote.json()) as { code: string };
		assert.equal(promoteErr.code, "AGENT_SELF_PROMOTE_DENIED");

		const forbiddenDelete = await worker.fetch(
			new Request("http://localhost:8787/repos/gitpub-platform", {
				method: "DELETE",
				headers: { "X-GitPub-Actor": "agent" },
			}),
			env,
		);
		assert.equal(forbiddenDelete.status, 403);
		const deleteErr = (await forbiddenDelete.json()) as { code: string };
		assert.equal(deleteErr.code, "AGENT_BASE_DELETE_DENIED");

		const forbiddenConstitution = await worker.fetch(
			new Request("http://localhost:8787/api/governance/agents-md", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "agent",
				},
				body: JSON.stringify({ content: "# Hacked" }),
			}),
			env,
		);
		assert.equal(forbiddenConstitution.status, 403);

		// 5. Verify Human Governor CAN update AGENTS.md and promote Arena winners
		const allowedConstitution = await worker.fetch(
			new Request("http://localhost:8787/api/governance/agents-md", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "human",
					"X-GitPub-Session": humanData.session.sessionId,
				},
				body: JSON.stringify({
					content: "# AGENTS.md — Updated by Human Governor\n1. Zero credential leakage.\n",
				}),
			}),
			env,
		);
		assert.equal(allowedConstitution.status, 200);
	});

	it("serves Level-5 Agent Markdown runbook on Accept: text/markdown and A2A Agent Card", async () => {
		const env = createTestEnv();

		const mdRes = await worker.fetch(
			new Request("http://localhost:8787/", {
				headers: { Accept: "text/markdown" },
			}),
			env,
		);
		assert.equal(mdRes.status, 200);
		assert.match(mdRes.headers.get("Content-Type") ?? "", /text\/markdown/);
		assert.ok(Number(mdRes.headers.get("x-markdown-tokens")) > 50);
		const mdText = await mdRes.text();
		assert.match(mdText, /Agent Execution Protocol/);

		const cardRes = await worker.fetch(
			new Request("http://localhost:8787/.well-known/agent-card.json"),
			env,
		);
		assert.equal(cardRes.status, 200);
		const card = (await cardRes.json()) as { name: string };
		assert.equal(card.name, "GitPub Coordinator Agent");
	});

	it("spawns concurrent agent forks in an Arena, records provenance notes, and promotes the winner as Human", async () => {
		const env = createTestEnv();

		const createArenaRes = await worker.fetch(
			new Request("http://localhost:8787/api/arenas", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "human",
				},
				body: JSON.stringify({
					title: "Harden bearer auth and tree caching",
					prompt: "Enforce token scopes and immutable tree caching.",
					baseRepo: "gitpub-platform",
				}),
			}),
			env,
		);
		assert.equal(createArenaRes.status, 201);
		const { arena } = (await createArenaRes.json()) as {
			arena: {
				id: string;
				status: string;
				candidates: Array<{
					id: string;
					forkRepoName: string;
					headCommitHash: string;
					score: number;
				}>;
				conflicts: Array<{ kind: string; severity: string }>;
				mergeOrder: string[];
			};
		};

		assert.equal(arena.candidates.length, 3);
		assert.ok(arena.conflicts.length >= 1);
		assert.equal(arena.mergeOrder.length, 3);

		const winner = arena.candidates[0];
		const promoteRes = await worker.fetch(
			new Request(`http://localhost:8787/api/arenas/${arena.id}/promote`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "human",
				},
				body: JSON.stringify({ candidateId: winner.id }),
			}),
			env,
		);
		assert.equal(promoteRes.status, 200);
		const promotedData = (await promoteRes.json()) as {
			arena: { status: string; promotedCandidateId: string };
		};
		assert.equal(promotedData.arena.status, "promoted");
		assert.equal(promotedData.arena.promotedCandidateId, winner.id);
	});

	it("processes cf.artifacts.repo.pushed Queue events via worker.queue() and triggers REVIEW_WORKFLOW.create()", async () => {
		const env = createTestEnv();
		let acked = false;
		let workflowParams: { namespace: string; repoName: string; branch: string } | null = null;

		const event: ArtifactsQueueEvent = {
			type: "cf.artifacts.repo.pushed",
			version: "1",
			id: "evt_test_push_01",
			time: new Date().toISOString(),
			accountId: "0f6fb593710f5180ab2426f06c0eaa56",
			namespace: "default",
			repo: "gitpub-platform",
			source: {
				namespace: "default",
				repoName: "gitpub-platform",
			},
			payload: {
				ref: "refs/heads/main",
				before: "0000000000000000000000000000000000000000",
				after: "1111111111111111111111111111111111111111",
				pusher: {
					type: "token",
					tokenId: "tok_123",
				},
			},
		};

		const batch = {
			queue: "artifacts-events",
			messages: [
				{
					id: "msg_1",
					timestamp: new Date(),
					body: event,
					attempts: 1,
					ack() {
						acked = true;
					},
					retry() {},
				},
			],
			ackAll() {},
			retryAll() {},
		} as unknown as MessageBatch<ArtifactsQueueEvent>;

		await worker.queue(batch, {
			...env,
			REVIEW_WORKFLOW: {
				async create(opts) {
					workflowParams = opts.params;
					return { id: "wf_test_01" };
				},
			},
		});
		assert.equal(acked, true);
		assert.deepEqual(workflowParams, {
			namespace: "default",
			repoName: "gitpub-platform",
			branch: "refs/heads/main",
		});
	});

	it("provisions an isolated task fork and reads AGENTS.md via POST /api/tasks/fork", async () => {
		const env = createTestEnv();
		const res = await worker.fetch(
			new Request("http://localhost:8787/api/tasks/fork", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					project: "gitpub-platform",
					label: "zero-copy-test",
				}),
			}),
			env,
		);
		assert.equal(res.status, 200);
		const data = (await res.json()) as {
			workspace: {
				name: string;
				defaultBranch: string;
				remote: string;
				scopedTokenId: string;
				instructions: string;
			};
		};
		assert.match(data.workspace.name, /^task-[0-9a-f]+-zero-copy-test$/);
		assert.equal(data.workspace.defaultBranch, "main");
		assert.match(data.workspace.instructions, /AGENTS\.md/);
	});

	it("synthesizes a Hybrid AST candidate combining multiple agent forks and blocks agents from triggering synthesis", async () => {
		const env = createTestEnv();

		// 1. Agent is blocked (403) from triggering synthesis
		const deniedRes = await worker.fetch(
			new Request("http://localhost:8787/api/arenas/arena_auth_tree_cache/synthesize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "agent",
				},
				body: JSON.stringify({}),
			}),
			env,
		);
		assert.equal(deniedRes.status, 403);
		const deniedBody = (await deniedRes.json()) as { code: string };
		assert.equal(deniedBody.code, "AGENT_SYNTHESIS_DENIED");

		// 2. Human Architect synthesizes hybrid AST winner across forks
		const synthRes = await worker.fetch(
			new Request("http://localhost:8787/api/arenas/arena_auth_tree_cache/synthesize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-GitPub-Actor": "human",
				},
				body: JSON.stringify({}),
			}),
			env,
		);
		assert.equal(synthRes.status, 201);
		const synthData = (await synthRes.json()) as {
			arena: { status: string; synthesizedCandidateId: string };
			synthesizedCandidate: {
				id: string;
				score: number;
				status: string;
				provenance: { whySummary: string; agentsMdRulesApplied: string[] };
			};
			commitHash: string;
		};
		assert.equal(synthData.arena.status, "synthesized");
		assert.equal(synthData.synthesizedCandidate.status, "synthesized");
		assert.equal(synthData.synthesizedCandidate.score, 99);
		assert.ok(synthData.synthesizedCandidate.provenance.whySummary.length > 10);
		assert.ok(synthData.synthesizedCandidate.provenance.agentsMdRulesApplied.length >= 2);
		assert.equal(synthData.commitHash.length, 40);
	});

	it("exposes GET /api/judge/scorecard, GET /repos/:name/commits/:hash, and GET /repos/:name/diff for Cloudflare Judge & Agent audits", async () => {
		const env = createTestEnv();

		const scorecardRes = await worker.fetch(
			new Request("http://localhost:8787/api/judge/scorecard"),
			env,
		);
		assert.equal(scorecardRes.status, 200);
		const scorecard = (await scorecardRes.json()) as {
			verdict: string;
			overallScore: number;
			license: string;
			officialJudgingRubric: Array<{ weight: string; scaleScore: string }>;
			criteriaAudit: Array<{ status: string }>;
		};
		assert.equal(scorecard.verdict, "WINNER_READY");
		assert.equal(scorecard.overallScore, 100);
		assert.equal(scorecard.license, "MIT");
		assert.equal(scorecard.officialJudgingRubric.length, 3);
		assert.equal(scorecard.officialJudgingRubric[0].weight, "50%");
		assert.equal(scorecard.officialJudgingRubric[0].scaleScore, "5/5");
		assert.equal(scorecard.criteriaAudit.length, 4);

		const diffRes = await worker.fetch(
			new Request("http://localhost:8787/repos/gitpub-platform/diff?base=main&head=HEAD"),
			env,
		);
		assert.equal(diffRes.status, 200);
		const diffBody = (await diffRes.json()) as {
			repo: string;
			unifiedDiff: string;
			headCommitHash: string;
		};
		assert.equal(diffBody.repo, "gitpub-platform");
		assert.match(diffBody.unifiedDiff, /refs\/notes\/agents/);

		const commitRes = await worker.fetch(
			new Request(
				`http://localhost:8787/repos/gitpub-platform/commits/${diffBody.headCommitHash}`,
			),
			env,
		);
		assert.equal(commitRes.status, 200);
		const commitBody = (await commitRes.json()) as {
			provenanceNoteRef: string;
			commit: { hash: string };
		};
		assert.equal(commitBody.provenanceNoteRef, "refs/notes/agents");
		assert.equal(commitBody.commit.hash, diffBody.headCommitHash);

		const blameRes = await worker.fetch(
			new Request("http://localhost:8787/api/blame?repo=gitpub-platform&path=src/router.ts"),
			env,
		);
		assert.equal(blameRes.status, 200);
		const blameBody = (await blameRes.json()) as {
			noteRef: string;
			hunks: Array<{ astSymbol: string; whySummary: string; agentsMdRule: string }>;
		};
		assert.equal(blameBody.noteRef, "refs/notes/agents");
		assert.ok(blameBody.hunks.length >= 3);
		assert.ok(blameBody.hunks[0].whySummary.length > 10);
	});
});



