import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	accountId: "0f6fb593710f5180ab2426f06c0eaa56",
	worker: {
		name: "gitpub",
		compatibilityDate: "2026-10-05",
		entrypoint,
		env: {
			ARTIFACTS: bindings.artifacts({
				namespace: "default",
			}),
		},
	},
});
