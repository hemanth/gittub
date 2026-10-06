import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

const usePaidArtifactsBinding = process.env.CF_DISABLE_ARTIFACTS_BINDING !== "1";

export default defineConfig({
	accountId: "0f6fb593710f5180ab2426f06c0eaa56",
	worker: {
		name: "gittub",
		compatibilityDate: "2026-10-05",
		entrypoint,
		env: usePaidArtifactsBinding
			? {
					ARTIFACTS: bindings.artifacts({
						namespace: "default",
					}),
				}
			: {},
	},
});
