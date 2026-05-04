# AI Prompt Generator

Generate optimized, production-ready prompts for **Nano Banana** (image), **Veo** (video), and **Adobe Firefly** (image). Upload images, describe your intent, and get polished prompts ready to paste into your tool of choice.

This app analyzes uploaded images using free vision models via OpenRouter and outputs prompts tuned to each platform's strengths. It does NOT generate images or videos — you copy the prompt into Runway, Firefly, etc.

## Setup

### 1. Install dependencies

```bash
cd ai-prompt-generator
npm install
```

### 2. Get a free OpenRouter API key

1. Go to https://openrouter.ai/keys (no credit card needed)
2. Create an account and generate an API key
3. Copy the key

### 3. Configure the API key

Edit `.env.local` in the project root:

```
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

### 4. Start the dev server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Features

- **5 editing modes:** Edit single image, combine images, place product in scene, animate from single image, animate first-to-last frame
- **3 output targets:** Nano Banana, Veo, Adobe Firefly — with auto-filtering (animate modes lock to Veo)
- **Brand profiles:** Save brand guidelines, images, and notes. Brand context is injected into every prompt
- **Drag-and-drop upload:** Primary images and reference images/videos (video frames are auto-extracted)
- **Streaming output:** Prompts stream in real-time as they generate
- **Model fallback:** If the primary model is rate-limited, the app automatically tries the next free model
- **Prompt history:** All generated prompts are saved locally with full search and reload
- **Configurable rules:** Edit `config/prompt-rules.json` to customize prompt engineering rules per target

## Configuration

### Prompt rules (`config/prompt-rules.json`)

Edit this file to add or modify the rules that guide prompt generation for each output target.

### Model preferences (`config/model-preferences.json`)

Change the model priority order or select a different default model. All models are free tier on OpenRouter.

## Project structure

```
ai-prompt-generator/
├── app/
│   ├── api/
│   │   ├── brands/route.ts    # Brand CRUD
│   │   ├── generate/route.ts  # Prompt generation (streaming)
│   │   ├── health/route.ts    # API key check
│   │   └── history/route.ts   # History queries
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               # Main UI
├── brands/                    # Saved brand profiles
├── config/
│   ├── model-preferences.json
│   └── prompt-rules.json
├── data/                      # SQLite database (auto-created)
├── lib/
│   ├── brands.ts              # Brand file operations
│   ├── db.ts                  # SQLite history
│   ├── prompt-builder.ts      # System prompt construction
│   └── types.ts               # Shared types
└── uploads/                   # Session image storage
```
