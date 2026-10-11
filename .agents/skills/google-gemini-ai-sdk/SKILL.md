---
name: google-gemini-ai-sdk
description: Reference for the Google Gemini provider in the Vercel AI SDK (`@ai-sdk/google`) - provider setup, language models, provider options (thinking, safety, caching, media resolution), file and YouTube inputs, built-in tools (code execution, Google Search, URL context, Maps, File Search), structured output schema limits, model capability table, batch, and realtime. Use when calling Gemini models, adding or changing AI features that use Gemini, choosing a Gemini model ID, enabling thinking or grounding, or debugging Gemini "invalid argument" errors.
---

# Google Gemini provider (AI SDK)

Source: https://ai-sdk.dev/providers/ai-sdk-providers/google (saved from the docs page; the pasted copy was cut off inside the Interactions API section).

**Project note:** this app currently calls the Gemini REST API directly with `fetch` from `src/lib/ai.ts` (`generateContent` endpoint, `x-goog-api-key` header, model `gemini-2.5-flash`). The `@ai-sdk/google` package is not installed. Use the sections below for behavior and option names; use the SDK only if the project adds it.

## Setup

```bash
pnpm add @ai-sdk/google
```

```ts
import { google } from '@ai-sdk/google';            // default instance, reads GOOGLE_GENERATIVE_AI_API_KEY
import { createGoogle } from '@ai-sdk/google';      // custom instance

const google = createGoogle({ /* settings */ });
```

Provider settings (all optional):

- `apiKey` - sent as `x-goog-api-key`. Defaults to `GOOGLE_GENERATIVE_AI_API_KEY`.
- `baseURL` - default `https://generativelanguage.googleapis.com/v1beta`. Use for proxies.
- `headers`, `fetch` (middleware or test double), `generateId`, `name` (default `'google.generative-ai'`).
- `batchResultDownloads.maxLineBytes` - max bytes per JSONL batch row, default 64 MiB; oversized rows throw `DownloadError`.

## Language models

```ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const { text } = await generateText({
  model: google('gemini-3.8-flash'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

`streamText` and structured output (`Output.object`) also work. Unknown `gemini-*` IDs and `-latest` aliases are treated like the newest generation (Gemini 3 request behavior). Known legacy IDs keep their own behavior.

## Provider options

Pass under `providerOptions.google` and type them with `GoogleLanguageModelOptions`:

```ts
import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';

await generateText({
  model: google('gemini-3.8-flash'),
  prompt: '...',
  providerOptions: {
    google: {
      safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' }],
    } satisfies GoogleLanguageModelOptions,
  },
});
```

| Option | Notes |
| --- | --- |
| `cachedContent` | `cachedContents/{name}` for explicit caching. |
| `structuredOutputs` | Default `true`. `false` = JSON MIME type only, schema not sent (describe it in the prompt; SDK still validates). |
| `safetySettings` | `{ category, threshold }`. Categories: `HARM_CATEGORY_UNSPECIFIED`, `_HATE_SPEECH`, `_DANGEROUS_CONTENT`, `_HARASSMENT`, `_SEXUALLY_EXPLICIT`, `_CIVIC_INTEGRITY`. Thresholds: `HARM_BLOCK_THRESHOLD_UNSPECIFIED`, `BLOCK_LOW_AND_ABOVE`, `BLOCK_MEDIUM_AND_ABOVE`, `BLOCK_ONLY_HIGH`, `BLOCK_NONE`, `OFF`. |
| `threshold` | Standalone threshold, same values as above. |
| `responseModalities` | `['TEXT']`, `['IMAGE']`, or both. Default text only. |
| `thinkingConfig` | `{ thinkingLevel?, thinkingBudget?, includeThoughts? }` - see Thinking. |
| `imageConfig` | `{ aspectRatio?, imageSize? }`. Ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. Sizes: 1K (default), 2K, 4K. |
| `audioTimestamp` | Timestamps for audio-only files. |
| `mediaResolution` | `MEDIA_RESOLUTION_UNSPECIFIED` / `_LOW` / `_MEDIUM` / `_HIGH`. |
| `labels` | Billing labels. Vertex AI only. |
| `serviceTier` | `'standard'` (default), `'flex'` (~50% cheaper, slower), `'priority'` (low latency, price premium). Actual tier is in `providerMetadata.google.serviceTier`. |
| `retrievalConfig.latLng` | `{ latitude, longitude }` location context for Maps/Search grounding. |

## Thinking

- **Gemini 3 and later:** use `thinkingLevel`: `'minimal' | 'low' | 'medium' | 'high'`. 3.1 Pro: low/medium/high. 3 Pro: low/high. 3 Flash: all four.
- **Gemini 2.5:** use `thinkingBudget` (tokens; `0` disables where supported).
- `includeThoughts: true` returns summaries as `reasoning` in the result.

```ts
providerOptions: {
  google: { thinkingConfig: { thinkingLevel: 'high', includeThoughts: true } } satisfies GoogleLanguageModelOptions,
},
```

## File and video inputs

Send files as `type: 'file'` parts with `mediaType`:

```ts
{ type: 'file', data: fs.readFileSync('./data/ai.pdf'), mediaType: 'application/pdf' }
```

- URLs passed as `data` are downloaded by the SDK, except `https://generativelanguage.googleapis.com/v1beta/files/...` (use the Files API for large files) and YouTube URLs.
- YouTube (public or unlisted): pass the URL as `data` with `mediaType: 'video/mp4'`. One YouTube URL per request.

## Caching

- **Implicit:** automatic. Keep shared prefix content first, variable text last. Minimums: Gemini 3 = 4096 tokens, Gemini 2.5 = 2048. Cached tokens give ~75% discount. Check `providerMetadata.google.usageMetadata.cachedContentTokenCount`.
- **Explicit:** create with `@google/genai` (`ai.caches.create({ model, config: { contents, ttl } })`), then pass `cachedContent: cache.name` in provider options. Supported on 2.5 and 3 series (check the models page).

## Built-in tools

Pass under `tools`. Each is provider-defined:

- **Code execution:** `google.tools.codeExecution({})`. Model writes and runs Python; results appear in `toolCalls` / `toolResults`.
- **Google Search grounding:** `google.tools.googleSearch({})`. Optional `searchTypes: { webSearch: {} , imageSearch: {} }` and `timeRangeFilter: { startTime, endTime }` (ISO 8601, both required). Sources come back in `sources`; grounding details in `providerMetadata.google.groundingMetadata` (`webSearchQueries`, `searchEntryPoint`, `groundingSupports`).
- **URL context:** `google.tools.urlContext({})`. Up to 20 URLs in the prompt. Gemini 2.0 Flash and newer. Status in `providerMetadata.google.urlContextMetadata.urlMetadata`. Can be combined with Google Search.
- **Google Maps:** `google.tools.googleMaps({})`, plus `retrievalConfig.latLng`. Gemini 2.0+. Sources point to Maps URLs.
- **File Search:** `google.tools.fileSearch({ fileSearchStoreNames: [...], metadataFilter?, topK? })`. Gemini 2.5 and 3+. Custom metadata at `groundingMetadata.groundingChunks[].retrievedContext.customMetadata`.
- **Enterprise Web Search and RAG Engine:** Vertex only. Use `@ai-sdk/google-vertex` (`vertex.tools.enterpriseWebSearch({})`, `vertex.tools.vertexRagStore({ ragCorpus, topK })`), not `@ai-sdk/google`.

## Image output

Image-capable models (e.g. `gemini-3.1-flash-image-preview`) return images as `result.files` with `mediaType` `image/*`. For image-only generation, use `generateImage()` with a Gemini image model.

## Safety ratings

Read from `providerMetadata.google.safetyRatings`: `category`, `probability`, `probabilityScore`, `severity`, `severityScore`, and `blocked` when a category blocked output.

## Troubleshooting: schema limits

Error `Request contains an invalid argument.` usually means the JSON schema is too large or too deeply nested for Google.

- Simplify the schema: drop unnecessary constraints, reduce nesting, keep the fields the model must fill.
- Or set `structuredOutputs: false`, describe the schema in the prompt, and let the SDK validate the output.
- For stricter client-side validation than what Google receives, validate the output separately.

## Model capabilities (docs snapshot)

All listed models support image input, tool usage, tool streaming, Google Search, and URL context. Object generation is supported on all except `gemini-nano-banana-2.1` (not supported for tools, objects, or URL context).

Listed IDs: `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-lite-preview`, `gemini-3-pro-preview`, `gemini-3-pro-image-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-flash-lite-preview-06-17`, `gemini-2.0-flash`. Any model ID string the API accepts can be passed. Check https://ai.google.dev/gemini-api/docs/models for the current list.

## Batch (experimental)

Use the AI SDK `experimental_startBatch` with `provider: google`. Each request has `id`, `type: 'text'`, `model`, `prompt`. All text requests in one batch must share the same model. Optional `webhookUrl`; Google sends a thin event, so fetch results afterwards with `getBatchStatus` / `getBatchResults`. Bodies under 20 MB are sent inline; larger ones upload a JSONL file via the Files API.

## Realtime (experimental)

- Model: `google.experimental_realtime('gemini-3.1-flash-live-preview')`.
- Browser sessions need a short-lived token from the server: `google.experimental_realtime.getToken({ model, sessionConfig })`.
- Live translation: `gemini-3.5-live-translate-preview` with `providerOptions.google.translationConfig` (`targetLanguageCode`, `echoTargetLanguage`). Audio in and out only; no text input or tools.
- `gemini-3.8-live` / `gemini-3.8-live-extended-thinking`: audio-only output. Extended thinking needs exactly one of `thinkingLevel` or `thinkingBudget`. Tools default to `NON_BLOCKING`; set `defaultToolBehavior: 'BLOCKING'` on `gemini-3.8-live` to wait.
- Translation (streaming server-side): `google.translation('gemini-3.5-live-translate-preview')` with `experimental_streamTranslate`. Source language is auto-detected; output is 24kHz 16-bit PCM.

## Interactions API (experimental)

`google.interactions(...)` targets the separate `POST /v1beta/interactions` endpoint (server-side state, built-in tools, agent presets, managed agents). Accepts a model ID, `{ agent: name }`, or `{ managedAgent: name }`. Options include `previousInteractionId`, `store` (default `true`), `thinkingLevel`, `thinkingSummaries`, `responseFormat`. Pick either `google(...)` or `google.interactions(...)` per model instance. The pasted docs were cut off here; read the full page for agent presets, managed agents, and `responseFormat` details.
