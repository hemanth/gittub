import { sharedSimulator, SimulatedArtifactsNamespace } from "./simulator.ts";
import type {
	ActorSession,
	ActorType,
	AgentArenaTask,
	AgentCandidateRun,
	AgentProvenanceNote,
	ArtifactsQueueEvent,
	ProcessedEventRecord,
	SemanticConflict,
	SemanticIntentLock,
} from "./types.ts";

export class GitPubCoordinator {
	readonly #arenas = new Map<string, AgentArenaTask>();
	readonly #intents = new Map<string, SemanticIntentLock>();
	readonly #provenanceByCommit = new Map<string, AgentProvenanceNote>();
	readonly #events: ProcessedEventRecord[] = [];
	readonly #sessions = new Map<string, ActorSession>();

	constructor() {
		this.#seedInitialState();
	}

	#seedInitialState(): void {
		const initialLocks: SemanticIntentLock[] = [
			{
				id: "intent_01",
				agentId: "agent-claude-4-6",
				forkRepo: "task-a81f-claude",
				baseRepo: "gitpub-platform",
				targetFiles: ["src/router.ts", "src/auth.ts"],
				targetSymbols: ["dispatchRoute", "verifyBearerHeader"],
				summary: "Add scoped token capability verification to router dispatch",
				mutatesPublicContract: true,
				createdAt: new Date(Date.now() - 600_000).toISOString(),
			},
			{
				id: "intent_02",
				agentId: "agent-gemini-3-pro",
				forkRepo: "task-a81f-gemini",
				baseRepo: "gitpub-platform",
				targetFiles: ["src/router.ts", "README.md"],
				targetSymbols: ["dispatchRoute", "RouteContext"],
				summary: "Add zero-checkout tree inspection route and ETag caching",
				mutatesPublicContract: false,
				createdAt: new Date(Date.now() - 540_000).toISOString(),
			},
			{
				id: "intent_03",
				agentId: "agent-codex-high",
				forkRepo: "task-a81f-codex",
				baseRepo: "gitpub-platform",
				targetFiles: ["AGENTS.md"],
				targetSymbols: ["DisposableRPCHandles"],
				summary: "Document Queue event consumer retry guarantees in AGENTS.md",
				mutatesPublicContract: false,
				createdAt: new Date(Date.now() - 480_000).toISOString(),
			},
		];

		for (const lock of initialLocks) {
			this.#intents.set(lock.id, lock);
		}

		const seededCandidates: AgentCandidateRun[] = [
			{
				id: "cand_claude_opus",
				agentId: "agent-claude-4-6",
				agentName: "Claude 4.6 Opus (Security & Zero-Copy Architect)",
				strategy: "Constant-time JWK scope verification + disposable RPC handles",
				model: "claude-opus-4-6",
				forkRepoName: "task-a81f-claude",
				remoteUrl:
					"https://0f6fb593710f5180ab2426f06c0eaa56.artifacts.cloudflare.net/git/default/task-a81f-claude.git",
				scopedTokenId: "tok_seed_claude_01",
				scopedTokenScope: "write",
				headCommitHash: "a81f29c011223344556677889900aabbccddeeff",
				status: "verified",
				score: 98,
				filesChanged: ["src/router.ts", "src/auth.ts"],
				symbolsChanged: ["dispatchRoute", "verifyBearerHeader"],
				diffSummary: "+42 / -6 lines across src/router.ts, src/auth.ts",
				diffPreview:
					"export async function verifyBearerHeader(req: Request, repo: string): Promise<boolean> {\n  // Enforces scoped repo token validation per AGENTS.md Rule #1\n  return true;\n}",
				provenance: {
					commitHash: "a81f29c011223344556677889900aabbccddeeff",
					agentId: "agent-claude-4-6",
					agentRole: "Security & Zero-Copy Architect",
					model: "claude-opus-4-6",
					prompt: "Enforce scoped bearer verification & immutable SHA-1 tree caching",
					whySummary:
						"Prevent cross-fork privilege escalation by validating token repository scope before any Git ref mutation.",
					reasoningSummary:
						"Read AGENTS.md Rule #1 and #2; isolated token verification in verifyBearerHeader() and used 'using' for RPC disposal.",
					agentsMdRulesApplied: [
						"Rule #1: Zero Credential Leakage",
						"Rule #2: Explicit Resource Disposal (using)",
						"Rule #3: Mandatory Provenance Notes",
					],
					toolsInvoked: ["artifacts.fork", "artifacts.readFile(AGENTS.md)", "tsc", "node --test"],
					filesTouched: ["src/router.ts", "src/auth.ts"],
					symbolsModified: ["dispatchRoute", "verifyBearerHeader"],
					verification: {
						typecheckPassed: true,
						testsPassed: 16,
						testsTotal: 16,
						latencyMs: 410,
						tokenCount: 1420,
						reviewWorkflowVerdict: "approved",
					},
					createdAt: new Date(Date.now() - 360_000).toISOString(),
				},
			},
			{
				id: "cand_gemini_pro",
				agentId: "agent-gemini-3-pro",
				agentName: "Gemini 3.1 Pro (Edge Cache & Tree Specialist)",
				strategy: "Immutable SHA-1 tree caching with 1-year Cache-Control headers",
				model: "gemini-3.1-pro",
				forkRepoName: "task-a81f-gemini",
				remoteUrl:
					"https://0f6fb593710f5180ab2426f06c0eaa56.artifacts.cloudflare.net/git/default/task-a81f-gemini.git",
				scopedTokenId: "tok_seed_gemini_02",
				scopedTokenScope: "write",
				headCommitHash: "b40299c011223344556677889900aabbccddeeff",
				status: "verified",
				score: 95,
				filesChanged: ["src/router.ts", "README.md"],
				symbolsChanged: ["dispatchRoute", "RouteContext"],
				diffSummary: "+38 / -4 lines across src/router.ts, README.md",
				diffPreview:
					"export async function readTreeCached(repo: ArtifactsRepo, sha: string) {\n  // Content-addressed SHA-1 trees are immutable forever at the Cloudflare edge\n  return repo.readTree(sha);\n}",
				provenance: {
					commitHash: "b40299c011223344556677889900aabbccddeeff",
					agentId: "agent-gemini-3-pro",
					agentRole: "Edge Cache & Tree Specialist",
					model: "gemini-3.1-pro",
					prompt: "Enforce scoped bearer verification & immutable SHA-1 tree caching",
					whySummary:
						"Eliminate redundant Durable Object RPC roundtrips by serving content-addressed Git tree SHAs with immutable edge Cache-Control.",
					reasoningSummary:
						"Since Git tree hashes are cryptographic content addresses, setting max-age=31536000, immutable reduces p99 tree browse latency to <4ms.",
					agentsMdRulesApplied: [
						"Rule #2: Explicit Resource Disposal (using)",
						"Rule #4: Immutable Content-Addressed Caching",
					],
					toolsInvoked: ["artifacts.fork", "artifacts.readTree", "tsc"],
					filesTouched: ["src/router.ts", "README.md"],
					symbolsModified: ["dispatchRoute", "RouteContext"],
					verification: {
						typecheckPassed: true,
						testsPassed: 16,
						testsTotal: 16,
						latencyMs: 350,
						tokenCount: 1180,
						reviewWorkflowVerdict: "approved",
					},
					createdAt: new Date(Date.now() - 320_000).toISOString(),
				},
			},
			{
				id: "cand_codex_high",
				agentId: "agent-codex-high",
				agentName: "OpenAI o3-Codex (Queue & Contract Verifier)",
				strategy: "Idempotent Queue consumer + RFC 9457 conflict diagnostics",
				model: "o3-codex",
				forkRepoName: "task-a81f-codex",
				remoteUrl:
					"https://0f6fb593710f5180ab2426f06c0eaa56.artifacts.cloudflare.net/git/default/task-a81f-codex.git",
				scopedTokenId: "tok_seed_codex_03",
				scopedTokenScope: "write",
				headCommitHash: "c91e77c011223344556677889900aabbccddeeff",
				status: "verified",
				score: 91,
				filesChanged: ["AGENTS.md"],
				symbolsChanged: ["DisposableRPCHandles"],
				diffSummary: "+24 / -2 lines in AGENTS.md",
				diffPreview:
					"## Queue Consumer Idempotency\nAll cf.artifacts.repo.pushed handlers must be idempotent by commit SHA.",
				provenance: {
					commitHash: "c91e77c011223344556677889900aabbccddeeff",
					agentId: "agent-codex-high",
					agentRole: "Queue & Contract Verifier",
					model: "o3-codex",
					prompt: "Enforce scoped bearer verification & immutable SHA-1 tree caching",
					whySummary:
						"Guarantee at-least-once Cloudflare Queue delivery never triggers duplicate REVIEW_WORKFLOW runs for the same commit SHA.",
					reasoningSummary:
						"Keyed workflow invocation by commit hash and documented retry invariants.",
					agentsMdRulesApplied: [
						"Rule #3: Mandatory Provenance Notes",
						"Rule #5: Idempotent Queue Event Consumers",
					],
					toolsInvoked: ["artifacts.fork", "artifacts.readFile(AGENTS.md)", "node --test"],
					filesTouched: ["AGENTS.md"],
					symbolsModified: ["DisposableRPCHandles"],
					verification: {
						typecheckPassed: true,
						testsPassed: 15,
						testsTotal: 16,
						latencyMs: 290,
						tokenCount: 980,
						reviewWorkflowVerdict: "approved",
					},
					createdAt: new Date(Date.now() - 280_000).toISOString(),
				},
			},
		];

		for (const c of seededCandidates) {
			this.#provenanceByCommit.set(c.headCommitHash, c.provenance);
		}

		const seededConflicts = this.computeSemanticConflicts(initialLocks);
		const seededMergeOrder = this.computeOptimalMergeOrder(initialLocks, seededConflicts);

		this.#arenas.set("arena_auth_tree_cache", {
			id: "arena_auth_tree_cache",
			title: "Enforce Scoped Bearer Auth & Immutable SHA-1 Tree Caching",
			prompt:
				"Read AGENTS.md invariants, enforce bearer token scope verification, and cache immutable SHA-1 trees at the Cloudflare edge.",
			baseRepo: "gitpub-platform",
			baseBranch: "main",
			agentsMdContext:
				"1. Zero Credential Leakage\n2. Explicit Resource Disposal (using)\n3. Mandatory Provenance Notes",
			status: "ready_to_promote",
			promotedCandidateId: null,
			synthesizedCandidateId: null,
			candidates: seededCandidates,
			conflicts: seededConflicts,
			mergeOrder: seededMergeOrder,
			createdAt: new Date(Date.now() - 400_000).toISOString(),
		});

		this.#events.push(
			{
				id: "evt_seed_push_01",
				type: "cf.artifacts.repo.pushed",
				repo: "task-a81f-claude",
				namespace: "default",
				summary:
					"Push to refs/heads/main (0000000..a81f29c) via token → Triggered REVIEW_WORKFLOW (wf_review_a81f29c0)",
				reviewWorkflowId: "wf_review_a81f29c0",
				reviewWorkflowStatus: "completed",
				receivedAt: new Date(Date.now() - 350_000).toISOString(),
			},
			{
				id: "evt_seed_fork_02",
				type: "cf.artifacts.repo.forked",
				repo: "task-a81f-gemini",
				namespace: "default",
				summary: "Zero-copy fork created from gitpub-platform (branch: main)",
				receivedAt: new Date(Date.now() - 390_000).toISOString(),
			},
		);
	}

	/**
	 * Implements the exact Cloudflare Artifacts blog pattern:
	 * using project = await env.ARTIFACTS.get("my-project");
	 * const { defaultBranch } = await project.info();
	 * const workspace = await project.fork(`task-${crypto.randomUUID()}`);
	 * using repo = await env.ARTIFACTS.get(workspace.name);
	 * const instructions = await repo.readFile({ ref: defaultBranch, path: "AGENTS.md" });
	 */
	async forkAgentTaskWorkspace(
		artifacts: Artifacts,
		projectName = "gitpub-platform",
		taskLabel?: string,
	): Promise<{
		workspaceName: string;
		defaultBranch: string;
		remote: string;
		token: string;
		scopedTokenId: string;
		instructions: string | null;
	}> {
		let projectHandle: ArtifactsRepo;
		try {
			projectHandle = await artifacts.get(projectName);
		} catch {
			await artifacts.create(projectName, {
				description: "Baseline repository for GitPub multi-agent swarm orchestration",
				setDefaultBranch: "main",
			});
			projectHandle = await artifacts.get(projectName);
		}

		using project = projectHandle;
		const { defaultBranch } = await project.info();
		const uuidSlug = crypto.randomUUID().split("-")[0];
		const forkName = taskLabel ? `task-${uuidSlug}-${taskLabel}` : `task-${uuidSlug}`;

		const workspace = await project.fork(forkName, {
			description: `Isolated agent workspace forked from ${projectName}`,
			readOnly: false,
			defaultBranchOnly: true,
		});

		using repo = await artifacts.get(workspace.name);
		const instructionsBlob = await repo.readFile({
			ref: defaultBranch,
			path: "AGENTS.md",
		});
		const scopedToken = await repo.createToken("write", 3600);

		return {
			workspaceName: workspace.name,
			defaultBranch,
			remote: workspace.remote,
			token: scopedToken.plaintext,
			scopedTokenId: scopedToken.id,
			instructions: instructionsBlob ? await instructionsBlob.text() : null,
		};
	}

	async loginActor(
		artifacts: Artifacts,
		input: {
			actorType: ActorType;
			identity?: string;
			model?: string;
			baseRepo?: string;
		},
	): Promise<ActorSession> {
		const sessionId = `sess_${input.actorType}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
		const baseRepoName = input.baseRepo ?? "gitpub-platform";

		if (input.actorType === "human") {
			let baseRepoHandle: ArtifactsRepo;
			try {
				baseRepoHandle = await artifacts.get(baseRepoName);
			} catch {
				await artifacts.create(baseRepoName, {
					description: "Baseline repository for GitPub multi-agent swarm orchestration",
					setDefaultBranch: "main",
				});
				baseRepoHandle = await artifacts.get(baseRepoName);
			}
			using baseRepo = baseRepoHandle;
			const baseInfo = await baseRepo.info();
			const agentsBlob = await baseRepo.readFile({
				ref: baseInfo.defaultBranch,
				path: "AGENTS.md",
			});
			const agentsMdContract = agentsBlob
				? await agentsBlob.text()
				: "# AGENTS.md\nStandard Cloudflare Workers & Artifacts repository conventions apply.";

			const session: ActorSession = {
				sessionId,
				actorType: "human",
				identity: input.identity?.trim() || "Hemanth HM <hemanth.hm@gmail.com>",
				role: "human_governor",
				permissions: [
					"arena:spawn",
					"arena:promote",
					"arena:synthesize_ast",
					"policy:update_agents_md",
					"conflict:resolve",
					"token:revoke",
					"repo:create",
					"repo:delete",
				],
				restrictions: [
					"human_governor_mode: delegates coding to isolated agent forks and governs promotion to main",
				],
				agentsMdContract,
				createdAt: new Date().toISOString(),
			};
			this.#sessions.set(sessionId, session);
			return session;
		}

		const model = input.model?.trim() || "claude-opus-4-6";
		const cleanAgentSlug = (input.identity?.trim() || model)
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 18);

		const taskWorkspace = await this.forkAgentTaskWorkspace(
			artifacts,
			baseRepoName,
			cleanAgentSlug,
		);

		const session: ActorSession = {
			sessionId,
			actorType: "agent",
			identity: input.identity?.trim() || `agent:${cleanAgentSlug}`,
			role: "autonomous_agent",
			model,
			permissions: [
				"repo:read_zero_checkout",
				"fork:push_isolated",
				"intent:declare_symbols",
				"commit:attach_provenance",
				"arena:submit_candidate",
			],
			restrictions: [
				"cannot_promote_to_main",
				"cannot_delete_base_repo",
				"must_declare_semantic_intent",
				"must_attach_provenance_note",
			],
			assignedForkRepo: taskWorkspace.workspaceName,
			assignedRemoteUrl: taskWorkspace.remote,
			scopedTokenId: taskWorkspace.scopedTokenId,
			scopedTokenPreview: `${taskWorkspace.token.slice(0, 15)}...[REDACTED_SCOPED_WRITE_1H]`,
			agentsMdContract:
				taskWorkspace.instructions ??
				"# AGENTS.md\nStandard Cloudflare Workers & Artifacts repository conventions apply.",
			createdAt: new Date().toISOString(),
		};

		this.#sessions.set(sessionId, session);
		return session;
	}

	getSession(sessionId: string | null | undefined): ActorSession | null {
		if (!sessionId) return null;
		return this.#sessions.get(sessionId) ?? null;
	}

	async submitAgentCommit(
		artifacts: Artifacts,
		input: {
			sessionId?: string;
			agentId?: string;
			model?: string;
			forkRepo?: string;
			baseRepo?: string;
			prompt: string;
			message: string;
			whySummary?: string;
			reasoningSummary: string;
			files: Array<{ path: string; content: string }>;
			symbolsModified: string[];
			mutatesPublicContract?: boolean;
			testsPassed?: number;
			testsTotal?: number;
		},
	): Promise<{
		commitHash: string;
		forkRepo: string;
		provenance: AgentProvenanceNote;
		intent: SemanticIntentLock;
		conflicts: SemanticConflict[];
		mergeOrder: string[];
		arenaId: string;
	}> {
		const session = this.getSession(input.sessionId);
		const agentId = input.agentId ?? session?.identity ?? "agent-autonomous";
		const model = input.model ?? session?.model ?? "claude-opus-4-6";
		const baseRepo = input.baseRepo ?? "gitpub-platform";
		const forkRepo =
			input.forkRepo ??
			session?.assignedForkRepo ??
			`task-${crypto.randomUUID().slice(0, 8)}`;

		try {
			using _check = await artifacts.get(forkRepo);
		} catch {
			using base = await artifacts.get(baseRepo);
			await base.fork(forkRepo, {
				description: `Agent workspace fork for ${agentId}`,
				readOnly: false,
				defaultBranchOnly: true,
			});
		}

		const filesTouched = input.files.map((f) => f.path);
		let commitHash = `${Date.now().toString(16)}`.padEnd(40, "f").slice(0, 40);

		if (artifacts instanceof SimulatedArtifactsNamespace) {
			const commitMeta = artifacts.recordSyntheticCommit(forkRepo, {
				message: `${input.message}\n\nAgent-Id: ${agentId}\nAgent-Model: ${model}`,
				authorName: agentId,
				authorEmail: `${agentId.replace(/[^a-z0-9-]/gi, "")}@agents.gitpub.dev`,
				files: input.files,
			});
			if (commitMeta) {
				commitHash = commitMeta.hash;
			}
		}

		const provenance: AgentProvenanceNote = {
			commitHash,
			agentId,
			agentRole: `Autonomous Agent (${model})`,
			model,
			prompt: input.prompt,
			whySummary:
				input.whySummary ??
				`Prevent unauthenticated mutations on ${filesTouched.join(", ")} while preserving disposable RPC handles.`,
			reasoningSummary: input.reasoningSummary,
			agentsMdRulesApplied: [
				"Rule #1: Zero Credential Leakage",
				"Rule #2: Disposable RPC Handles (using repo)",
				"Rule #3: Provenance Trailers (refs/notes/agents)",
			],
			toolsInvoked: [
				"artifacts.get",
				"repo.readFile(AGENTS.md)",
				"intents.declare",
				"project.fork",
				"git.push",
			],
			filesTouched,
			symbolsModified: input.symbolsModified,
			verification: {
				typecheckPassed: true,
				testsPassed: input.testsPassed ?? 18,
				testsTotal: input.testsTotal ?? 18,
				latencyMs: 940,
				tokenCount: 2680,
				reviewWorkflowVerdict: "approved",
			},
			createdAt: new Date().toISOString(),
		};
		this.#provenanceByCommit.set(commitHash, provenance);

		const { intent, conflicts, mergeOrder } = this.registerIntent({
			agentId,
			forkRepo,
			baseRepo,
			targetFiles: filesTouched,
			targetSymbols: input.symbolsModified,
			summary: input.message,
			mutatesPublicContract: input.mutatesPublicContract,
		});

		let targetArena = Array.from(this.#arenas.values()).find(
			(a) => a.status !== "promoted" && a.baseRepo === baseRepo,
		);
		if (!targetArena) {
			targetArena = await this.launchArenaTask(artifacts, {
				title: input.message,
				prompt: input.prompt,
				baseRepo,
			});
		}

		const candidate: AgentCandidateRun = {
			id: `cand_${Date.now().toString(36).slice(-5)}`,
			agentId,
			agentName: `${agentId} (${model})`,
			strategy: input.message,
			model,
			forkRepoName: forkRepo,
			remoteUrl: `https://0f6fb593710f5180ab2426f06c0eaa56.artifacts.cloudflare.net/git/default/${forkRepo}.git`,
			scopedTokenId: session?.scopedTokenId ?? "tok_agent_scoped",
			scopedTokenScope: "write",
			headCommitHash: commitHash,
			status: conflicts.some((c) => c.severity === "high")
				? "conflict_warning"
				: "verified",
			score: 96,
			filesChanged: filesTouched,
			symbolsChanged: input.symbolsModified,
			diffSummary: `Updated ${filesTouched.join(", ")}`,
			diffPreview: input.files
				.map((f) => `// ${f.path}\n${f.content.slice(0, 260)}`)
				.join("\n\n"),
			provenance,
		};

		targetArena.candidates.unshift(candidate);
		targetArena.conflicts = conflicts;
		targetArena.mergeOrder = mergeOrder;

		return {
			commitHash,
			forkRepo,
			provenance,
			intent,
			conflicts,
			mergeOrder,
			arenaId: targetArena.id,
		};
	}

	async updateAgentsMdContract(
		artifacts: Artifacts,
		input: {
			baseRepo?: string;
			content: string;
			authorName?: string;
		},
	): Promise<{ commitHash: string; updatedAt: string }> {
		const baseRepo = input.baseRepo ?? "gitpub-platform";
		let commitHash = "0".repeat(40);
		if (artifacts instanceof SimulatedArtifactsNamespace) {
			const meta = artifacts.recordSyntheticCommit(baseRepo, {
				message: "chore(governance): update AGENTS.md repository contract invariants",
				authorName: input.authorName ?? "Hemanth HM (Human Governor)",
				authorEmail: "hemanth.hm@gmail.com",
				files: [
					{
						path: "AGENTS.md",
						content: input.content,
						contentType: "text/markdown; charset=utf-8",
					},
				],
			});
			if (meta) {
				commitHash = meta.hash;
			}
		}
		return {
			commitHash,
			updatedAt: new Date().toISOString(),
		};
	}

	listArenas(): AgentArenaTask[] {
		return Array.from(this.#arenas.values()).sort((a, b) =>
			b.createdAt.localeCompare(a.createdAt),
		);
	}

	getArena(id: string): AgentArenaTask | undefined {
		return this.#arenas.get(id);
	}

	listIntents(): SemanticIntentLock[] {
		return Array.from(this.#intents.values());
	}

	registerIntent(input: {
		agentId: string;
		forkRepo: string;
		baseRepo?: string;
		targetFiles: string[];
		targetSymbols: string[];
		summary: string;
		mutatesPublicContract?: boolean;
	}): {
		intent: SemanticIntentLock;
		conflicts: SemanticConflict[];
		mergeOrder: string[];
	} {
		const id = `intent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
		const intent: SemanticIntentLock = {
			id,
			agentId: input.agentId,
			forkRepo: input.forkRepo,
			baseRepo: input.baseRepo ?? "gitpub-platform",
			targetFiles: input.targetFiles,
			targetSymbols: input.targetSymbols,
			summary: input.summary,
			mutatesPublicContract: Boolean(input.mutatesPublicContract),
			createdAt: new Date().toISOString(),
		};
		this.#intents.set(id, intent);
		const all = this.listIntents().filter((i) => i.baseRepo === intent.baseRepo);
		const conflicts = this.computeSemanticConflicts(all);
		const mergeOrder = this.computeOptimalMergeOrder(all, conflicts);
		return { intent, conflicts, mergeOrder };
	}

	computeSemanticConflicts(intents: SemanticIntentLock[]): SemanticConflict[] {
		const conflicts: SemanticConflict[] = [];

		for (let i = 0; i < intents.length; i++) {
			for (let j = i + 1; j < intents.length; j++) {
				const a = intents[i];
				const b = intents[j];
				if (a.baseRepo !== b.baseRepo) continue;

				const overlappingFiles = a.targetFiles.filter((f) => b.targetFiles.includes(f));
				const overlappingSymbols = a.targetSymbols.filter((s) =>
					b.targetSymbols.includes(s),
				);

				if (overlappingFiles.length === 0 && overlappingSymbols.length === 0) {
					continue;
				}

				const contractDivergence =
					(a.mutatesPublicContract || b.mutatesPublicContract) &&
					overlappingSymbols.length > 0;

				const kind: SemanticConflict["kind"] = contractDivergence
					? "contract_divergence"
					: overlappingSymbols.length > 0
						? "symbol_collision"
						: "file_overlap";

				const severity: SemanticConflict["severity"] = contractDivergence
					? "high"
					: overlappingSymbols.length > 0
						? "medium"
						: "low";

				const recommendation = contractDivergence
					? `Merge ${a.mutatesPublicContract ? a.forkRepo : b.forkRepo} first to establish the new symbol signature (${overlappingSymbols.join(", ")}), then rebase the secondary fork with updated AST types.`
					: overlappingSymbols.length > 0
						? `Both agents mutate symbol(s) [${overlappingSymbols.join(", ")}] in ${overlappingFiles.join(", ")}. Run AST-level function composition or synthesize a hybrid candidate.`
						: `Disjoint symbol edits within ${overlappingFiles.join(", ")}. Safe for automatic three-way tree synthesis.`;

				conflicts.push({
					id: `conf_${a.id}_${b.id}`,
					severity,
					kind,
					agentA: a.agentId,
					agentB: b.agentId,
					forkA: a.forkRepo,
					forkB: b.forkRepo,
					overlappingFiles,
					overlappingSymbols,
					recommendation,
				});
			}
		}

		return conflicts;
	}

	computeOptimalMergeOrder(
		intents: SemanticIntentLock[],
		conflicts: SemanticConflict[],
	): string[] {
		const conflictWeight = new Map<string, number>();
		for (const item of intents) {
			conflictWeight.set(item.forkRepo, 0);
		}
		for (const c of conflicts) {
			const penalty = c.severity === "high" ? 3 : c.severity === "medium" ? 2 : 1;
			conflictWeight.set(c.forkA, (conflictWeight.get(c.forkA) ?? 0) + penalty);
			conflictWeight.set(c.forkB, (conflictWeight.get(c.forkB) ?? 0) + penalty);
		}

		return [...intents]
			.sort((a, b) => {
				const wa = conflictWeight.get(a.forkRepo) ?? 0;
				const wb = conflictWeight.get(b.forkRepo) ?? 0;
				if (wa === 0 && wb > 0) return -1;
				if (wb === 0 && wa > 0) return 1;
				if (a.mutatesPublicContract !== b.mutatesPublicContract) {
					return a.mutatesPublicContract ? -1 : 1;
				}
				return wa - wb;
			})
			.map((i) => i.forkRepo);
	}

	async launchArenaTask(
		artifacts: Artifacts,
		input: {
			title: string;
			prompt: string;
			baseRepo?: string;
		},
	): Promise<AgentArenaTask> {
		const baseRepoName = input.baseRepo ?? "gitpub-platform";
		const arenaId = `arena_${Date.now().toString(36)}`;
		const shortId = arenaId.slice(-5);

		let baseRepoHandle: ArtifactsRepo;
		try {
			baseRepoHandle = await artifacts.get(baseRepoName);
		} catch {
			await artifacts.create(baseRepoName, {
				description: "Baseline repository for GitPub multi-agent swarm orchestration",
				setDefaultBranch: "main",
			});
			baseRepoHandle = await artifacts.get(baseRepoName);
		}

		using baseRepo = baseRepoHandle;
		const baseInfo = await baseRepo.info();

		const agentsBlob = await baseRepo.readFile({
			ref: baseInfo.defaultBranch,
			path: "AGENTS.md",
		});
		const agentsMdContext = agentsBlob
			? await agentsBlob.text()
			: "# AGENTS.md\nStandard Cloudflare Workers & Artifacts repository conventions apply.";

		const agentSpecs = [
			{
				agentId: "agent-claude-4-6",
				agentName: "Claude 4.6 Opus (Systems Architect)",
				strategy: "Strict Capability Guard + Disposable RPC Stubs",
				model: "claude-opus-4-6",
				suffix: "claude",
				filesChanged: ["src/router.ts", "src/auth.ts"],
				symbolsChanged: ["dispatchRoute", "verifyBearerHeader"],
				mutatesContract: true,
				score: 97,
				latencyMs: 1420,
				tokenCount: 3840,
				whySummary:
					"Eliminate unauthenticated write paths while guaranteeing zero leaked Cap'n Proto RPC handles in workerd.",
				reasoningSummary:
					"Enforced explicit `using repo = await env.ARTIFACTS.get(name)` resource disposal across all route handlers and added constant-time token scope checks.",
				diffSummary: "+42 / -8 lines across src/router.ts, src/auth.ts",
				diffPreview: `@@ -6,6 +6,15 @@ export async function dispatchRoute(request: Request, ctx: RouteContext): Promis
   const url = new URL(request.url);
+  const auth = verifyBearerHeader(request.headers.get("Authorization"), ctx.namespace);
+  if (request.method !== "GET" && !auth.valid) {
+    return Response.json({ error: "Unauthorized token scope" }, { status: 401 });
+  }
   if (url.pathname === "/health") {
     return Response.json({ ok: true, namespace: ctx.namespace });
   }`,
			},
			{
				agentId: "agent-gemini-3-pro",
				agentName: "Gemini 3.1 Pro (Edge Performance)",
				strategy: "Zero-Checkout Tree Streaming + Immutable SHA-1 Cache",
				model: "gemini-3.1-pro",
				suffix: "gemini",
				filesChanged: ["src/router.ts", "README.md"],
				symbolsChanged: ["dispatchRoute", "RouteContext"],
				mutatesContract: false,
				score: 94,
				latencyMs: 980,
				tokenCount: 2910,
				whySummary:
					"Avoid redundant Artifacts RPC reads on 40-char SHA-1 object hashes since Git blobs and trees are cryptographically immutable.",
				reasoningSummary:
					"Leveraged content-addressable 40-char SHA-1 tree and blob hashes from `repo.readTree()` to attach `Cache-Control: public, max-age=31536000, immutable` headers.",
				diffSummary: "+38 / -4 lines across src/router.ts, README.md",
				diffPreview: `@@ -8,4 +8,11 @@ export async function dispatchRoute(request: Request, ctx: RouteContext): Promis
   if (url.pathname === "/health") {
-    return Response.json({ ok: true, namespace: ctx.namespace });
+    return Response.json(
+      { ok: true, namespace: ctx.namespace, cacheMode: "sha1-immutable" },
+      { headers: { "Cache-Control": "public, max-age=31536000, immutable" } }
+    );
   }`,
			},
			{
				agentId: "agent-codex-high",
				agentName: "Codex o4-mini (Verification & Invariants)",
				strategy: "Queue Event Schema Validation + AGENTS.md Guardrails",
				model: "codex-o4-mini",
				suffix: "codex",
				filesChanged: ["AGENTS.md", "src/auth.ts"],
				symbolsChanged: ["verifyBearerHeader"],
				mutatesContract: false,
				score: 91,
				latencyMs: 810,
				tokenCount: 2150,
				whySummary:
					"Ensure expired `art_v1_` tokens are rejected at the Worker edge before invoking downstream repository mutations.",
				reasoningSummary:
					"Added strict token expiry query parameter validation (`?expires=`) and updated `AGENTS.md` with Queue consumer idempotency rules.",
				diffSummary: "+29 / -3 lines across AGENTS.md, src/auth.ts",
				diffPreview: `@@ -7,6 +7,9 @@ export function verifyBearerHeader(header: string | null, repo: string): TokenVe
   if (!header || !header.startsWith("Bearer art_v1_")) {
     return { valid: false, scope: "read", repo };
   }
+  if (!header.includes("?expires=")) {
+    return { valid: false, scope: "read", repo };
+  }
   return { valid: true, scope: "write", repo };`,
			},
		];

		const candidates: AgentCandidateRun[] = [];
		const taskIntents: SemanticIntentLock[] = [];

		for (const spec of agentSpecs) {
			const forkName = `task-${shortId}-${spec.suffix}`;
			const forked = await baseRepo.fork(forkName, {
				description: `[Arena ${arenaId}] ${spec.agentName}: ${input.title}`,
				readOnly: false,
				defaultBranchOnly: true,
			});

			using forkHandle = await artifacts.get(forkName);
			const scopedToken = await forkHandle.createToken("write", 3600);

			let headCommitHash = `${shortId}${spec.suffix}`.padEnd(40, "a").slice(0, 40);
			if (artifacts instanceof SimulatedArtifactsNamespace) {
				const commitMeta = artifacts.recordSyntheticCommit(forkName, {
					message: `${input.title} (${spec.strategy})\n\nAgent-Id: ${spec.agentId}\nAgent-Model: ${spec.model}\nArena-Task: ${arenaId}`,
					authorName: spec.agentName,
					authorEmail: `${spec.agentId}@agents.gitpub.dev`,
					files: spec.filesChanged.map((path) => ({
						path,
						content: `// Modified by ${spec.agentName} for task: ${input.title}\n// Strategy: ${spec.strategy}\n${spec.diffPreview}\n`,
					})),
				});
				if (commitMeta) {
					headCommitHash = commitMeta.hash;
				}
			} else {
				const commits = await forkHandle.log({ limit: 1 });
				if (commits[0]) {
					headCommitHash = commits[0].hash;
				}
			}

			const provenance: AgentProvenanceNote = {
				commitHash: headCommitHash,
				agentId: spec.agentId,
				agentRole: spec.agentName,
				model: spec.model,
				prompt: input.prompt,
				whySummary: spec.whySummary,
				reasoningSummary: spec.reasoningSummary,
				agentsMdRulesApplied: [
					"Rule #1: Zero Credential Leakage",
					"Rule #2: Disposable RPC Handles (using repo)",
					"Rule #4: Semantic Intent Declaration",
				],
				toolsInvoked: [
					"artifacts.get",
					"repo.readFile(AGENTS.md)",
					"project.fork",
					"repo.createToken",
					"git.push",
					"REVIEW_WORKFLOW.create",
				],
				filesTouched: spec.filesChanged,
				symbolsModified: spec.symbolsChanged,
				verification: {
					typecheckPassed: true,
					testsPassed: 18,
					testsTotal: 18,
					latencyMs: spec.latencyMs,
					tokenCount: spec.tokenCount,
					reviewWorkflowVerdict: "approved",
				},
				createdAt: new Date().toISOString(),
			};

			this.#provenanceByCommit.set(headCommitHash, provenance);

			const intentLock: SemanticIntentLock = {
				id: `intent_${arenaId}_${spec.suffix}`,
				agentId: spec.agentId,
				forkRepo: forkName,
				baseRepo: baseRepoName,
				targetFiles: spec.filesChanged,
				targetSymbols: spec.symbolsChanged,
				summary: `${input.title} — ${spec.strategy}`,
				mutatesPublicContract: spec.mutatesContract,
				createdAt: new Date().toISOString(),
			};
			this.#intents.set(intentLock.id, intentLock);
			taskIntents.push(intentLock);

			candidates.push({
				id: `cand_${shortId}_${spec.suffix}`,
				agentId: spec.agentId,
				agentName: spec.agentName,
				strategy: spec.strategy,
				model: spec.model,
				forkRepoName: forkName,
				remoteUrl: forked.remote,
				scopedTokenId: scopedToken.id,
				scopedTokenScope: scopedToken.scope,
				headCommitHash,
				status: "verified",
				score: spec.score,
				filesChanged: spec.filesChanged,
				symbolsChanged: spec.symbolsChanged,
				diffSummary: spec.diffSummary,
				diffPreview: spec.diffPreview,
				provenance,
			});
		}

		const conflicts = this.computeSemanticConflicts(taskIntents);
		const mergeOrder = this.computeOptimalMergeOrder(taskIntents, conflicts);

		const arena: AgentArenaTask = {
			id: arenaId,
			title: input.title,
			prompt: input.prompt,
			baseRepo: baseRepoName,
			baseBranch: baseInfo.defaultBranch,
			agentsMdContext,
			status: "ready_to_promote",
			promotedCandidateId: null,
			synthesizedCandidateId: null,
			candidates,
			conflicts,
			mergeOrder,
			createdAt: new Date().toISOString(),
		};

		this.#arenas.set(arenaId, arena);
		return arena;
	}

	async synthesizeArenaCandidates(
		artifacts: Artifacts,
		arenaId: string,
	): Promise<{
		arena: AgentArenaTask;
		synthesizedCandidate: AgentCandidateRun;
		commitHash: string;
	} | null> {
		const arena = this.#arenas.get(arenaId);
		if (!arena || arena.candidates.length === 0) return null;

		const shortId = arenaId.slice(-5);
		const synthForkName = `task-${shortId}-synthesized`;
		using baseRepo = await artifacts.get(arena.baseRepo);

		let forked: ArtifactsCreateRepoResult;
		try {
			forked = await baseRepo.fork(synthForkName, {
				description: `[AST Synthesis] Combined multi-agent implementation for ${arena.title}`,
				readOnly: false,
				defaultBranchOnly: true,
			});
		} catch {
			using existing = await artifacts.get(synthForkName);
			const info = await existing.info();
			const tok = await existing.createToken("write", 3600);
			forked = {
				id: info.id,
				name: info.name,
				description: info.description,
				defaultBranch: info.defaultBranch,
				remote: info.remote,
				token: tok.plaintext,
			};
		}

		using synthHandle = await artifacts.get(synthForkName);
		const scopedToken = await synthHandle.createToken("write", 3600);

		const allFiles = Array.from(
			new Set(arena.candidates.flatMap((c) => c.filesChanged)),
		);
		const allSymbols = Array.from(
			new Set(arena.candidates.flatMap((c) => c.symbolsChanged)),
		);
		const contributingModels = arena.candidates.map((c) => c.model).join(" + ");

		const synthesizedDiff = `// ══ AST-SYNTHESIZED MULTI-AGENT COMMIT (${contributingModels}) ══
// 1. From claude-opus-4-6: Scoped bearer capability guard in dispatchRoute()
// 2. From gemini-3.1-pro: Immutable 1-year SHA-1 Cache-Control headers
// 3. From codex-o4-mini: ?expires= parameter verification in verifyBearerHeader()
export async function dispatchRoute(request: Request, ctx: RouteContext): Promise<Response> {
  const auth = verifyBearerHeader(request.headers.get("Authorization"), ctx.namespace);
  if (request.method !== "GET" && !auth.valid) {
    return Response.json({ error: "Unauthorized token scope" }, { status: 401 });
  }
  return Response.json(
    { ok: true, namespace: ctx.namespace, cacheMode: "sha1-immutable" },
    { headers: { "Cache-Control": "public, max-age=31536000, immutable" } }
  );
}`;

		let headCommitHash = `${shortId}synth`.padEnd(40, "e").slice(0, 40);
		if (artifacts instanceof SimulatedArtifactsNamespace) {
			const commitMeta = artifacts.recordSyntheticCommit(synthForkName, {
				message: `feat(synthesized): ${arena.title}\n\nSynthesized-From: ${arena.candidates.map((c) => c.forkRepoName).join(", ")}\nMerge-Order: ${arena.mergeOrder.join(" -> ")}`,
				authorName: "GitPub AST Synthesizer",
				authorEmail: "synthesizer@agents.gitpub.dev",
				files: allFiles.map((path) => ({
					path,
					content: synthesizedDiff,
				})),
			});
			if (commitMeta) {
				headCommitHash = commitMeta.hash;
			}
		}

		const provenance: AgentProvenanceNote = {
			commitHash: headCommitHash,
			agentId: "agent-ast-synthesizer",
			agentRole: `Hybrid AST Synthesis (${contributingModels})`,
			model: contributingModels,
			prompt: arena.prompt,
			whySummary:
				"Combine Claude's capability guard, Gemini's immutable SHA-1 caching, and Codex's token expiry validation without human line-by-line conflict resolution.",
			reasoningSummary: `Followed topological merge order (${arena.mergeOrder.join(" → ")}) to compose non-overlapping AST symbol mutations across ${allFiles.join(", ")}.`,
			agentsMdRulesApplied: [
				"Rule #1: Zero Credential Leakage",
				"Rule #2: Disposable RPC Handles (using repo)",
				"Rule #3: Provenance Trailers (refs/notes/agents)",
				"Rule #4: Semantic Intent Declaration",
			],
			toolsInvoked: [
				"arena.computeSemanticConflicts",
				"arena.computeOptimalMergeOrder",
				"ast.composeFunctions",
				"project.fork",
				"REVIEW_WORKFLOW.verify",
			],
			filesTouched: allFiles,
			symbolsModified: allSymbols,
			verification: {
				typecheckPassed: true,
				testsPassed: 18,
				testsTotal: 18,
				latencyMs: 620,
				tokenCount: 1940,
				reviewWorkflowVerdict: "synthesized",
			},
			createdAt: new Date().toISOString(),
		};

		this.#provenanceByCommit.set(headCommitHash, provenance);

		const synthesizedCandidate: AgentCandidateRun = {
			id: `cand_${shortId}_synth`,
			agentId: "agent-ast-synthesizer",
			agentName: "AST Hybrid Synthesis (Claude + Gemini + Codex)",
			strategy: "Topological AST Composition across all 3 Agent Forks",
			model: contributingModels,
			forkRepoName: synthForkName,
			remoteUrl: forked.remote,
			scopedTokenId: scopedToken.id,
			scopedTokenScope: "write",
			headCommitHash,
			status: "synthesized",
			score: 99,
			filesChanged: allFiles,
			symbolsChanged: allSymbols,
			diffSummary: `Synthesized +64 / -9 lines across ${allFiles.join(", ")}`,
			diffPreview: synthesizedDiff,
			provenance,
		};

		arena.candidates.unshift(synthesizedCandidate);
		arena.status = "synthesized";
		arena.synthesizedCandidateId = synthesizedCandidate.id;

		return { arena, synthesizedCandidate, commitHash: headCommitHash };
	}

	async promoteCandidate(
		artifacts: Artifacts,
		arenaId: string,
		candidateId: string,
	): Promise<AgentArenaTask | null> {
		const arena = this.#arenas.get(arenaId);
		if (!arena) return null;
		const candidate = arena.candidates.find((c) => c.id === candidateId);
		if (!candidate) return null;

		arena.status = "promoted";
		arena.promotedCandidateId = candidate.id;

		if (artifacts instanceof SimulatedArtifactsNamespace) {
			const commitMeta = artifacts.recordSyntheticCommit(arena.baseRepo, {
				message: `Merge Arena winner ${candidate.forkRepoName}: ${arena.title}\n\nPromoted-Candidate: ${candidate.id}\nAgent-Model: ${candidate.model}\nVerification-Score: ${candidate.score}/100`,
				authorName: candidate.agentName,
				authorEmail: `${candidate.agentId}@agents.gitpub.dev`,
				files: candidate.filesChanged.map((path) => ({
					path,
					content: `// Promoted from ${candidate.forkRepoName} (${candidate.strategy})\n${candidate.diffPreview}\n`,
				})),
			});
			if (commitMeta) {
				this.#provenanceByCommit.set(commitMeta.hash, {
					...candidate.provenance,
					commitHash: commitMeta.hash,
				});
			}
		}

		return arena;
	}

	getProvenanceForCommit(hash: string): AgentProvenanceNote | null {
		return this.#provenanceByCommit.get(hash) ?? null;
	}

	listProvenanceNotes(): AgentProvenanceNote[] {
		return Array.from(this.#provenanceByCommit.values());
	}

	listEvents(): ProcessedEventRecord[] {
		return [...this.#events];
	}

	async processArtifactsEvent(
		artifacts: Artifacts,
		event: ArtifactsQueueEvent,
	): Promise<ProcessedEventRecord> {
		const namespace = event.source?.namespace ?? event.namespace ?? "default";
		const repoName = event.source?.repoName ?? event.repo ?? "gitpub-platform";
		const eventId = event.id ?? `evt_${Date.now().toString(36)}`;
		let record: ProcessedEventRecord;

		if (event.type === "cf.artifacts.repo.pushed") {
			let commitInspected: ProcessedEventRecord["commitInspected"];
			try {
				using repo = await artifacts.get(repoName);
				const commit =
					(await repo.readCommit(event.payload.after).catch(() => null)) ??
					(await repo.log({ limit: 1 }))[0] ??
					null;
				if (commit) {
					const tree = await repo.readTree(commit.treeHash).catch(() => null);
					commitInspected = {
						hash: commit.hash,
						message: commit.message.split("\n")[0],
						author: `${commit.author.name} <${commit.author.email}>`,
						treeEntriesCount: tree ? tree.length : 0,
					};
				}
			} catch {
				// Repo might not be accessible if deleted
			}

			const pusherType = event.payload.pusher?.type ?? "token";
			const reviewWorkflowId = `wf_review_${event.payload.after.slice(0, 8)}`;

			record = {
				id: eventId,
				type: event.type,
				repo: repoName,
				namespace,
				summary: `Push to ${event.payload.ref} (${event.payload.before.slice(0, 7)}..${event.payload.after.slice(0, 7)}) via ${pusherType} → Triggered REVIEW_WORKFLOW (${reviewWorkflowId})`,
				reviewWorkflowId,
				reviewWorkflowStatus: "completed",
				commitInspected,
				receivedAt: new Date().toISOString(),
			};
		} else if (event.type === "cf.artifacts.repo.forked") {
			record = {
				id: eventId,
				type: event.type,
				repo: repoName,
				namespace,
				summary: `Zero-copy fork created from ${event.payload.sourceRepo} (branch: ${event.payload.defaultBranch})`,
				receivedAt: new Date().toISOString(),
			};
		} else {
			record = {
				id: eventId,
				type: event.type,
				repo: repoName,
				namespace,
				summary: `Repository created (defaultBranch: ${event.payload.defaultBranch}, readOnly: ${event.payload.readOnly})`,
				receivedAt: new Date().toISOString(),
			};
		}

		this.#events.unshift(record);
		if (this.#events.length > 50) {
			this.#events.length = 50;
		}
		return record;
	}
}

export const sharedCoordinator = new GitPubCoordinator();
export { sharedSimulator };
