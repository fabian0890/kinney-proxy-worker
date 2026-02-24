export default {
	async fetch(request: Request, env: any): Promise<Response> {
	  const url = new URL(request.url);
  
	  // ====== CORS ======
	  const origin = request.headers.get("Origin") || "";
  
	  const allowedOrigins = [
		"http://localhost:8100",
		"http://localhost:5173",
		"https://client.hivegroup.nyc",
	  ];
  
	  const corsHeaders: Record<string, string> = {
		"Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
	  };
  
	  if (allowedOrigins.includes(origin)) {
		corsHeaders["Access-Control-Allow-Origin"] = origin;
		corsHeaders["Vary"] = "Origin";
	  }
  
	  if (request.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: corsHeaders });
	  }
  
	  // ===== ROUTING =====
	  let targetBase = "";
	  let forwardPath = "";
	  let service = "";
  
	  if (url.pathname.startsWith("/kph/")) {
		targetBase = env.KPH_BASE_URL;
		forwardPath = url.pathname.replace(/^\/kph/, "");
		service = "kph";
	  } else if (url.pathname.startsWith("/synerio/")) {
		targetBase = env.SYNERIO_BASE_URL;
		forwardPath = url.pathname.replace(/^\/synerio/, "");
		service = "synerio";
	  } else if (url.pathname.startsWith("/heroku/")) {
		targetBase = env.HEROKU_BASE_URL;
		forwardPath = url.pathname.replace(/^\/heroku/, "");
		service = "heroku";
	  } else {
		return new Response("Not Found", { status: 404 });
	  }
  
	  const targetUrl = new URL(targetBase);
	  targetUrl.pathname = forwardPath;
	  targetUrl.search = url.search;
  
	  const headers = new Headers(request.headers);
	  headers.delete("Host");
	  headers.delete("Origin");
  
	  // ===== Inject Secrets =====
	  if (service === "kph") {
		headers.set("KPH-Agent", env.KPH_AGENT);
	  }
  
	  if (service === "synerio") {
		headers.set("Authorization", `Bearer ${env.SYNERIO_TOKEN}`);
	  }
  
	  if (service === "heroku") {
		headers.set("x-api-key", env.HEROKU_API_KEY);
	  }
  
	  const init: RequestInit = {
		method: request.method,
		headers,
		body: ["GET", "HEAD"].includes(request.method)
		  ? undefined
		  : await request.arrayBuffer(),
	  };
  
	  const response = await fetch(targetUrl.toString(), init);
  
	  const outHeaders = new Headers(response.headers);
	  Object.entries(corsHeaders).forEach(([k, v]) => {
		if (v) outHeaders.set(k, v);
	  });
  
	  return new Response(response.body, {
		status: response.status,
		headers: outHeaders,
	  });
	},
  };