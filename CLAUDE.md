# AI Prompt Generator — Developer Reference

## What this app does

This is a local Next.js web app that generates optimized text prompts for three AI generation platforms: **Google Nano Banana** (image), **Google Veo** (video), and **Adobe Firefly** (image). The user uploads images, describes their intent, and the app produces a polished prompt they copy-paste into RunwayML, Firefly, or Photoshop. **The app does not generate images or videos itself** — it only writes prompts.

The user accesses these platforms through:
- **RunwayML** — for Veo (video) and Nano Banana (image)
- **Adobe Firefly web app** and **Adobe Photoshop** — for Firefly image generation and Generative Fill/Expand

## How to run it

```bash
cd "/Users/adrianriveraferran/Photo Processing/ai-prompt-generator"
npm run dev
```

Opens at **http://localhost:3000**. Requires an OpenRouter API key in `.env.local`:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Free keys at https://openrouter.ai/keys (no credit card). The app uses free vision-capable models via OpenRouter's OpenAI-compatible API to analyze uploaded images and write prompts.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **OpenRouter API** via the `openai` npm package pointed at `https://openrouter.ai/api/v1`
- **better-sqlite3** for prompt history
- **pdf-parse** for extracting text from brand guideline PDFs
- Dark mode by default, single-user, no auth, local only

## Project structure

```
ai-prompt-generator/
├── app/
│   ├── page.tsx                    # Entire UI — single client component
│   ├── layout.tsx                  # Root layout, dark mode, Geist fonts
│   ├── globals.css                 # Tailwind + CSS custom properties
│   └── api/
│       ├── generate/route.ts       # POST — prompt generation (SSE streaming)
│       ├── brands/route.ts         # GET list / POST create brand
│       ├── history/route.ts        # GET with filters (search, mode, target, brand)
│       └── health/route.ts         # GET — checks if API key is set
├── lib/
│   ├── types.ts                    # Mode, OutputTarget, BrandProfile, HistoryEntry, etc.
│   ├── prompt-builder.ts           # Builds the LLM system prompt from mode + target + rules + brand
│   ├── db.ts                       # SQLite via better-sqlite3 — history CRUD
│   └── brands.ts                   # Filesystem brand profiles — read/write/list under /brands/
├── config/
│   ├── prompt-rules.json           # User-editable prompting rules per platform
│   └── model-preferences.json      # Ordered fallback list of free vision models
├── brands/                         # Persisted brand profiles (one subfolder per brand)
├── data/                           # SQLite DB file (auto-created on first generation)
└── uploads/                        # Reserved for session image storage
```

## Core concepts

### Modes (what the user is trying to do)

| Mode | Key | Output type |
|------|-----|-------------|
| Edit single image | `edit_single` | image |
| Combine images | `combine_images` | image |
| Place product in scene | `place_product` | image |
| Animate from single image | `animate_single` | video |
| Animate first to last frame | `animate_keyframes` | video |

Video modes (`animate_*`) automatically lock the output target to **Veo** only. Image modes show Nano Banana and Firefly.

### Output targets (where the prompt will be pasted)

| Target | Key | Platform the user pastes into |
|--------|-----|-------------------------------|
| Nano Banana | `nano_banana` | RunwayML or Google's tools |
| Veo | `veo` | RunwayML |
| Adobe Firefly | `firefly` | Firefly web app or Photoshop |

### Brand profiles

Saved under `/brands/{slug}/`. Each has a `metadata.json` with name, slug, created_at, and freeform notes. Additional files (PDFs, images, text) sit alongside it. When a brand is selected:
- PDF text is extracted via `pdf-parse` and injected as text context
- Images are base64-encoded and sent to the vision model as additional reference images
- Notes are added to the system prompt as brand guidelines

### Prompt generation flow

1. User selects mode, output target, optional brand, uploads images, writes instruction
2. Frontend POSTs to `/api/generate` with base64-encoded images and settings
3. Backend builds a system prompt via `prompt-builder.ts`:
   - Loads rules from `config/prompt-rules.json` (global + target-specific)
   - Adds mode description, output format spec, and brand context
4. Sends multimodal request to OpenRouter (images labeled as "primary" or "reference")
5. Streams the response via SSE back to the frontend
6. On completion, auto-saves to SQLite history

### Model fallback

If the primary model fails (rate limit, unavailability), the app tries the next model in `config/model-preferences.json` automatically. The fallback chain is:
1. `qwen/qwen2.5-vl-72b-instruct:free` (best quality)
2. `qwen/qwen2.5-vl-32b-instruct:free`
3. `google/gemma-4-31b-it:free`
4. `google/gemma-3-27b-it:free`
5. `meta-llama/llama-3.2-11b-vision-instruct:free` (last resort)

Free models have a limit of ~20 requests/minute and ~200 requests/day on OpenRouter.

## Prompt rules — the critical config

`config/prompt-rules.json` is the brain of the app. It contains platform-specific prompting rules derived from the official guides:

- **Veo**: 7-component structure (Shot + Style + Lighting + Characters + Location + Action + Audio), 100–150 word target, one camera motion max, must include audio cues
- **Nano Banana**: 5-part formula (Subject + Location + Composition + Lighting + Style), 1–2 style rule, material specificity, lens/camera vocabulary, text rendering via quoted strings
- **Firefly**: Comma-separated descriptors, never use artist names (trained on Adobe Stock not artist portfolios), never use "generate/create" command words, supports `NO [element]` negative syntax, emotional tone words as style modifiers

These rules are loaded fresh on every generation — edit the file and the next prompt reflects the changes immediately without restarting.

## Key files to modify

| What you want to change | File |
|--------------------------|------|
| Prompting rules per platform | `config/prompt-rules.json` |
| Model fallback order | `config/model-preferences.json` |
| System prompt structure and mode descriptions | `lib/prompt-builder.ts` |
| Add a new mode or output target | `lib/types.ts` + `lib/prompt-builder.ts` + `app/page.tsx` |
| UI layout and components | `app/page.tsx` (everything is in one file) |
| API endpoint behavior | `app/api/generate/route.ts` |
| Brand file handling | `lib/brands.ts` |
| History storage/queries | `lib/db.ts` |

## Video upload handling

Free OpenRouter vision models accept images but not video. When a user uploads a video to the reference zone, the frontend automatically extracts a single frame (at t=1s) using a canvas element and sends that as an image instead. The UI shows "(frame)" next to the thumbnail so the user knows this happened.

## Important constraints

- No authentication — single-user local app
- No image/video generation — output is text prompts only
- Free models have rate limits — the fallback chain helps but heavy use may hit daily caps
- Brand PDFs are parsed server-side with `pdf-parse` — complex layouts may not extract cleanly
- The entire UI is one client component in `app/page.tsx` — works fine for this scope but would need splitting if it grows significantly
