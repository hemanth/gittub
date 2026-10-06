const ACCOUNT_ID = "0f6fb593710f5180ab2426f06c0eaa56";
const DEFAULT_NAMESPACE = "default";

interface StoredFile {
	path: string;
	mode: string;
	content: string;
	contentType: string;
	blobHash: string;
}

interface StoredCommit {
	metadata: ArtifactsCommitMetadata;
	files: Map<string, StoredFile>;
	treeEntries: ArtifactsTreeEntry[];
}

interface StoredRepo {
	info: ArtifactsRepoInfo;
	tokens: Map<string, ArtifactsTokenInfo & { plaintext: string }>;
	commits: StoredCommit[];
	blobs: Map<string, { content: string; contentType: string }>;
	trees: Map<string, ArtifactsTreeEntry[]>;
}

function deterministicHash(seed: string): string {
	let h1 = 0xdeadbeef ^ seed.length;
	let h2 = 0x41c6ce57 ^ seed.length;
	let h3 = 0x9e3779b9 ^ seed.length;
	let h4 = 0x85ebca6b ^ seed.length;
	let h5 = 0xc2b2ae35 ^ seed.length;

	for (let i = 0; i < seed.length; i++) {
		const ch = seed.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
		h3 = Math.imul(h3 ^ ch, 2246822507);
		h4 = Math.imul(h4 ^ ch, 3266489909);
		h5 = Math.imul(h5 ^ ch, 374761393);
	}

	const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
	return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}${toHex(h5)}`;
}

function buildRemoteUrl(namespace: string, repoName: string): string {
	return `https://${ACCOUNT_ID}.artifacts.cloudflare.net/git/${namespace}/${repoName}.git`;
}

function createArtifactsError(
	code: ArtifactsErrorCode,
	numericCode: number,
	message: string,
): ArtifactsError {
	const err = new Error(message) as ArtifactsError;
	Object.defineProperty(err, "name", { value: "ArtifactsError" });
	Object.defineProperty(err, "code", { value: code });
	Object.defineProperty(err, "numericCode", { value: numericCode });
	return err;
}

const VALID_REPO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class SimulatedArtifactsRepo implements ArtifactsRepo {
	readonly #store: StoredRepo;
	readonly #namespace: SimulatedArtifactsNamespace;

	constructor(store: StoredRepo, namespace: SimulatedArtifactsNamespace) {
		this.#store = store;
		this.#namespace = namespace;
	}

	[Symbol.dispose](): void {
		// Release RPC stub handle (no-op in local simulation)
	}

	async createToken(
		scope: "write" | "read" = "write",
		ttl = 86400,
	): Promise<ArtifactsCreateTokenResult> {
		if (ttl < 60 || ttl > 31536000) {
			throw createArtifactsError(
				"INVALID_TTL",
				1010,
				`TTL must be between 60 and 31536000 seconds (got ${ttl})`,
			);
		}
		const now = Date.now();
		const expiresUnix = Math.floor(now / 1000) + ttl;
		const expiresAt = new Date(expiresUnix * 1000).toISOString();
		const id = `tok_${deterministicHash(`${this.#store.info.name}:${now}:${Math.random()}`).slice(0, 16)}`;
		const rawHex = deterministicHash(`${id}:${scope}:${expiresUnix}`);
		const plaintext = `art_v1_${rawHex}?expires=${expiresUnix}`;

		this.#store.tokens.set(id, {
			id,
			scope,
			state: "active",
			createdAt: new Date(now).toISOString(),
			expiresAt,
			plaintext,
		});

		return {
			id,
			plaintext,
			scope,
			expiresAt,
		};
	}

	async listTokens(): Promise<ArtifactsTokenListResult> {
		const tokens: ArtifactsTokenInfo[] = [];
		for (const tok of this.#store.tokens.values()) {
			tokens.push({
				id: tok.id,
				scope: tok.scope,
				state: tok.state,
				createdAt: tok.createdAt,
				expiresAt: tok.expiresAt,
			});
		}
		return {
			tokens,
			total: tokens.length,
		};
	}

	async revokeToken(tokenOrId: string): Promise<boolean> {
		if (!tokenOrId || tokenOrId.trim().length === 0) {
			throw createArtifactsError("INVALID_INPUT", 1005, "tokenOrId cannot be empty");
		}
		for (const [id, tok] of this.#store.tokens.entries()) {
			if (id === tokenOrId || tok.plaintext === tokenOrId) {
				tok.state = "revoked";
				return true;
			}
		}
		return false;
	}

	async info(): Promise<ArtifactsRepoInfo> {
		return { ...this.#store.info };
	}

	async readBlob(hash: string): Promise<Blob | null> {
		if (!/^[0-9a-f]{40}$/.test(hash)) {
			throw createArtifactsError("INVALID_INPUT", 1005, `Malformed SHA-1 hash: ${hash}`);
		}
		const blob = this.#store.blobs.get(hash);
		if (!blob) return null;
		return new Blob([blob.content]);
	}

	async readTree(hash: string): Promise<ArtifactsTreeEntry[] | null> {
		if (!/^[0-9a-f]{40}$/.test(hash)) {
			throw createArtifactsError("INVALID_INPUT", 1005, `Malformed SHA-1 hash: ${hash}`);
		}
		const tree = this.#store.trees.get(hash);
		if (!tree) return null;
		return tree.map((entry) => ({ ...entry }));
	}

	async readCommit(hash: string): Promise<ArtifactsCommitMetadata | null> {
		if (!/^[0-9a-f]{40}$/.test(hash)) {
			throw createArtifactsError("INVALID_INPUT", 1005, `Malformed SHA-1 hash: ${hash}`);
		}
		const found = this.#store.commits.find((c) => c.metadata.hash === hash);
		return found ? { ...found.metadata } : null;
	}

	async readFile(args: { ref: string; path: string }): Promise<Blob | null> {
		if (!args.ref || !args.path) {
			throw createArtifactsError("INVALID_INPUT", 1005, "Both ref and path are required");
		}
		const normalizedPath = args.path.replace(/^\/+/, "");
		const commit =
			args.ref === "HEAD" || args.ref === this.#store.info.defaultBranch || args.ref === "main"
				? this.#store.commits[0]
				: this.#store.commits.find((c) => c.metadata.hash === args.ref) ?? this.#store.commits[0];
		if (!commit) return null;
		const file = commit.files.get(normalizedPath);
		if (!file) return null;
		return new Blob([file.content], { type: file.contentType });
	}

	async log(opts?: {
		ref?: string;
		limit?: number;
		offset?: number;
	}): Promise<ArtifactsCommitMetadata[]> {
		const limit = Math.min(opts?.limit ?? 50, 1000);
		const offset = opts?.offset ?? 0;
		return this.#store.commits
			.slice(offset, offset + limit)
			.map((c) => ({ ...c.metadata }));
	}

	async fork(
		name: string,
		opts?: {
			description?: string;
			readOnly?: boolean;
			defaultBranchOnly?: boolean;
		},
	): Promise<ArtifactsCreateRepoResult> {
		return this.#namespace.forkFrom(this.#store, name, opts);
	}
}

export class SimulatedArtifactsNamespace implements Artifacts {
	readonly #repos = new Map<string, StoredRepo>();
	readonly #namespaceName: string;

	constructor(namespaceName = DEFAULT_NAMESPACE) {
		this.#namespaceName = namespaceName;
		this.#seedInitialRepository();
	}

	#seedInitialRepository(): void {
		const repoName = "gitpub-platform";
		const nowIso = new Date().toISOString();
		const nowUnix = Math.floor(Date.now() / 1000);

		const seedFiles: Array<{ path: string; content: string; contentType: string }> = [
			{
				path: "AGENTS.md",
				contentType: "text/markdown; charset=utf-8",
				content: `# AGENTS.md — GitPub Repository Contract

## Architectural Invariants
1. **Zero Credential Leakage**: Never store plaintext tokens in source files, Git config, or logs. Use \`git -c http.extraHeader="Authorization: Bearer $ARTIFACTS_TOKEN"\`.
2. **Disposable RPC Handles**: Always use \`using repo = await env.ARTIFACTS.get(name)\` so Worker RPC stubs are deterministically disposed before request completion.
3. **Provenance Trailers**: Every agent commit MUST attach an Agent Provenance Note (\`refs/notes/agents\`) with prompt, model, tool calls, and verification metrics.
4. **Semantic Intent Declaration**: Declare target files and exported symbols in the Intent Graph before mutating shared modules (\`src/router.ts\`, \`src/auth.ts\`).
`,
			},
			{
				path: "README.md",
				contentType: "text/markdown; charset=utf-8",
				content: `# GitPub Platform Core

Agent-native Git coordination platform built on **Cloudflare Workers** and **Cloudflare Artifacts**.

- **Zero-copy Agent Forks**: \`await repo.fork("agent-task-...")\`
- **Scoped Ephemeral Tokens**: \`await repo.createToken("write", 3600)\`
- **Zero-checkout Object Inspection**: \`readCommit\`, \`readTree\`, \`readFile\`, \`log\`
- **Event-driven Verification**: Queue consumer for \`cf.artifacts.repo.pushed\`
`,
			},
			{
				path: "src/router.ts",
				contentType: "text/plain; charset=utf-8",
				content: `export interface RouteContext {
  accountId: string;
  namespace: string;
  requestId: string;
}

export async function dispatchRoute(request: Request, ctx: RouteContext): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return Response.json({ ok: true, namespace: ctx.namespace });
  }
  return new Response("Not Found", { status: 404 });
}
`,
			},
			{
				path: "src/auth.ts",
				contentType: "text/plain; charset=utf-8",
				content: `export interface TokenVerification {
  valid: boolean;
  scope: "read" | "write";
  repo: string;
}

export function verifyBearerHeader(header: string | null, repo: string): TokenVerification {
  if (!header || !header.startsWith("Bearer art_v1_")) {
    return { valid: false, scope: "read", repo };
  }
  return { valid: true, scope: "write", repo };
}
`,
			},
		];

		const storedRepo = this.#buildStoredRepo(
			repoName,
			"Baseline repository for GitPub multi-agent swarm orchestration on Cloudflare Artifacts",
			"main",
			false,
			null,
			nowIso,
		);

		this.commitFilesToRepo(storedRepo, {
			message: "feat: initialize GitPub core with AGENTS.md contract and router",
			authorName: "Hemanth HM",
			authorEmail: "hemanth.hm@gmail.com",
			timestamp: nowUnix - 1800,
			files: seedFiles,
		});

		this.#repos.set(repoName, storedRepo);
	}

	#buildStoredRepo(
		name: string,
		description: string | null,
		defaultBranch: string,
		readOnly: boolean,
		source: string | null,
		nowIso: string,
	): StoredRepo {
		return {
			info: {
				id: `repo_${deterministicHash(`${this.#namespaceName}:${name}`).slice(0, 16)}`,
				name,
				description,
				defaultBranch,
				createdAt: nowIso,
				updatedAt: nowIso,
				lastPushAt: null,
				source,
				readOnly,
				remote: buildRemoteUrl(this.#namespaceName, name),
			},
			tokens: new Map(),
			commits: [],
			blobs: new Map(),
			trees: new Map(),
		};
	}

	commitFilesToRepo(
		storedRepo: StoredRepo,
		params: {
			message: string;
			authorName: string;
			authorEmail: string;
			timestamp?: number;
			files: Array<{ path: string; content: string; contentType?: string }>;
		},
	): ArtifactsCommitMetadata {
		const ts = params.timestamp ?? Math.floor(Date.now() / 1000);
		const parentCommit = storedRepo.commits[0];
		const mergedFiles = new Map<string, StoredFile>();

		if (parentCommit) {
			for (const [k, v] of parentCommit.files.entries()) {
				mergedFiles.set(k, { ...v });
			}
		}

		for (const f of params.files) {
			const cleanPath = f.path.replace(/^\/+/, "");
			const contentType =
				f.contentType ??
				(cleanPath.endsWith(".md")
					? "text/markdown; charset=utf-8"
					: cleanPath.endsWith(".json")
						? "application/json; charset=utf-8"
						: "text/plain; charset=utf-8");
			const blobHash = deterministicHash(`blob:${cleanPath}:${f.content}`);
			storedRepo.blobs.set(blobHash, { content: f.content, contentType });
			mergedFiles.set(cleanPath, {
				path: cleanPath,
				mode: "100644",
				content: f.content,
				contentType,
				blobHash,
			});
		}

		const treeEntries: ArtifactsTreeEntry[] = Array.from(mergedFiles.values()).map((file) => ({
			name: file.path,
			mode: file.mode,
			hash: file.blobHash,
			type: "blob" as const,
		}));

		const treeHash = deterministicHash(
			`tree:${storedRepo.info.name}:${treeEntries.map((e) => `${e.name}:${e.hash}`).join("|")}`,
		);
		storedRepo.trees.set(treeHash, treeEntries);

		const commitHash = deterministicHash(
			`commit:${storedRepo.info.name}:${treeHash}:${params.message}:${ts}`,
		);

		const metadata: ArtifactsCommitMetadata = {
			hash: commitHash,
			treeHash,
			message: params.message,
			author: {
				name: params.authorName,
				email: params.authorEmail,
			},
			committer: {
				name: params.authorName,
				email: params.authorEmail,
			},
			parents: parentCommit ? [parentCommit.metadata.hash] : [],
			authoredAt: ts,
			committedAt: ts,
		};

		storedRepo.commits.unshift({
			metadata,
			files: mergedFiles,
			treeEntries,
		});

		const isoNow = new Date(ts * 1000).toISOString();
		storedRepo.info.updatedAt = isoNow;
		storedRepo.info.lastPushAt = isoNow;

		return metadata;
	}

	recordSyntheticCommit(
		repoName: string,
		params: {
			message: string;
			authorName: string;
			authorEmail: string;
			files: Array<{ path: string; content: string; contentType?: string }>;
		},
	): ArtifactsCommitMetadata | null {
		const stored = this.#repos.get(repoName);
		if (!stored) return null;
		return this.commitFilesToRepo(stored, params);
	}

	async create(
		name: string,
		opts?: {
			readOnly?: boolean;
			description?: string;
			setDefaultBranch?: string;
		},
	): Promise<ArtifactsCreateRepoResult> {
		if (!VALID_REPO_NAME.test(name)) {
			throw createArtifactsError(
				"INVALID_REPO_NAME",
				1006,
				`Invalid repository name "${name}". Must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/`,
			);
		}
		if (this.#repos.has(name)) {
			throw createArtifactsError("ALREADY_EXISTS", 1001, `Repository "${name}" already exists`);
		}

		const nowIso = new Date().toISOString();
		const defaultBranch = opts?.setDefaultBranch ?? "main";
		const description = opts?.description ?? null;
		const readOnly = opts?.readOnly ?? false;

		const storedRepo = this.#buildStoredRepo(
			name,
			description,
			defaultBranch,
			readOnly,
			null,
			nowIso,
		);

		this.commitFilesToRepo(storedRepo, {
			message: "Initial commit",
			authorName: "GitPub Worker",
			authorEmail: "worker@gitpub.cloudflare.dev",
			files: [
				{
					path: "README.md",
					content: `# ${name}\n\n${description ?? "Created with Cloudflare Artifacts."}\n`,
				},
			],
		});

		this.#repos.set(name, storedRepo);

		const handle = new SimulatedArtifactsRepo(storedRepo, this);
		const token = await handle.createToken(readOnly ? "read" : "write", 86400);

		return {
			id: storedRepo.info.id,
			name: storedRepo.info.name,
			description: storedRepo.info.description,
			defaultBranch: storedRepo.info.defaultBranch,
			remote: storedRepo.info.remote,
			token: token.plaintext,
		};
	}

	async get(name: string): Promise<ArtifactsRepo> {
		const stored = this.#repos.get(name);
		if (!stored) {
			throw createArtifactsError("NOT_FOUND", 1002, `Repository "${name}" not found`);
		}
		return new SimulatedArtifactsRepo(stored, this);
	}

	async import(params: {
		source: {
			url: string;
			branch?: string;
			depth?: number;
		};
		target: {
			name: string;
			opts?: {
				description?: string;
				readOnly?: boolean;
			};
		};
	}): Promise<ArtifactsCreateRepoResult> {
		if (!params.source.url.startsWith("https://")) {
			throw createArtifactsError("INVALID_INPUT", 1005, "Import source URL must use HTTPS");
		}
		const created = await this.create(params.target.name, {
			description: params.target.opts?.description ?? `Imported from ${params.source.url}`,
			readOnly: params.target.opts?.readOnly ?? false,
			setDefaultBranch: params.source.branch ?? "main",
		});
		const stored = this.#repos.get(params.target.name);
		if (stored) {
			stored.info.source = params.source.url;
		}
		return created;
	}

	async list(opts?: {
		limit?: number;
		cursor?: string;
	}): Promise<ArtifactsRepoListResult> {
		const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
		const all = Array.from(this.#repos.values()).map((r) => {
			const { remote: _remote, ...rest } = r.info;
			return rest;
		});
		return {
			repos: all.slice(0, limit),
			total: all.length,
		};
	}

	listAllReposSummary(): Array<Omit<ArtifactsRepoInfo, "remote">> {
		return Array.from(this.#repos.values()).map((r) => {
			const { remote: _remote, ...rest } = r.info;
			return rest;
		});
	}

	async delete(name: string): Promise<boolean> {
		if (!VALID_REPO_NAME.test(name)) {
			throw createArtifactsError("INVALID_REPO_NAME", 1006, `Invalid repository name "${name}"`);
		}
		return this.#repos.delete(name);
	}

	async forkFrom(
		sourceRepo: StoredRepo,
		targetName: string,
		opts?: {
			description?: string;
			readOnly?: boolean;
			defaultBranchOnly?: boolean;
		},
	): Promise<ArtifactsCreateRepoResult> {
		if (!VALID_REPO_NAME.test(targetName)) {
			throw createArtifactsError(
				"INVALID_REPO_NAME",
				1006,
				`Invalid repository name "${targetName}"`,
			);
		}
		if (this.#repos.has(targetName)) {
			throw createArtifactsError(
				"ALREADY_EXISTS",
				1001,
				`Repository "${targetName}" already exists`,
			);
		}

		const nowIso = new Date().toISOString();
		const forked = this.#buildStoredRepo(
			targetName,
			opts?.description ?? `Fork of ${sourceRepo.info.name}`,
			sourceRepo.info.defaultBranch,
			opts?.readOnly ?? false,
			`artifacts:${this.#namespaceName}/${sourceRepo.info.name}`,
			nowIso,
		);

		forked.info.lastPushAt = sourceRepo.info.lastPushAt;
		for (const [k, v] of sourceRepo.blobs.entries()) {
			forked.blobs.set(k, { ...v });
		}
		for (const [k, v] of sourceRepo.trees.entries()) {
			forked.trees.set(
				k,
				v.map((entry) => ({ ...entry })),
			);
		}
		forked.commits = sourceRepo.commits.map((c) => ({
			metadata: { ...c.metadata, parents: [...c.metadata.parents] },
			files: new Map(Array.from(c.files.entries()).map(([p, f]) => [p, { ...f }])),
			treeEntries: c.treeEntries.map((e) => ({ ...e })),
		}));

		this.#repos.set(targetName, forked);
		const handle = new SimulatedArtifactsRepo(forked, this);
		const token = await handle.createToken(forked.info.readOnly ? "read" : "write", 3600);

		return {
			id: forked.info.id,
			name: forked.info.name,
			description: forked.info.description,
			defaultBranch: forked.info.defaultBranch,
			remote: forked.info.remote,
			token: token.plaintext,
		};
	}
}

export const sharedSimulator = new SimulatedArtifactsNamespace("default");
