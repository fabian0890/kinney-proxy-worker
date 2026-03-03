export interface Env {
	// Secrets
	KPH_AGENT: string;
	SYNERIO_BEARER: string;
	HEROKU_API_KEY: string;
	SFMC_BEARER: string;
  
	KPH_BASE_URL: string;
	SYNERIO_BASE_URL: string;
	SFMC_BASE_URL: string;
	HEROKU_BASE_URL: string;
	KPH_PROXY_KEY: string;
  
	// Vars
	ALLOWED_ORIGINS?: string; // "http://localhost:8100,https://client.hivegroup.nyc"
  }
  
  function buildCorsHeaders(req: Request, env: Env) {
	const origin = req.headers.get("Origin") || "";
	const allowed = (env.ALLOWED_ORIGINS || "")
	  .split(",")
	  .map((s) => s.trim())
	  .filter(Boolean);
  
	const headers: Record<string, string> = {
	  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
	  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
	  "Access-Control-Max-Age": "86400",
	  "Vary": "Origin",
	};
  
	if (origin && allowed.includes(origin)) {
	  headers["Access-Control-Allow-Origin"] = origin;
	}
  
	return headers;
  }
  
  function json(status: number, body: any, cors?: Record<string, string>) {
	return new Response(JSON.stringify(body), {
	  status,
	  headers: {
		"Content-Type": "application/json",
		...(cors || {}),
	  },
	});
  }
  
  function safeJoinUrl(base: string, pathAndQuery: string) {
	// base: https://host
	// pathAndQuery: /kph/.. ?x=1
	const baseUrl = new URL(base);
	const target = new URL(pathAndQuery, baseUrl);
	return target.toString();
  }
  
  function cloneHeadersForUpstream(req: Request) {
	const h = new Headers(req.headers);
	
	h.delete("Host");
	h.delete("Content-Length");

	return h;
  }
  
  async function forward(req: Request, targetUrl: string, extraHeaders: Record<string, string>) {
	const headers = cloneHeadersForUpstream(req);
  
	// overwrite and inject secrets
	for (const [k, v] of Object.entries(extraHeaders)) {
	  headers.set(k, v);
	}
  
	const init: RequestInit = {
	  method: req.method,
	  headers,
	  body: ["GET", "HEAD"].includes(req.method.toUpperCase()) ? undefined : await req.arrayBuffer(),
	  redirect: "follow",
	};
  
	const upstreamResp = await fetch(targetUrl, init);
  
	const respHeaders = new Headers(upstreamResp.headers);
	// respHeaders.delete("set-cookie"); // 
  
	return new Response(upstreamResp.body, {
	  status: upstreamResp.status,
	  statusText: upstreamResp.statusText,
	  headers: respHeaders,
	});
  }
  
  export default {
	async fetch(req: Request, env: Env): Promise<Response> {
	  const cors = buildCorsHeaders(req, env);
  
	  // Preflight
	  if (req.method.toUpperCase() === "OPTIONS") {
		return new Response(null, { status: 204, headers: cors });
	  }
  
	  const url = new URL(req.url);
	  const pathname = url.pathname;
  
	  // allowed:
	  // /proxy/kph/<path...>
	  // /proxy/synerio/<path...>
	  // /proxy/sfmc/<path...>
	  // /proxy/heroku/<path...>
  
	  const m = pathname.match(/^\/proxy\/(kph|synerio|heroku|sfmc)(\/.*)?$/);
	  if (!m) {
		return json(404, { error: "Not found" }, cors);
	  }
  
	  const service = m[1];
	  const restPath = m[2] || "/";
  
	  // Incluye querystring
	  const pathAndQuery = restPath + (url.search || "");
  
	  try {
		let targetUrl = "";
		let extraHeaders: Record<string, string> = {};
  
		if (service === "kph") {
			targetUrl = safeJoinUrl(env.KPH_BASE_URL, pathAndQuery);
			extraHeaders = {
				"KPH-Agent": env.KPH_AGENT,
				"X-Kinney-Proxy-Signature": env.KPH_PROXY_KEY
			};	
		} 
		else if (service === "synerio") {
		  targetUrl = safeJoinUrl(env.SYNERIO_BASE_URL, pathAndQuery);
		  extraHeaders = {
			Authorization: `Bearer ${env.SYNERIO_BEARER}`,
			"Content-Type": "application/json",
		  };
		} 
		else if (service === "sfmc") {
			targetUrl = safeJoinUrl(env.SFMC_BASE_URL, pathAndQuery);
			extraHeaders = {
			  Authorization: `Bearer ${env.SFMC_BEARER}`,
			  "Content-Type": "application/json",
			};
		} 
		else if (service === "heroku") {
		  targetUrl = safeJoinUrl(env.HEROKU_BASE_URL, pathAndQuery);
		  extraHeaders = {
			"x-api-key": env.HEROKU_API_KEY,
		  };
		}
  
		const upstream = await forward(req, targetUrl, extraHeaders);
  
		// Añadimos CORS al response final
		const finalHeaders = new Headers(upstream.headers);
		for (const [k, v] of Object.entries(cors)) finalHeaders.set(k, v);
  
		return new Response(upstream.body, {
		  status: upstream.status,
		  statusText: upstream.statusText,
		  headers: finalHeaders,
		});
	  } catch (e: any) {
		return json(500, { error: "Proxy failed", detail: String(e?.message || e) }, cors);
	  }
	},
  };