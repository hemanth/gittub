export type ActorType = "human" | "agent";

export interface ActorSession {
	sessionId: string;
	actorType: ActorType;
	identity: string;
	role: "human_governor" | "autonomous_agent";
	model?: string;
	permissions: string[];
	restrictions: string[];
	assignedForkRepo?: string;
	assignedRemoteUrl?: string;
	scopedTokenId?: string;
	scopedTokenPreview?: string;
	agentsMdContract?: string;
	createdAt: string;
}

export interface ArtifactsPushedEvent {
	type: "cf.artifacts.repo.pushed";
	version?: string;
	id?: string;
	time?: string;
	accountId?: string;
	namespace?: string;
	repo?: string;
	source?: {
		namespace: string;
		repoName: string;
	};
	payload: {
		ref: string;
		before: string;
		after: string;
		pusher?: {
			type: "token" | "worker" | "dashboard";
			tokenId?: string;
		};
	};
}

export interface ArtifactsForkedEvent {
	type: "cf.artifacts.repo.forked";
	version?: string;
	id?: string;
	time?: string;
	accountId?: string;
	namespace?: string;
	repo?: string;
	source?: {
		namespace: string;
		repoName: string;
	};
	payload: {
		sourceRepo: string;
		defaultBranch: string;
		readOnly: boolean;
	};
}

export interface ArtifactsCreatedEvent {
	type: "cf.artifacts.repo.created";
	version?: string;
	id?: string;
	time?: string;
	accountId?: string;
	namespace?: string;
	repo?: string;
	source?: {
		namespace: string;
		repoName: string;
	};
	payload: {
		defaultBranch: string;
		readOnly: boolean;
		source?: string;
	};
}

export type ArtifactsQueueEvent =
	| ArtifactsPushedEvent
	| ArtifactsForkedEvent
	| ArtifactsCreatedEvent;

export interface AgentProvenanceNote {
	commitHash: string;
	agentId: string;
	agentRole: string;
	model: string;
	prompt: string;
	whySummary: string;
	reasoningSummary: string;
	agentsMdRulesApplied: string[];
	toolsInvoked: string[];
	filesTouched: string[];
	symbolsModified: string[];
	verification: {
		typecheckPassed: boolean;
		testsPassed: number;
		testsTotal: number;
		latencyMs: number;
		tokenCount: number;
		reviewWorkflowVerdict: "approved" | "synthesized" | "needs_rebase";
	};
	createdAt: string;
}

export interface SemanticIntentLock {
	id: string;
	agentId: string;
	forkRepo: string;
	baseRepo: string;
	targetFiles: string[];
	targetSymbols: string[];
	summary: string;
	mutatesPublicContract: boolean;
	createdAt: string;
}

export interface SemanticConflict {
	id: string;
	severity: "low" | "medium" | "high";
	kind: "file_overlap" | "symbol_collision" | "contract_divergence";
	agentA: string;
	agentB: string;
	forkA: string;
	forkB: string;
	overlappingFiles: string[];
	overlappingSymbols: string[];
	recommendation: string;
}

export interface AgentCandidateRun {
	id: string;
	agentId: string;
	agentName: string;
	strategy: string;
	model: string;
	forkRepoName: string;
	remoteUrl: string;
	scopedTokenId: string;
	scopedTokenScope: "read" | "write";
	headCommitHash: string;
	status: "verified" | "synthesized" | "conflict_warning" | "failed";
	score: number;
	filesChanged: string[];
	symbolsChanged: string[];
	diffSummary: string;
	diffPreview: string;
	provenance: AgentProvenanceNote;
}

export interface AgentArenaTask {
	id: string;
	title: string;
	prompt: string;
	baseRepo: string;
	baseBranch: string;
	agentsMdContext: string;
	status: "evaluating" | "ready_to_promote" | "synthesized" | "promoted";
	promotedCandidateId: string | null;
	synthesizedCandidateId?: string | null;
	candidates: AgentCandidateRun[];
	conflicts: SemanticConflict[];
	mergeOrder: string[];
	createdAt: string;
}

export interface ProcessedEventRecord {
	id: string;
	type: ArtifactsQueueEvent["type"];
	repo: string;
	namespace: string;
	summary: string;
	reviewWorkflowId?: string;
	reviewWorkflowStatus?: "completed" | "running";
	commitInspected?: {
		hash: string;
		message: string;
		author: string;
		treeEntriesCount: number;
	};
	receivedAt: string;
}
