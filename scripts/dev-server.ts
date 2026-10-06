import { createServer } from "node:http";
import { sharedSimulator } from "../src/arena.ts";
import worker from "../src/index.ts";

const PORT = Number(process.env.PORT ?? 8787);
const env: Env = {
	ARTIFACTS: sharedSimulator,
};

const server = createServer(async (req, res) => {
	try {
		const host = req.headers.host ?? `localhost:${PORT}`;
		const url = `http://${host}${req.url ?? "/"}`;

		const chunks: Buffer[] = [];
		for await (const chunk of req) {
			chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
		}
		const bodyBuffer = Buffer.concat(chunks);

		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (Array.isArray(value)) {
				for (const v of value) headers.append(key, v);
			} else if (typeof value === "string") {
				headers.set(key, value);
			}
		}

		const method = req.method ?? "GET";
		const hasBody = method !== "GET" && method !== "HEAD" && bodyBuffer.length > 0;

		const webReq = new Request(url, {
			method,
			headers,
			body: hasBody ? bodyBuffer : undefined,
		});

		const webRes = await worker.fetch(webReq, env);

		res.statusCode = webRes.status;
		const setCookies =
			typeof webRes.headers.getSetCookie === "function"
				? webRes.headers.getSetCookie()
				: [];
		if (setCookies.length > 0) {
			res.setHeader("Set-Cookie", setCookies);
		}

		webRes.headers.forEach((val, key) => {
			if (key.toLowerCase() !== "set-cookie") {
				res.setHeader(key, val);
			}
		});

		const arrayBuffer = await webRes.arrayBuffer();
		res.end(Buffer.from(arrayBuffer));
	} catch (err) {
		res.statusCode = 500;
		res.setHeader("Content-Type", "application/json");
		res.end(
			JSON.stringify({
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`GitPub Worker running at http://localhost:${PORT}`);
});
