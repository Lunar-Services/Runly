# Optional project stack suggestions

The dashboard's **Decide for me** action sends an authenticated `POST /api/projects/recommend-stack` with `{ "prompt": "Describe the project idea…" }`. Prompts must contain 10–2,000 characters. The response contains `template`, `language`, `name`, `reason`, and `mode` (`ai` or `mock`). The user can review the suggestion before creating a project. This endpoint creates no project, files, agent job, or sandbox.

For production, set server-only `RUNLY_STACK_RECOMMENDER_ENABLED=true` and `RUNLY_STACK_RECOMMENDER_MODEL` to a model available to your OpenAI project that supports Responses with Structured Outputs. It uses the existing `OPENAI_API_KEY`; `OPENAI_MODEL` remains the sandbox Agents model. Compose passes the two suggestion settings only to the web service. Restart the web container after changing them.

The existing `runtime_policy.enabled` must be true and `provider_config.emergency_stop` false. Missing policy records fail closed. The endpoint is limited to three requests per user per minute, 800 output tokens, a 20-second timeout, and no automatic retries. Calls use the official OpenAI endpoint, no tools, and `store:false`. Only the submitted idea is sent; account details and provider secrets are excluded.

Suggestions are separate small Responses calls and do **not** consume workspace usage reservations. Configure OpenAI project rate and spend controls before enabling them. The per-user limiter is not an aggregate spend cap. API failure or missing configuration produces an error; production never falls back to a pretend AI recommendation.

Local `RUNLY_RUNTIME_MODE=mock` returns a fixed TypeScript web suggestion with `mode:"mock"` and a reason explicitly identifying the local mock. It calls no AI provider. Mock mode is rejected in production. Real provider behavior has not been exercised by the local mock preview.

Supported pairs are web with HTML, JavaScript, or TypeScript, and empty with those languages or Python. The endpoint validates the response against this catalog after parsing it.

Implementation follows [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
