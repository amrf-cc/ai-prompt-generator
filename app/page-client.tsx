"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import type {
  Mode,
  OutputTarget,
  BrandProfile,
  BrandVoice,
  BrandVisual,
  BrandLegal,
  ProductAsset,
  ProductImage,
  UploadedFile,
  HistoryEntry,
  HistoryStatus,
  MediaModel,
} from "@/lib/types";

interface ClientProductPick {
  productId: string;
  productName: string;
  filename: string;
  label: string;
  description?: string;
  reason: string;
  picked: boolean;
}
import {
  MODES,
  OUTPUT_TARGETS,
  FEEDBACK_TAGS,
  getCharLimit,
} from "@/lib/types";

const IMAGE_MODELS: MediaModel[] = [
  { id: "openrouter/auto", name: "Auto", provider: "OpenRouter", tier: "auto", priceNote: "Best available", supportsImageInput: true, textOutput: true, promptTarget: "nano_banana" },
  { id: "openai/gpt-5-image", name: "GPT-5 Image", provider: "OpenAI", tier: "pro", priceNote: "$10/M", supportsImageInput: true, textOutput: true, promptTarget: "gpt_image" },
  { id: "openai/gpt-5.4-image-2", name: "GPT-5.4 Image 2", provider: "OpenAI", tier: "pro", priceNote: "$8/M in · $15/M out", supportsImageInput: true, textOutput: true, promptTarget: "gpt_image" },
  { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Pro", provider: "Google", tier: "pro", priceNote: "$2/M in · $12/M out", supportsImageInput: true, textOutput: true, promptTarget: "gemini_image" },
  { id: "black-forest-labs/flux.2-max", name: "FLUX.2 Max", provider: "Black Forest Labs", tier: "pro", priceNote: "$0.07/MP", supportsImageInput: false, textOutput: false, promptTarget: "flux2" },
  { id: "black-forest-labs/flux.2-pro", name: "FLUX.2 Pro", provider: "Black Forest Labs", tier: "pro", priceNote: "$0.03/MP", supportsImageInput: false, textOutput: false, promptTarget: "flux2" },
  { id: "google/gemini-2.5-flash-image", name: "Gemini 2.5 Flash", provider: "Google", tier: "budget", priceNote: "$0.30/M", supportsImageInput: true, textOutput: true, promptTarget: "gemini_image" },
  { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash", provider: "Google", tier: "budget", priceNote: "$0.50/M", supportsImageInput: true, textOutput: true, promptTarget: "gemini_image" },
  { id: "openai/gpt-5-image-mini", name: "GPT-5 Mini", provider: "OpenAI", tier: "budget", priceNote: "$2.50/M", supportsImageInput: true, textOutput: true, promptTarget: "gpt_image" },
  { id: "black-forest-labs/flux.2-klein-4b", name: "FLUX.2 Klein", provider: "Black Forest Labs", tier: "budget", priceNote: "$0.014/MP", supportsImageInput: false, textOutput: false, promptTarget: "flux2" },
  { id: "bytedance-seed/seedream-4.5", name: "Seedream 4.5", provider: "ByteDance", tier: "budget", priceNote: "$0.04/img", supportsImageInput: false, textOutput: false, promptTarget: "nano_banana" },
  { id: "sourceful/riverflow-v2-fast", name: "Riverflow V2", provider: "Sourceful", tier: "budget", priceNote: "$0.02–0.04/img", supportsImageInput: false, textOutput: false, promptTarget: "nano_banana" },
];

const VIDEO_MODELS: MediaModel[] = [
  { id: "kwaivgi/kling-v3.0-pro", name: "Kling v3.0 Pro", provider: "Kuaishou", tier: "pro", priceNote: "$0.168/sec", supportsImageInput: true, supportsFirstLastFrame: true, supportsAudio: true, maxDuration: 15, promptTarget: "kling" },
  { id: "google/veo-3.1-fast", name: "Veo 3.1", provider: "Google", tier: "pro", priceNote: "$0.40/sec", supportsImageInput: true, supportsFirstLastFrame: true, supportsAudio: true, maxDuration: 8, promptTarget: "veo" },
  { id: "kwaivgi/kling-video-o1", name: "Kling Video O1", provider: "Kuaishou", tier: "pro", priceNote: "$0.112/sec", supportsImageInput: true, supportsFirstLastFrame: false, supportsAudio: false, maxDuration: 10, promptTarget: "kling" },
  { id: "bytedance/seedance-2.0", name: "Seedance 2.0", provider: "ByteDance", tier: "pro", priceNote: "$7/M tokens", supportsImageInput: true, supportsFirstLastFrame: true, supportsAudio: false, maxDuration: 15, promptTarget: "seedance" },
  { id: "minimax/hailuo-2.3", name: "Hailuo 2.3", provider: "MiniMax", tier: "pro", priceNote: "mid-tier", supportsImageInput: true, supportsFirstLastFrame: false, supportsAudio: false, maxDuration: 10, promptTarget: "veo" },
  { id: "x-ai/grok-imagine-video", name: "Grok Imagine", provider: "xAI", tier: "budget", priceNote: "$0.05/sec", supportsImageInput: true, supportsFirstLastFrame: false, supportsAudio: false, maxDuration: 10, promptTarget: "veo" },
  { id: "kwaivgi/kling-v3.0-std", name: "Kling v3.0 Std", provider: "Kuaishou", tier: "budget", priceNote: "$0.126/sec", supportsImageInput: true, supportsFirstLastFrame: true, supportsAudio: true, maxDuration: 15, promptTarget: "kling" },
  { id: "google/veo-3.1-lite", name: "Veo 3.1 Lite", provider: "Google", tier: "budget", priceNote: "< $0.40/sec", supportsImageInput: true, supportsFirstLastFrame: false, supportsAudio: false, maxDuration: 8, promptTarget: "veo" },
  { id: "bytedance/seedance-2.0-fast", name: "Seedance 2.0 Fast", provider: "ByteDance", tier: "budget", priceNote: "budget", supportsImageInput: true, supportsFirstLastFrame: true, supportsAudio: false, maxDuration: 10, promptTarget: "seedance" },
  { id: "alibaba/wan-2.7", name: "Wan 2.7", provider: "Alibaba", tier: "budget", priceNote: "budget", supportsImageInput: true, supportsFirstLastFrame: false, supportsAudio: false, maxDuration: 10, promptTarget: "veo" },
];

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeProductSearch(value: string) {
  return value.trim().toLowerCase();
}

function getProductCategories(products: ProductAsset[]) {
  const seen = new Map<string, string>();
  for (const product of products) {
    for (const category of product.categories ?? []) {
      const trimmed = category.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

function productMatchesFilters(product: ProductAsset, search: string, category: string) {
  const normalizedSearch = normalizeProductSearch(search);
  const categories = product.categories ?? [];
  const matchesSearch =
    !normalizedSearch ||
    product.name.toLowerCase().includes(normalizedSearch) ||
    categories.some((c) => c.toLowerCase().includes(normalizedSearch));
  const matchesCategory =
    !category || categories.some((c) => c.toLowerCase() === category.toLowerCase());
  return matchesSearch && matchesCategory;
}

function fileToUploadedFile(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({
        id: generateId(),
        name: file.name,
        type: file.type,
        size: file.size,
        preview: dataUrl,
        base64,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Compress an image file using canvas before storing in state.
// Resizes to ≤2048px and re-encodes as JPEG (0.85 quality) when the file is
// larger than 5 MB or its dimensions exceed 2048px — otherwise passes through
// unchanged. This keeps browser memory reasonable for large uploads.
function compressImageFile(file: File): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => {
        // Can't decode as image — store as-is
        resolve({
          id: generateId(),
          name: file.name,
          type: file.type,
          size: file.size,
          preview: dataUrl,
          base64: dataUrl.split(",")[1],
        });
      };
      img.onload = () => {
        const MAX = 2048;
        let { naturalWidth: w, naturalHeight: h } = img;
        const needsResize = w > MAX || h > MAX;
        const needsCompress = file.size > 5 * 1024 * 1024;
        if (!needsResize && !needsCompress) {
          resolve({
            id: generateId(),
            name: file.name,
            type: file.type,
            size: file.size,
            preview: dataUrl,
            base64: dataUrl.split(",")[1],
          });
          return;
        }
        if (needsResize) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const outMime = "image/jpeg";
        const compressedDataUrl = canvas.toDataURL(outMime, 0.85);
        const base64 = compressedDataUrl.split(",")[1];
        resolve({
          id: generateId(),
          name: file.name,
          type: outMime,
          size: Math.floor((base64.length * 3) / 4),
          preview: compressedDataUrl,
          base64,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Setup Screen ────────────────────────────────────────────────

function SetupScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div className="max-w-lg w-full bg-card border border-border rounded-xl p-8">
        <h1 className="text-2xl font-semibold mb-4">OpenRouter API Key Required</h1>
        <p className="text-muted mb-6">
          This app needs an OpenRouter API key to generate prompts.
        </p>

        <ol className="list-decimal list-inside space-y-2 text-sm text-muted">
          <li>Go to <span className="text-accent font-mono">https://openrouter.ai/keys</span> (no credit card needed)</li>
          <li>Create a free account and generate an API key</li>
          <li>Set <span className="font-mono text-accent">OPENROUTER_API_KEY=your_key</span> in <span className="font-mono text-accent">.env.local</span></li>
          <li>Restart the dev server</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Image Upload Zone ───────────────────────────────────────────

function ImageUploadZone({
  label,
  sublabel,
  files,
  onFilesChange,
  accept,
  onPaint,
  onCrop,
  showOrderBadge,
}: {
  label: string;
  sublabel: string;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  accept?: string;
  onPaint?: (file: UploadedFile) => void;
  onCrop?: (file: UploadedFile) => void;
  showOrderBadge?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL-reference fetch state
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlMessage, setUrlMessage] = useState<{
    kind: "info" | "error";
    text: string;
    details?: string[];
  } | null>(null);
  const [showUrlDetails, setShowUrlDetails] = useState(false);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      const newFiles: UploadedFile[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (file.size > 50 * 1024 * 1024) {
          alert(`${file.name} is larger than 50MB and will be skipped.`);
          continue;
        }
        const isVideo = file.type.startsWith("video/");
        if (isVideo) {
          const frame = await extractVideoFrame(file);
          if (frame) newFiles.push(frame);
        } else {
          newFiles.push(await compressImageFile(file));
        }
      }
      onFilesChange([...files, ...newFiles]);
    },
    [files, onFilesChange]
  );

  const handleAddUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url || urlLoading) return;
    setUrlLoading(true);
    setUrlMessage(null);
    setShowUrlDetails(false);
    try {
      const res = await fetch("/api/references/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUrlMessage({
          kind: "error",
          text: data.error ?? "Failed to fetch URL",
          details: Array.isArray(data.errors) ? data.errors : undefined,
        });
        return;
      }
      type FetchedImage = {
        base64: string;
        mimeType: string;
        sourceUrl: string;
        imageUrl: string;
      };
      const images: FetchedImage[] = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) {
        setUrlMessage({ kind: "error", text: "No images returned from URL" });
        return;
      }
      const newFiles: UploadedFile[] = images.map((img) => {
        const dataUrl = `data:${img.mimeType};base64,${img.base64}`;
        let basename = "image.jpg";
        try {
          const u = new URL(img.imageUrl);
          const last = u.pathname.split("/").filter(Boolean).pop();
          basename = (last ?? u.host).replace(/\?.*$/, "") || u.host;
        } catch {
          // fall back to default
        }
        if (basename.length > 40) basename = basename.slice(0, 40);
        return {
          id: generateId(),
          name: basename,
          type: img.mimeType,
          size: Math.floor((img.base64.length * 3) / 4),
          preview: dataUrl,
          base64: img.base64,
          sourceUrl: img.sourceUrl,
        };
      });
      onFilesChange([...files, ...newFiles]);
      let host = "the URL";
      try {
        host = new URL(data.sourceUrl).host;
      } catch {
        // fall back to default
      }
      const partial =
        data.partial === true && Array.isArray(data.errors) && data.errors.length > 0;
      setUrlMessage({
        kind: "info",
        text: partial
          ? `Fetched ${images.length} image${images.length === 1 ? "" : "s"} from ${host} (some skipped)`
          : `Fetched ${images.length} image${images.length === 1 ? "" : "s"} from ${host}`,
        details: partial ? data.errors : undefined,
      });
      setUrlInput("");
    } catch (e) {
      setUrlMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, urlLoading, files, onFilesChange]);

  const removeFile = (id: string) => {
    onFilesChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="flex-1 min-w-0">
      <label className="text-sm font-medium text-foreground block mb-2">
        {label}
      </label>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors min-h-[120px] flex flex-col items-center justify-center ${
          dragOver
            ? "border-accent bg-accent/10"
            : "border-border hover:border-border-hover"
        }`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept || "image/*"}
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <svg
          className="w-8 h-8 text-muted mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
          />
        </svg>
        <p className="text-sm text-muted">{sublabel}</p>
        <p className="text-xs text-muted mt-1">
          Drag & drop or click to browse
        </p>
      </div>

      {/* URL-reference input — fetch images from a pasted link */}
      <div className="mt-2 flex gap-2">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="…or paste a reference link (Pinterest, image URL, web page)"
          className="flex-1 min-w-0 bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleAddUrl();
            }
          }}
          disabled={urlLoading}
        />
        <button
          type="button"
          onClick={() => void handleAddUrl()}
          disabled={!urlInput.trim() || urlLoading}
          className="px-3 py-2 text-xs rounded-lg border border-border hover:bg-card-hover disabled:opacity-50 whitespace-nowrap"
        >
          {urlLoading ? "Fetching…" : "Add URL"}
        </button>
      </div>
      {urlMessage && (
        <div
          className={`mt-1.5 text-[11px] ${
            urlMessage.kind === "error" ? "text-danger" : "text-muted"
          }`}
        >
          <span>{urlMessage.text}</span>
          {urlMessage.details && urlMessage.details.length > 0 && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setShowUrlDetails((v) => !v)}
                className="underline hover:text-foreground"
              >
                {showUrlDetails ? "hide details" : "details"}
              </button>
              {showUrlDetails && (
                <ul className="mt-1 list-disc pl-4 break-all">
                  {urlMessage.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {files.map((f, idx) => {
            const isImage = f.type.startsWith("image/");
            const hasPaint = Boolean(f.paintData);
            const isDragging = draggedIndex === idx;
            const isDropTarget =
              dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;
            return (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => {
                  setDraggedIndex(idx);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(idx));
                }}
                onDragOver={(e) => {
                  if (draggedIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverIndex !== idx) setDragOverIndex(idx);
                }}
                onDragLeave={() => {
                  if (dragOverIndex === idx) setDragOverIndex(null);
                }}
                onDrop={(e) => {
                  if (draggedIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (draggedIndex !== idx) {
                    const next = [...files];
                    const [moved] = next.splice(draggedIndex, 1);
                    next.splice(idx, 0, moved);
                    onFilesChange(next);
                  }
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                className={`relative group cursor-grab active:cursor-grabbing transition-opacity ${
                  isDragging ? "opacity-40" : ""
                } ${isDropTarget ? "ring-2 ring-accent rounded-md" : ""}`}
              >
                <img
                  src={f.preview}
                  alt={f.name}
                  draggable={false}
                  className={`w-16 h-16 object-cover rounded-md border ${
                    hasPaint ? "border-fuchsia-500" : "border-border"
                  }`}
                />
                {showOrderBadge && (
                  <span
                    className="absolute top-0.5 left-0.5 min-w-[18px] h-[18px] px-1 bg-accent text-white text-[10px] font-semibold rounded-full flex items-center justify-center pointer-events-none"
                    aria-label={`Order ${idx + 1}`}
                  >
                    {idx + 1}
                  </span>
                )}
                {f.sourceUrl && (
                  <span
                    className="absolute top-0.5 right-0.5 w-[18px] h-[18px] bg-black/65 text-white rounded-full flex items-center justify-center pointer-events-none"
                    title={`From ${f.sourceUrl}`}
                    aria-label={`Fetched from ${f.sourceUrl}`}
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 015.656 0 4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656m-1.656 1.656a4 4 0 01-5.656 0 4 4 0 010-5.656l3-3a4 4 0 015.656 5.656" />
                    </svg>
                  </span>
                )}
                {onPaint && isImage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPaint(f);
                    }}
                    title={hasPaint ? "Edit highlights" : "Paint highlights"}
                    className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center transition-opacity ${
                      hasPaint
                        ? "bg-fuchsia-600 opacity-100"
                        : "bg-fuchsia-600 sm:opacity-0 sm:group-hover:opacity-100"
                    }`}
                  >
                    {hasPaint ? "✎" : "+"}
                  </button>
                )}
                {onCrop && isImage && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCrop(f);
                    }}
                    title="Crop image"
                    className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-600 text-white text-[10px] flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 2v14h14M18 22V8H4" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(f.id);
                  }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full text-white text-xs flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
                <p className="text-[10px] text-muted truncate w-16 mt-0.5">
                  {f.name}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const MAX_FRAME_DIM = 1536;

async function extractVideoFrame(file: File): Promise<UploadedFile | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.src = url;
    video.muted = true;
    video.currentTime = 1;

    video.onloadeddata = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // Compress: scale down to MAX_FRAME_DIM on the longest side
      let cw = vw;
      let ch = vh;
      if (vw > MAX_FRAME_DIM || vh > MAX_FRAME_DIM) {
        const scale = MAX_FRAME_DIM / Math.max(vw, vh);
        cw = Math.round(vw * scale);
        ch = Math.round(vh * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, cw, ch);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
      const base64 = dataUrl.split(",")[1];
      URL.revokeObjectURL(url);
      resolve({
        id: generateId(),
        name: `${file.name} (frame)`,
        type: "image/jpeg",
        size: file.size,
        preview: dataUrl,
        base64,
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
  });
}

// ─── Paint Editor ────────────────────────────────────────────────

function PaintEditor({
  file,
  onClose,
  onSave,
}: {
  file: UploadedFile;
  onClose: () => void;
  onSave: (updated: UploadedFile) => void;
}) {
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [brushSize, setBrushSize] = useState(28);
  const [color, setColor] = useState("#e6007a");
  const [drawing, setDrawing] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [paintTool, setPaintTool] = useState<"brush" | "lasso">("brush");
  const lassoPointsRef = useRef<{ x: number; y: number }[]>([]);
  const lassoSnapshotRef = useRef<ImageData | null>(null);

  // Cursor overlay state
  const [cursorPos, setCursorPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [displayScale, setDisplayScale] = useState(1);

  // Undo stack
  const undoStackRef = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const sourceDataUrl = file.originalBase64
    ? `data:${file.type};base64,${file.originalBase64}`
    : file.preview;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = sourceDataUrl;
  }, [sourceDataUrl]);

  useEffect(() => {
    if (!imgSize || !paintCanvasRef.current) return;
    const canvas = paintCanvasRef.current;
    canvas.width = imgSize.w;
    canvas.height = imgSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (file.paintData) {
      const paintImg = new Image();
      paintImg.onload = () => ctx.drawImage(paintImg, 0, 0);
      paintImg.src = file.paintData;
    }
  }, [imgSize, file.paintData]);

  // Cmd+Z keyboard shortcut for undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const updateCursor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDisplayScale(rect.width / canvas.width);
  };

  const saveUndoState = () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    undoStackRef.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height)
    );
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    setUndoCount(undoStackRef.current.length);
  };

  const handleUndo = () => {
    const canvas = paintCanvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const lastState = undoStackRef.current.pop()!;
    ctx.putImageData(lastState, 0, 0);
    setUndoCount(undoStackRef.current.length);
  };

  const drawTo = (point: { x: number; y: number }) => {
    const ctx = paintCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalAlpha = 0.55;
    const last = lastPointRef.current ?? point;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handleClear = () => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    saveUndoState();
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    if (!baseImageRef.current || !paintCanvasRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = baseImageRef.current.naturalWidth;
    canvas.height = baseImageRef.current.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(baseImageRef.current, 0, 0);
    ctx.drawImage(paintCanvasRef.current, 0, 0);
    const compositeDataUrl = canvas.toDataURL("image/png");
    const compositeBase64 = compositeDataUrl.split(",")[1];
    const paintDataUrl = paintCanvasRef.current.toDataURL("image/png");

    const originalBase64 = file.originalBase64 ?? file.base64;

    onSave({
      ...file,
      type: "image/png",
      preview: compositeDataUrl,
      base64: compositeBase64,
      originalBase64,
      paintData: paintDataUrl,
    });
  };

  const handleClearAndSave = () => {
    if (!file.originalBase64) {
      onSave(file);
      return;
    }
    const dataUrl = `data:${file.type};base64,${file.originalBase64}`;
    onSave({
      ...file,
      preview: dataUrl,
      base64: file.originalBase64,
      originalBase64: undefined,
      paintData: undefined,
    });
  };

  const cursorDiameter = brushSize * displayScale;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Highlight areas</h2>
            <p className="text-xs text-muted">
              Paint over the parts of the image you want the AI to focus on.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-4 px-4 py-3 border-b border-border flex-wrap">
          <label className="text-xs flex items-center gap-2">
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 bg-transparent border border-border rounded cursor-pointer"
            />
          </label>
          <div className="flex items-center gap-1 bg-background p-1 rounded-lg border border-border">
            <button
              onClick={() => setPaintTool("brush")}
              className={`px-3 py-1 text-xs rounded-md ${
                paintTool === "brush" ? "bg-accent text-white" : "hover:bg-card-hover"
              }`}
            >
              Brush
            </button>
            <button
              onClick={() => setPaintTool("lasso")}
              className={`px-3 py-1 text-xs rounded-md ${
                paintTool === "lasso" ? "bg-accent text-white" : "hover:bg-card-hover"
              }`}
            >
              Lasso
            </button>
          </div>
          <label className="text-xs flex items-center gap-2 flex-1 min-w-[160px]">
            Size
            <input
              type="range"
              min={4}
              max={120}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono w-8 text-right">{brushSize}</span>
          </label>
          <button
            onClick={handleUndo}
            disabled={undoCount === 0}
            className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo last stroke (Cmd+Z)"
          >
            Undo
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover"
          >
            Clear
          </button>
          <button
            onClick={handleClearAndSave}
            disabled={!file.paintData && !file.originalBase64}
            className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
            title="Remove all highlights and revert to the original image"
          >
            Remove highlights
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-background">
          <div className="relative inline-block max-w-full max-h-[70vh]">
            <img
              src={sourceDataUrl}
              alt={file.name}
              className="block max-w-full max-h-[70vh] select-none pointer-events-none"
              draggable={false}
            />
            <canvas
              ref={paintCanvasRef}
              className="absolute inset-0 w-full h-full touch-none"
              style={{ cursor: paintTool === "brush" ? "none" : "crosshair" }}
              onPointerDown={(e) => {
                (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                saveUndoState();
                setDrawing(true);
                const p = getCanvasPoint(e);
                
                if (paintTool === "brush") {
                  lastPointRef.current = p;
                  drawTo(p);
                } else if (paintTool === "lasso") {
                  lassoPointsRef.current = [p];
                  const canvas = paintCanvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (canvas && ctx) {
                    lassoSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  }
                }
                updateCursor(e);
              }}
              onPointerMove={(e) => {
                updateCursor(e);
                if (!drawing) return;
                const p = getCanvasPoint(e);
                
                if (paintTool === "brush") {
                  drawTo(p);
                } else if (paintTool === "lasso") {
                  lassoPointsRef.current.push(p);
                  const canvas = paintCanvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (canvas && ctx && lassoSnapshotRef.current) {
                    ctx.putImageData(lassoSnapshotRef.current, 0, 0);
                    ctx.beginPath();
                    ctx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);
                    for (let i = 1; i < lassoPointsRef.current.length; i++) {
                      ctx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y);
                    }
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = 0.8;
                    ctx.stroke();
                  }
                }
              }}
              onPointerUp={(e) => {
                (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
                setDrawing(false);
                lastPointRef.current = null;
                
                if (paintTool === "lasso" && lassoPointsRef.current.length > 2) {
                  const canvas = paintCanvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (canvas && ctx && lassoSnapshotRef.current) {
                    ctx.putImageData(lassoSnapshotRef.current, 0, 0);
                    ctx.beginPath();
                    ctx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y);
                    for (let i = 1; i < lassoPointsRef.current.length; i++) {
                      ctx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.55;
                    ctx.fill();
                  }
                }
                if (paintTool === "lasso") {
                  lassoPointsRef.current = [];
                  lassoSnapshotRef.current = null;
                }
              }}
              onPointerLeave={() => {
                setDrawing(false);
                lastPointRef.current = null;
                setCursorPos(null);
                if (paintTool === "lasso" && lassoSnapshotRef.current) {
                  const canvas = paintCanvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (ctx) ctx.putImageData(lassoSnapshotRef.current, 0, 0);
                  lassoPointsRef.current = [];
                  lassoSnapshotRef.current = null;
                }
              }}
            />
            {/* Custom brush cursor */}
            {cursorPos && paintTool === "brush" && (
              <div
                className="absolute rounded-full border-2 border-white/80 pointer-events-none"
                style={{
                  width: cursorDiameter,
                  height: cursorDiameter,
                  left: cursorPos.x - cursorDiameter / 2,
                  top: cursorPos.y - cursorDiameter / 2,
                  backgroundColor: `${color}33`,
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
                }}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white"
          >
            Save highlights
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Crop Editor ────────────────────────────────────────────────

function CropEditor({
  file,
  onClose,
  onSave,
}: {
  file: UploadedFile;
  onClose: () => void;
  onSave: (updated: UploadedFile) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imgNat, setImgNat] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragRef = useRef<{
    type: "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";
    startX: number;
    startY: number;
    startCrop: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const sourceDataUrl = file.originalBase64
    ? `data:${file.type};base64,${file.originalBase64}`
    : file.preview;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgNat({ w: img.naturalWidth, h: img.naturalHeight });
      setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = sourceDataUrl;
  }, [sourceDataUrl]);

  const getScale = () => {
    if (!containerRef.current || !imgNat) return 1;
    const rect = containerRef.current.getBoundingClientRect();
    return Math.min(rect.width / imgNat.w, rect.height / imgNat.h, 1);
  };

  const getOffset = () => {
    if (!containerRef.current || !imgNat) return { ox: 0, oy: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = getScale();
    return {
      ox: (rect.width - imgNat.w * s) / 2,
      oy: (rect.height - imgNat.h * s) / 2,
    };
  };

  const toNat = (clientX: number, clientY: number) => {
    if (!containerRef.current || !imgNat) return { nx: 0, ny: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const s = getScale();
    const { ox, oy } = getOffset();
    return {
      nx: (clientX - rect.left - ox) / s,
      ny: (clientY - rect.top - oy) / s,
    };
  };

  const clampCrop = (c: { x: number; y: number; w: number; h: number }) => {
    if (!imgNat) return c;
    const MIN = 16;
    let { x, y, w, h } = c;
    w = Math.max(MIN, Math.min(w, imgNat.w));
    h = Math.max(MIN, Math.min(h, imgNat.h));
    x = Math.max(0, Math.min(x, imgNat.w - w));
    y = Math.max(0, Math.min(y, imgNat.h - h));
    return { x, y, w, h };
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    type: NonNullable<typeof dragRef.current>["type"]
  ) => {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !crop || !imgNat) return;
    const { type, startX, startY, startCrop } = dragRef.current;
    const s = getScale();
    const dx = (e.clientX - startX) / s;
    const dy = (e.clientY - startY) / s;
    let next = { ...startCrop };

    if (type === "move") {
      next.x = startCrop.x + dx;
      next.y = startCrop.y + dy;
    } else {
      if (type.includes("w")) { next.x = startCrop.x + dx; next.w = startCrop.w - dx; }
      if (type.includes("e")) { next.w = startCrop.w + dx; }
      if (type.includes("n")) { next.y = startCrop.y + dy; next.h = startCrop.h - dy; }
      if (type.includes("s")) { next.h = startCrop.h + dy; }
    }
    setCrop(clampCrop(next));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleSave = () => {
    if (!imgRef.current || !crop) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w);
    canvas.height = Math.round(crop.h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      imgRef.current,
      Math.round(crop.x), Math.round(crop.y),
      Math.round(crop.w), Math.round(crop.h),
      0, 0,
      Math.round(crop.w), Math.round(crop.h)
    );
    const mimeType = file.type.startsWith("image/png") ? "image/png" : "image/jpeg";
    const quality = mimeType === "image/jpeg" ? 0.92 : undefined;
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const base64 = dataUrl.split(",")[1];
    const originalBase64 = file.originalBase64 ?? file.base64;
    onSave({
      ...file,
      type: mimeType,
      preview: dataUrl,
      base64,
      originalBase64,
    });
  };

  const handleReset = () => {
    if (!file.originalBase64) return;
    const dataUrl = `data:${file.type};base64,${file.originalBase64}`;
    onSave({
      ...file,
      preview: dataUrl,
      base64: file.originalBase64,
      originalBase64: undefined,
      paintData: undefined,
    });
  };

  const s = getScale();
  const { ox, oy } = getOffset();
  const handleSize = 10;

  const corners: { type: NonNullable<typeof dragRef.current>["type"]; cursor: string; cx: number; cy: number }[] =
    crop && imgNat
      ? [
          { type: "nw", cursor: "nwse-resize", cx: crop.x, cy: crop.y },
          { type: "ne", cursor: "nesw-resize", cx: crop.x + crop.w, cy: crop.y },
          { type: "sw", cursor: "nesw-resize", cx: crop.x, cy: crop.y + crop.h },
          { type: "se", cursor: "nwse-resize", cx: crop.x + crop.w, cy: crop.y + crop.h },
          { type: "n", cursor: "ns-resize", cx: crop.x + crop.w / 2, cy: crop.y },
          { type: "s", cursor: "ns-resize", cx: crop.x + crop.w / 2, cy: crop.y + crop.h },
          { type: "w", cursor: "ew-resize", cx: crop.x, cy: crop.y + crop.h / 2 },
          { type: "e", cursor: "ew-resize", cx: crop.x + crop.w, cy: crop.y + crop.h / 2 },
        ]
      : [];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Crop image</h2>
            <p className="text-xs text-muted">
              Drag the handles to adjust the crop area.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          ref={containerRef}
          className="flex-1 overflow-hidden p-4 flex items-center justify-center bg-background relative select-none"
          style={{ minHeight: 300 }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {imgNat && crop && (
            <div className="relative" style={{ width: imgNat.w * s, height: imgNat.h * s }}>
              <img
                src={sourceDataUrl}
                alt={file.name}
                draggable={false}
                className="block w-full h-full pointer-events-none"
              />
              {/* Dark overlay outside crop */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${imgNat.w} ${imgNat.h}`}>
                <defs>
                  <mask id="crop-mask">
                    <rect width={imgNat.w} height={imgNat.h} fill="white" />
                    <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="black" />
                  </mask>
                </defs>
                <rect width={imgNat.w} height={imgNat.h} fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
              </svg>
              {/* Crop border */}
              <div
                className="absolute border-2 border-white/90 cursor-move"
                style={{
                  left: crop.x * s,
                  top: crop.y * s,
                  width: crop.w * s,
                  height: crop.h * s,
                }}
                onPointerDown={(e) => handlePointerDown(e, "move")}
              >
                {/* Rule of thirds grid */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
                </div>
              </div>
              {/* Resize handles */}
              {corners.map(({ type, cursor, cx, cy }) => (
                <div
                  key={type}
                  className="absolute bg-white border border-gray-400 rounded-sm"
                  style={{
                    width: handleSize,
                    height: handleSize,
                    left: cx * s - handleSize / 2,
                    top: cy * s - handleSize / 2,
                    cursor,
                  }}
                  onPointerDown={(e) => handlePointerDown(e, type)}
                />
              ))}
              {/* Crop dimensions */}
              <div
                className="absolute text-[10px] text-white/80 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none"
                style={{
                  left: crop.x * s,
                  top: (crop.y + crop.h) * s + 4,
                }}
              >
                {Math.round(crop.w)} × {Math.round(crop.h)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={handleReset}
            disabled={!file.originalBase64}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset to original
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-card-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white"
            >
              Apply crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Brand Modal ─────────────────────────────────────────────────

const EMPTY_VOICE: BrandVoice = { tone_keywords: [], description: "", dos: [], donts: [] };
const EMPTY_VISUAL: BrandVisual = { color_palette: [], typography_notes: "", photography_style: "", composition_rules: "" };
const EMPTY_LEGAL: BrandLegal = { banned_words: [], claims_to_avoid: [], required_disclaimers: [] };

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-background border border-border rounded-lg min-h-[2.5rem]">
      {values.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-card border border-border"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-muted hover:text-danger"
            aria-label="remove"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder ?? "type and press Enter"}
        className="flex-1 min-w-[6rem] bg-transparent text-xs focus:outline-none"
      />
    </div>
  );
}

function ColorChipInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    let v = draft.trim();
    if (!v) return;
    if (!v.startsWith("#")) v = `#${v}`;
    if (!/^#[0-9A-Fa-f]{3,8}$/.test(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v.toUpperCase()]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-background border border-border rounded-lg min-h-[2.5rem]">
      {values.map((v, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded-md bg-card border border-border font-mono"
        >
          <span
            className="inline-block w-3 h-3 rounded-sm border border-border"
            style={{ backgroundColor: v }}
          />
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-muted hover:text-danger"
            aria-label="remove"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder="#1A1A1A"
        className="flex-1 min-w-[6rem] bg-transparent text-xs font-mono focus:outline-none"
      />
    </div>
  );
}

function ListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={v}
            onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-muted hover:text-danger text-xs px-1"
            aria-label="remove"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ""])}
        className="text-xs text-muted hover:text-foreground"
      >
        + add {placeholder ?? "item"}
      </button>
    </div>
  );
}

function BrandSectionCard({
  title,
  loading,
  onRegenerate,
  canRegenerate,
  children,
}: {
  title: string;
  loading: boolean;
  onRegenerate: () => void;
  canRegenerate: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg p-4 bg-background/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={loading || !canRegenerate}
          className="text-xs px-2 py-1 rounded-md border border-border hover:bg-card-hover disabled:opacity-50"
          title={canRegenerate ? "Re-run AI extraction for this section" : "Upload a PDF or style reference first"}
        >
          {loading ? "Running…" : "Regenerate"}
        </button>
      </div>
      {children}
    </div>
  );
}

function BrandModal({
  onClose,
  onSaved,
  existingBrand,
}: {
  onClose: () => void;
  onSaved: (brand: BrandProfile) => void;
  existingBrand?: BrandProfile;
}) {
  const isEdit = Boolean(existingBrand);
  const [name, setName] = useState(existingBrand?.name ?? "");
  const [notes, setNotes] = useState(existingBrand?.notes ?? "");
  const [showNotes, setShowNotes] = useState(Boolean(existingBrand?.notes));
  const [brand, setBrand] = useState<BrandProfile | null>(existingBrand ?? null);
  const [files, setFiles] = useState<string[]>(existingBrand?.files ?? []);
  const [styleFiles, setStyleFiles] = useState<string[]>(existingBrand?.style_files ?? []);
  const [styleUrls, setStyleUrls] = useState(existingBrand?.style_urls ?? []);

  const [voice, setVoice] = useState<BrandVoice>(existingBrand?.voice ?? EMPTY_VOICE);
  const [visual, setVisual] = useState<BrandVisual>(existingBrand?.visual ?? EMPTY_VISUAL);
  const [legal, setLegal] = useState<BrandLegal>(existingBrand?.legal ?? EMPTY_LEGAL);
  const hasAutofilled = useRef(Boolean(existingBrand?.voice || existingBrand?.visual || existingBrand?.legal));

  const [extractingAll, setExtractingAll] = useState(false);
  const [extractingField, setExtractingField] = useState<{ voice: boolean; visual: boolean; legal: boolean }>({ voice: false, visual: false, legal: false });
  const [draftSaving, setDraftSaving] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlIngesting, setUrlIngesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const guidelinesInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const canExtract = (b?: BrandProfile | null) => {
    const target = b ?? brand;
    if (!target) return false;
    const hasPdf = (target.files ?? []).some((f) => /\.(pdf|txt|md)$/i.test(f));
    const hasStyle = (target.style_files ?? []).length > 0;
    return hasPdf || hasStyle;
  };

  const ensureBrand = async (): Promise<BrandProfile> => {
    if (brand) return brand;
    if (!name.trim()) throw new Error("Enter a brand name first");
    setDraftSaving(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      const res = await fetch("/api/brands", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const created = (await res.json()) as BrandProfile;
      setBrand(created);
      setFiles(created.files ?? []);
      setStyleFiles(created.style_files ?? []);
      setStyleUrls(created.style_urls ?? []);
      return created;
    } finally {
      setDraftSaving(false);
    }
  };

  const runExtractAll = async (slug: string) => {
    setExtractingAll(true);
    setExtractingField({ voice: true, visual: true, legal: true });
    setStatusMsg("Running AI autofill…");
    try {
      const res = await fetch(`/api/brands/${slug}/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extract failed");
      if (data.voice) setVoice({ ...EMPTY_VOICE, ...data.voice });
      if (data.visual) setVisual({ ...EMPTY_VISUAL, ...data.visual });
      if (data.legal) setLegal({ ...EMPTY_LEGAL, ...data.legal });
      hasAutofilled.current = true;
      setStatusMsg("Autofill complete — review and edit before saving.");
    } catch (err) {
      setStatusMsg(`Autofill failed: ${(err as Error).message}`);
    } finally {
      setExtractingAll(false);
      setExtractingField({ voice: false, visual: false, legal: false });
    }
  };

  const runExtractField = async (field: "voice" | "visual" | "legal") => {
    let target = brand;
    if (!target) target = await ensureBrand();
    if (!canExtract(target)) {
      setStatusMsg("Add a brand-guidelines PDF or at least one style reference before regenerating.");
      return;
    }
    setExtractingField((p) => ({ ...p, [field]: true }));
    try {
      const res = await fetch(`/api/brands/${target.slug}/extract/${field}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extract failed");
      if (field === "voice" && data.voice) setVoice({ ...EMPTY_VOICE, ...data.voice });
      if (field === "visual" && data.visual) setVisual({ ...EMPTY_VISUAL, ...data.visual });
      if (field === "legal" && data.legal) setLegal({ ...EMPTY_LEGAL, ...data.legal });
    } catch (err) {
      setStatusMsg(`Regenerate failed: ${(err as Error).message}`);
    } finally {
      setExtractingField((p) => ({ ...p, [field]: false }));
    }
  };

  const maybeAutoExtract = (b: BrandProfile) => {
    if (hasAutofilled.current) return;
    if (!canExtract(b)) return;
    void runExtractAll(b.slug);
  };

  const handleGuidelinesUpload = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    if (!name.trim()) {
      setStatusMsg("Enter a brand name first.");
      return;
    }
    const b = await ensureBrand();
    const fd = new FormData();
    fd.set("name", b.name);
    for (const f of newFiles) fd.append("files", f);
    setDraftSaving(true);
    try {
      const res = await fetch("/api/brands", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as BrandProfile;
      setBrand(updated);
      setFiles(updated.files ?? []);
      maybeAutoExtract(updated);
    } catch (err) {
      setStatusMsg(`Upload failed: ${(err as Error).message}`);
    } finally {
      setDraftSaving(false);
    }
  };

  const handleStyleUpload = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    if (!name.trim()) {
      setStatusMsg("Enter a brand name first.");
      return;
    }
    const b = await ensureBrand();
    const fd = new FormData();
    for (const f of newFiles) fd.append("files", f);
    setDraftSaving(true);
    try {
      const res = await fetch(`/api/brands/${b.slug}/style`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (data.brand) {
        setBrand(data.brand);
        setStyleFiles(data.brand.style_files ?? []);
        maybeAutoExtract(data.brand);
      }
      if (data.errors?.length) {
        setStatusMsg(`Some images skipped: ${data.errors.slice(0, 2).join("; ")}`);
      }
    } catch (err) {
      setStatusMsg(`Upload failed: ${(err as Error).message}`);
    } finally {
      setDraftSaving(false);
    }
  };

  const handleAddUrl = async () => {
    const u = urlInput.trim();
    if (!u) return;
    if (!name.trim()) {
      setStatusMsg("Enter a brand name first.");
      return;
    }
    const b = await ensureBrand();
    setUrlIngesting(true);
    try {
      const res = await fetch(`/api/brands/${b.slug}/style/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg(`URL failed: ${data.error ?? "could not ingest"}`);
        return;
      }
      if (data.brand) {
        setBrand(data.brand);
        setStyleFiles(data.brand.style_files ?? []);
        setStyleUrls(data.brand.style_urls ?? []);
        setUrlInput("");
        if (data.partial) {
          setStatusMsg(`Cached ${data.saved_files.length} images, some failed.`);
        } else {
          setStatusMsg(`Cached ${data.saved_files.length} images from URL.`);
        }
        maybeAutoExtract(data.brand);
      }
    } finally {
      setUrlIngesting(false);
    }
  };

  const removeFile = async (filename: string, kind: "guideline" | "style") => {
    if (!brand) return;
    const path = kind === "style"
      ? `/api/brands/${brand.slug}/style?file=${encodeURIComponent(filename)}`
      : `/api/brands/${brand.slug}?file=${encodeURIComponent(filename)}`;
    const res = await fetch(path, { method: "DELETE" });
    if (!res.ok) {
      setStatusMsg("Could not delete file.");
      return;
    }
    const updated = (await res.json()) as BrandProfile;
    setBrand(updated);
    setFiles(updated.files ?? []);
    setStyleFiles(updated.style_files ?? []);
    setStyleUrls(updated.style_urls ?? []);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSavingMeta(true);
    try {
      const b = brand ?? (await ensureBrand());
      const cleanedVoice = sanitizeVoice(voice);
      const cleanedVisual = sanitizeVisual(visual);
      const cleanedLegal = sanitizeLegal(legal);
      const res = await fetch(`/api/brands/${b.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          voice: cleanedVoice,
          visual: cleanedVisual,
          legal: cleanedLegal,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const final = (await res.json()) as BrandProfile;
      onSaved(final);
    } catch (err) {
      setStatusMsg(`Save failed: ${(err as Error).message}`);
    } finally {
      setSavingMeta(false);
    }
  };

  const slug = brand?.slug;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{isEdit ? `Edit ${existingBrand?.name}` : "Add New Brand"}</h2>
            {(draftSaving || statusMsg) && (
              <p className="text-xs text-muted mt-1">{draftSaving ? "Saving draft…" : statusMsg}</p>
            )}
          </div>
          {slug && <span className="text-xs text-muted font-mono">{slug}</span>}
        </div>

        <div className="space-y-5">
          {!isEdit && (
            <div>
              <label className="text-sm font-medium block mb-1">Brand Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rodowita"
                disabled={Boolean(brand)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-70"
              />
              {brand && (
                <p className="text-xs text-muted mt-1">Name locked once the brand is created — uploads and extracts go to <span className="font-mono">{slug}</span>.</p>
              )}
            </div>
          )}

          {/* Brand guidelines documents */}
          <div>
            <label className="text-sm font-medium block mb-1">Brand-guidelines documents</label>
            <p className="text-xs text-muted mb-2">PDF or text files describing the brand. Their content is used by AI autofill and during prompt generation.</p>
            <input
              ref={guidelinesInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.json"
              className="hidden"
              onChange={(e) => {
                const list = e.target.files ? Array.from(e.target.files) : [];
                e.target.value = "";
                void handleGuidelinesUpload(list);
              }}
            />
            <button
              type="button"
              onClick={() => guidelinesInputRef.current?.click()}
              className="w-full border border-dashed border-border rounded-lg px-3 py-3 text-sm text-muted hover:border-border-hover transition-colors"
            >
              Click to upload PDF / text files
            </button>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f) => (
                  <div key={f} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1">
                    <span className="truncate">{f}</span>
                    <button type="button" onClick={() => removeFile(f, "guideline")} className="text-danger ml-2 shrink-0">remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Style references */}
          <div>
            <label className="text-sm font-medium block mb-1">Style references</label>
            <p className="text-xs text-muted mb-2">Moodboard images and inspiration URLs (Pinterest pins/boards work). Images are auto-compressed.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <input
                  ref={styleInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const list = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    void handleStyleUpload(list);
                  }}
                />
                <button
                  type="button"
                  onClick={() => styleInputRef.current?.click()}
                  className="w-full border border-dashed border-border rounded-lg px-3 py-3 text-sm text-muted hover:border-border-hover transition-colors"
                >
                  Upload images
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.pinterest.com/…"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void handleAddUrl(); }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleAddUrl()}
                  disabled={!urlInput.trim() || urlIngesting}
                  className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-card-hover disabled:opacity-50"
                >
                  {urlIngesting ? "Fetching…" : "Add URL"}
                </button>
              </div>
            </div>

            {styleFiles.length > 0 && slug && (
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
                {styleFiles.map((f) => (
                  <div key={f} className="relative group">
                    <img
                      src={`/api/brand-asset?slug=${encodeURIComponent(slug)}&kind=style&file=${encodeURIComponent(f)}`}
                      alt={f}
                      className="w-full h-20 object-cover rounded-md border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(f, "style")}
                      className="absolute top-1 right-1 bg-black/60 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {styleUrls.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                Cached from {styleUrls.length} URL{styleUrls.length > 1 ? "s" : ""}.
              </div>
            )}
          </div>

          {/* Voice & tone */}
          <BrandSectionCard
            title="Voice & tone"
            loading={extractingField.voice}
            canRegenerate={canExtract()}
            onRegenerate={() => void runExtractField("voice")}
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Tone keywords</label>
                <ChipInput values={voice.tone_keywords} onChange={(v) => setVoice({ ...voice, tone_keywords: v })} placeholder="e.g. playful" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Voice description</label>
                <textarea
                  value={voice.description}
                  onChange={(e) => setVoice({ ...voice, description: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Do</label>
                  <ListEditor values={voice.dos} onChange={(v) => setVoice({ ...voice, dos: v })} placeholder="rule" />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Don&apos;t</label>
                  <ListEditor values={voice.donts} onChange={(v) => setVoice({ ...voice, donts: v })} placeholder="rule" />
                </div>
              </div>
            </div>
          </BrandSectionCard>

          {/* Visual identity */}
          <BrandSectionCard
            title="Visual identity"
            loading={extractingField.visual}
            canRegenerate={canExtract()}
            onRegenerate={() => void runExtractField("visual")}
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Color palette (hex)</label>
                <ColorChipInput values={visual.color_palette} onChange={(v) => setVisual({ ...visual, color_palette: v })} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Typography notes</label>
                <textarea
                  value={visual.typography_notes}
                  onChange={(e) => setVisual({ ...visual, typography_notes: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Photography style</label>
                <textarea
                  value={visual.photography_style}
                  onChange={(e) => setVisual({ ...visual, photography_style: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Composition rules</label>
                <textarea
                  value={visual.composition_rules}
                  onChange={(e) => setVisual({ ...visual, composition_rules: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>
            </div>
          </BrandSectionCard>

          {/* Taboos & legal */}
          <BrandSectionCard
            title="Taboos & legal"
            loading={extractingField.legal}
            canRegenerate={canExtract()}
            onRegenerate={() => void runExtractField("legal")}
          >
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Banned words / phrases</label>
                <ChipInput values={legal.banned_words} onChange={(v) => setLegal({ ...legal, banned_words: v })} placeholder="word" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Claims to avoid</label>
                <ListEditor values={legal.claims_to_avoid} onChange={(v) => setLegal({ ...legal, claims_to_avoid: v })} placeholder="claim" />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Required disclaimers</label>
                <ListEditor values={legal.required_disclaimers} onChange={(v) => setLegal({ ...legal, required_disclaimers: v })} placeholder="disclaimer" />
              </div>
            </div>
          </BrandSectionCard>

          {/* Notes (collapsed) */}
          <div>
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="text-xs text-muted hover:text-foreground"
            >
              {showNotes ? "▾" : "▸"} Freeform notes (optional)
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything that doesn't fit above…"
                className="mt-2 w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 justify-end">
          {canExtract() && !extractingAll && (
            <button
              type="button"
              onClick={() => slug && void runExtractAll(slug)}
              className="px-3 py-2 text-xs rounded-lg border border-border hover:bg-card-hover transition-colors"
              title="Re-run autofill for all sections"
            >
              Re-run all autofill
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-card-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || savingMeta || extractingAll}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
          >
            {savingMeta ? "Saving…" : isEdit ? "Save changes" : "Save Brand"}
          </button>
        </div>
      </div>
    </div>
  );
}

function sanitizeVoice(v: BrandVoice): BrandVoice | undefined {
  const cleaned: BrandVoice = {
    tone_keywords: v.tone_keywords.map((s) => s.trim()).filter(Boolean),
    description: v.description.trim(),
    dos: v.dos.map((s) => s.trim()).filter(Boolean),
    donts: v.donts.map((s) => s.trim()).filter(Boolean),
  };
  if (
    cleaned.tone_keywords.length === 0 &&
    !cleaned.description &&
    cleaned.dos.length === 0 &&
    cleaned.donts.length === 0
  ) {
    return undefined;
  }
  return cleaned;
}

function sanitizeVisual(v: BrandVisual): BrandVisual | undefined {
  const cleaned: BrandVisual = {
    color_palette: v.color_palette.map((s) => s.trim()).filter(Boolean),
    typography_notes: v.typography_notes.trim(),
    photography_style: v.photography_style.trim(),
    composition_rules: v.composition_rules.trim(),
  };
  if (
    cleaned.color_palette.length === 0 &&
    !cleaned.typography_notes &&
    !cleaned.photography_style &&
    !cleaned.composition_rules
  ) {
    return undefined;
  }
  return cleaned;
}

function sanitizeLegal(v: BrandLegal): BrandLegal | undefined {
  const cleaned: BrandLegal = {
    banned_words: v.banned_words.map((s) => s.trim()).filter(Boolean),
    claims_to_avoid: v.claims_to_avoid.map((s) => s.trim()).filter(Boolean),
    required_disclaimers: v.required_disclaimers.map((s) => s.trim()).filter(Boolean),
  };
  if (
    cleaned.banned_words.length === 0 &&
    cleaned.claims_to_avoid.length === 0 &&
    cleaned.required_disclaimers.length === 0
  ) {
    return undefined;
  }
  return cleaned;
}

// ─── History Panel ───────────────────────────────────────────────

function HistoryPanel({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (entry: HistoryEntry) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("");
  const [filterTarget, setFilterTarget] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterMode) params.set("mode", filterMode);
      if (filterTarget) params.set("target", filterTarget);
      if (filterAuthor) params.set("author", filterAuthor);
      const res = await fetch(`/api/history?${params}`);
      if (res.ok) {
        const data = (await res.json()) as HistoryEntry[];
        setEntries(data);
        // Refresh known author list whenever the filter is empty so the
        // dropdown reflects the full team, not just whoever's currently filtered.
        if (!filterAuthor) {
          const seen = new Set<string>();
          for (const e of data) {
            if (e.created_by) seen.add(e.created_by.toLowerCase());
          }
          setAuthors(Array.from(seen).sort());
        }
      }
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [search, filterMode, filterTarget, filterAuthor]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/history?id=${id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch {
      // non-critical
    }
  };

  const patchEntry = async (
    id: number,
    patch: { rating?: number | null; status?: HistoryStatus },
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
    try {
      await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
    } catch {
      // non-critical
    }
  };

  const handleExport = async (format: "json" | "csv") => {
    const params = new URLSearchParams();
    params.set("format", format);
    params.set("limit", "10000");
    if (search) params.set("search", search);
    if (filterMode) params.set("mode", filterMode);
    if (filterTarget) params.set("target", filterTarget);

    const res = await fetch(`/api/history?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      format === "csv" ? "prompt-history.csv" : "prompt-history.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const modeLabels: Record<string, string> = {
    edit_single: "Edit",
    combine_images: "Combine",
    place_product: "Product",
    animate_single: "Animate",
    animate_keyframes: "Keyframes",
    video_backdrop: "Backdrop",
    text_to_image: "T2I",
    text_to_video: "T2V",
  };

  const targetLabels: Record<string, string> = {
    nano_banana: "Nano Banana",
    veo: "Veo",
    firefly: "Firefly",
    gpt_image: "GPT Image",
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end z-40">
      <div className="w-full sm:max-w-md bg-card border-l border-border h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Prompt History</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport("json")}
              className="px-2 py-1 text-[10px] border border-border rounded hover:bg-card-hover"
              title="Export as JSON"
            >
              JSON
            </button>
            <button
              onClick={() => handleExport("csv")}
              className="px-2 py-1 text-[10px] border border-border rounded hover:bg-card-hover"
              title="Export as CSV"
            >
              CSV
            </button>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground ml-1"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-border space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadHistory()}
            placeholder="Search prompts..."
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2">
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
            >
              <option value="">All modes</option>
              {Object.entries(modeLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filterTarget}
              onChange={(e) => setFilterTarget(e.target.value)}
              className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
            >
              <option value="">All targets</option>
              {Object.entries(targetLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={loadHistory}
              className="px-3 py-1 text-xs bg-accent text-white rounded-md hover:bg-accent-hover"
            >
              Filter
            </button>
          </div>
          {authors.length > 1 && (
            <div className="flex gap-2">
              <select
                value={filterAuthor}
                onChange={(e) => setFilterAuthor(e.target.value)}
                className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-accent"
                title="Filter by author"
              >
                <option value="">All authors</option>
                {authors.map((email) => (
                  <option key={email} value={email}>
                    {email.split("@")[0]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && (
            <p className="text-sm text-muted text-center py-8">Loading...</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-muted text-center py-8">
              No history yet
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full text-left bg-background border border-border rounded-lg p-3 hover:border-border-hover transition-colors cursor-pointer group relative"
            >
              <button
                onClick={(e) => handleDelete(entry.id, e)}
                className="absolute top-2 right-2 text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity px-1"
                title="Delete entry"
              >
                x
              </button>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                  {modeLabels[entry.mode] || entry.mode}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted">
                  {targetLabels[entry.output_target] || entry.output_target}
                </span>
                {entry.brand_slug && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted">
                    {entry.brand_slug}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted truncate pr-6">
                {entry.instruction}
              </p>
              <p className="text-xs text-muted/60 mt-1 line-clamp-2 font-mono">
                {entry.generated_prompt}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-muted/40">
                  {new Date(entry.timestamp).toLocaleString()}
                  {entry.created_by && (
                    <span className="ml-2 text-muted/60">
                      · {entry.created_by.split("@")[0]}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) =>
                      patchEntry(
                        entry.id,
                        { rating: entry.rating === 1 ? null : 1 },
                        e
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      entry.rating === 1
                        ? "bg-green-600/20 text-green-400"
                        : "text-muted/60 hover:text-green-400"
                    }`}
                    title="Rate good"
                  >
                    +
                  </button>
                  <button
                    onClick={(e) =>
                      patchEntry(
                        entry.id,
                        { rating: entry.rating === -1 ? null : -1 },
                        e
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      entry.rating === -1
                        ? "bg-red-600/20 text-red-400"
                        : "text-muted/60 hover:text-red-400"
                    }`}
                    title="Rate bad"
                  >
                    -
                  </button>
                  <button
                    onClick={(e) =>
                      patchEntry(
                        entry.id,
                        {
                          status:
                            entry.status === "used" ? null : "used",
                        },
                        e
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      entry.status === "used"
                        ? "bg-green-600/20 text-green-400 border border-green-600/40"
                        : "border border-border text-muted/60 hover:text-green-400"
                    }`}
                    title="Marked used (worked downstream)"
                  >
                    ✓
                  </button>
                  <button
                    onClick={(e) =>
                      patchEntry(
                        entry.id,
                        {
                          status:
                            entry.status === "discarded"
                              ? null
                              : "discarded",
                        },
                        e
                      )
                    }
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                      entry.status === "discarded"
                        ? "bg-red-600/20 text-red-400 border border-red-600/40"
                        : "border border-border text-muted/60 hover:text-red-400"
                    }`}
                    title="Marked discarded (regenerated)"
                  >
                    ✗
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Insights Panel ─────────────────────────────────────────────

interface InsightsRow {
  group_key: string;
  count: number;
  avg_rating: number | null;
  used: number;
  discarded: number;
}

interface InsightsHistoryRow {
  id: number;
  timestamp: string;
  output_target: string;
  mode: string;
  instruction: string;
  generated_prompt: string;
  rating: number | null;
}

interface InsightsResponse {
  by_target: InsightsRow[];
  by_target_mode: InsightsRow[];
  by_brand: InsightsRow[];
  by_model: InsightsRow[];
  by_rules_hash: InsightsRow[];
  top_rated: InsightsHistoryRow[];
  bottom_rated: InsightsHistoryRow[];
  failure_tags: { tag: string; count: number }[];
  totals: { total: number; rated: number; tagged: number };
}

function AggTable({ title, rows }: { title: string; rows: InsightsRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-card-hover/40 text-muted">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Group</th>
              <th className="text-right px-3 py-1.5 font-medium">Count</th>
              <th className="text-right px-3 py-1.5 font-medium">Avg rating</th>
              <th className="text-right px-3 py-1.5 font-medium">Used</th>
              <th className="text-right px-3 py-1.5 font-medium">Discarded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.group_key}-${i}`}
                className="border-t border-border/50"
              >
                <td className="px-3 py-1.5 font-mono text-muted/90 truncate max-w-[260px]">
                  {row.group_key}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {row.count}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    row.avg_rating === null
                      ? "text-muted/50"
                      : row.avg_rating > 0
                        ? "text-green-400"
                        : row.avg_rating < 0
                          ? "text-red-400"
                          : ""
                  }`}
                >
                  {row.avg_rating === null ? "—" : row.avg_rating.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-green-400/80">
                  {row.used || ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-red-400/80">
                  {row.discarded || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RankedList({
  title,
  rows,
}: {
  title: string;
  rows: InsightsHistoryRow[];
}) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.id}
            className="border border-border rounded-lg p-2.5 space-y-1"
          >
            <div className="flex items-center gap-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-card-hover text-muted">
                {row.output_target}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-card-hover text-muted">
                {row.mode}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded font-mono ${
                  (row.rating ?? 0) > 0
                    ? "bg-green-600/20 text-green-400"
                    : (row.rating ?? 0) < 0
                      ? "bg-red-600/20 text-red-400"
                      : "bg-card-hover text-muted"
                }`}
              >
                {row.rating === null ? "—" : row.rating > 0 ? `+${row.rating}` : row.rating}
              </span>
              <span className="ml-auto text-muted/40">
                {new Date(row.timestamp).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-muted truncate">{row.instruction}</p>
            <p className="text-[11px] text-muted/60 line-clamp-2 font-mono">
              {row.generated_prompt}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<InsightsResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;
  const loading = data === null;

  const filteredBrand = data?.by_brand.filter(
    (r) => r.group_key !== "(none)"
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end z-40">
      <div className="w-full sm:max-w-2xl bg-card border-l border-border h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold">Insights</h2>
            <p className="text-[11px] text-muted">
              Patterns across rated prompts
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
            title="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading && (
            <p className="text-sm text-muted text-center py-8">Loading…</p>
          )}
          {!loading && data && (
            <>
              <section className="grid grid-cols-3 gap-3">
                <div className="border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    Total
                  </div>
                  <div className="text-2xl font-mono tabular-nums">
                    {data.totals.total}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    Rated
                  </div>
                  <div className="text-2xl font-mono tabular-nums">
                    {data.totals.rated}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted uppercase tracking-wide">
                    Tagged
                  </div>
                  <div className="text-2xl font-mono tabular-nums">
                    {data.totals.tagged}
                  </div>
                </div>
              </section>

              <AggTable title="By target" rows={data.by_target} />
              <AggTable title="By target / mode" rows={data.by_target_mode} />
              {filteredBrand && filteredBrand.length > 0 && (
                <AggTable title="By brand" rows={filteredBrand} />
              )}
              <AggTable title="By model" rows={data.by_model} />
              <AggTable
                title="By rules version (sha256 prefix)"
                rows={data.by_rules_hash}
              />

              {data.failure_tags.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Failure tags
                    <span className="ml-2 text-[11px] text-muted font-normal">
                      (from low-rated entries)
                    </span>
                  </h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {data.failure_tags.map((t, i) => (
                          <tr
                            key={t.tag}
                            className={i === 0 ? "" : "border-t border-border/50"}
                          >
                            <td className="px-3 py-1.5 text-muted">
                              {t.tag}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {t.count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <RankedList title="Top 5 rated" rows={data.top_rated} />
              <RankedList title="Bottom 5 rated" rows={data.bottom_rated} />

              {data.totals.total === 0 && (
                <p className="text-sm text-muted text-center py-8">
                  No history yet — generate some prompts and rate them to see
                  patterns here.
                </p>
              )}
              {data.totals.total > 0 && data.totals.rated === 0 && (
                <p className="text-xs text-muted text-center py-2">
                  Tip: rate entries with the +/- and Worked/Redo buttons in the
                  History panel or the active prompt to populate insights.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Rule Editor ────────────────────────────────────────────────

type RulesV2 = {
  version: number;
  global_rules: string[];
  targets: Record<string, RulesV2Target>;
  overlays: Record<string, RulesV2Overlay>;
};
type RulesV2Target = {
  skeleton: string;
  output_format: string;
  must_include: string[];
  must_avoid: string[];
  vocabulary: Record<string, string[]>;
  examples: { instruction: string; good_output: string; why: string }[];
  rules: string[];
};
type RulesV2Overlay = {
  skeleton?: string;
  output_format?: string;
  must_include?: string[];
  must_avoid?: string[];
  examples?: { instruction: string; good_output: string; why: string }[];
  rules: string[];
};

const RULE_LIST_SECTIONS: { path: string; label: string }[] = [
  { path: "global_rules", label: "Global" },
  { path: "targets.nano_banana.must_include", label: "Nano Banana — Must include" },
  { path: "targets.nano_banana.must_avoid", label: "Nano Banana — Anti-patterns" },
  { path: "targets.nano_banana.rules", label: "Nano Banana — Detailed" },
  { path: "targets.veo.must_include", label: "Veo — Must include" },
  { path: "targets.veo.must_avoid", label: "Veo — Anti-patterns" },
  { path: "targets.veo.rules", label: "Veo — Detailed" },
  { path: "targets.firefly.must_include", label: "Firefly — Must include" },
  { path: "targets.firefly.must_avoid", label: "Firefly — Anti-patterns" },
  { path: "targets.firefly.rules", label: "Firefly — Detailed" },
  { path: "targets.gpt_image.must_include", label: "GPT Image — Must include" },
  { path: "targets.gpt_image.must_avoid", label: "GPT Image — Anti-patterns" },
  { path: "targets.gpt_image.rules", label: "GPT Image — Detailed" },
  { path: "overlays.photoshop.must_include", label: "Photoshop — Must include" },
  { path: "overlays.photoshop.must_avoid", label: "Photoshop — Anti-patterns" },
  { path: "overlays.photoshop.rules", label: "Photoshop — Detailed" },
  { path: "overlays.runway_image_to_video.rules", label: "Runway I2V" },
];

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    obj
  );
}

function setByPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const root = structuredClone(obj) as Record<string, unknown>;
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cursor[k] !== "object" || cursor[k] === null) cursor[k] = {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return root as T;
}

function RuleEditor({ onClose }: { onClose: () => void }) {
  const [rules, setRules] = useState<RulesV2 | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("global_rules");
  const [rawDraft, setRawDraft] = useState<string>("");
  const [rawError, setRawError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((data: RulesV2) => {
        setRules(data);
        setRawDraft(JSON.stringify(data, null, 2));
      })
      .catch(() => {});
  }, []);

  const updateList = (path: string, list: string[]) => {
    setRules((prev) => (prev ? setByPath(prev, path, list) : prev));
  };

  const updateRule = (path: string, index: number, value: string) => {
    if (!rules) return;
    const list = ((getByPath(rules, path) as string[]) || []).slice();
    list[index] = value;
    updateList(path, list);
  };

  const deleteRule = (path: string, index: number) => {
    if (!rules) return;
    const list = ((getByPath(rules, path) as string[]) || []).filter((_, i) => i !== index);
    updateList(path, list);
  };

  const addRule = (path: string) => {
    if (!rules) return;
    const list = ((getByPath(rules, path) as string[]) || []).slice();
    list.push("");
    updateList(path, list);
  };

  const moveRule = (path: string, index: number, dir: "up" | "down") => {
    if (!rules) return;
    const list = ((getByPath(rules, path) as string[]) || []).slice();
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    updateList(path, list);
  };

  const handleSave = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      let payload: RulesV2 = rules;
      if (activeSection === "__raw__") {
        try {
          payload = JSON.parse(rawDraft);
          setRawError(null);
        } catch (e) {
          setRawError(`Invalid JSON: ${String(e)}`);
          setSaving(false);
          return;
        }
      }
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      onClose();
    } catch (err) {
      alert("Failed to save rules: " + err);
    } finally {
      setSaving(false);
    }
  };

  if (!rules)
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <p className="text-muted">Loading rules...</p>
      </div>
    );

  const activeList =
    activeSection !== "__raw__"
      ? ((getByPath(rules, activeSection) as string[] | undefined) ?? [])
      : [];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="font-semibold">Prompt Rules Editor</h2>
            <p className="text-xs text-muted">
              Edit the structured rules. Skeletons, examples, and vocabulary live in the Raw JSON tab.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0">
          {RULE_LIST_SECTIONS.filter((s) => Array.isArray(getByPath(rules, s.path))).map((section) => {
            const list = (getByPath(rules, section.path) as string[]) || [];
            return (
              <button
                key={section.path}
                onClick={() => setActiveSection(section.path)}
                className={`px-3 py-1.5 text-xs rounded-t-md whitespace-nowrap transition-colors ${
                  activeSection === section.path
                    ? "bg-accent text-white"
                    : "border border-border border-b-0 hover:bg-card-hover"
                }`}
              >
                {section.label}
                <span className="ml-1 opacity-60">({list.length})</span>
              </button>
            );
          })}
          <button
            onClick={() => {
              setRawDraft(JSON.stringify(rules, null, 2));
              setActiveSection("__raw__");
            }}
            className={`px-3 py-1.5 text-xs rounded-t-md whitespace-nowrap transition-colors ${
              activeSection === "__raw__"
                ? "bg-accent text-white"
                : "border border-border border-b-0 hover:bg-card-hover"
            }`}
          >
            Raw JSON
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeSection === "__raw__" ? (
            <div className="flex flex-col h-full gap-2">
              {rawError && <p className="text-xs text-danger">{rawError}</p>}
              <textarea
                value={rawDraft}
                onChange={(e) => {
                  setRawDraft(e.target.value);
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setRules(parsed);
                    setRawError(null);
                  } catch (err) {
                    setRawError(`Invalid JSON: ${String(err)}`);
                  }
                }}
                className="flex-1 min-h-[400px] bg-background border border-border rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-accent resize-none leading-relaxed"
              />
            </div>
          ) : (
            <>
              {activeList.map((rule, i) => (
                <div key={i} className="flex gap-2 group">
                  <div className="flex flex-col gap-0.5 shrink-0 pt-1">
                    <button
                      onClick={() => moveRule(activeSection, i, "up")}
                      disabled={i === 0}
                      className="text-[10px] text-muted hover:text-foreground disabled:opacity-20 px-1"
                    >
                      {"▲"}
                    </button>
                    <button
                      onClick={() => moveRule(activeSection, i, "down")}
                      disabled={i === activeList.length - 1}
                      className="text-[10px] text-muted hover:text-foreground disabled:opacity-20 px-1"
                    >
                      {"▼"}
                    </button>
                  </div>
                  <span className="text-[10px] text-muted pt-2.5 w-5 text-right shrink-0">{i + 1}</span>
                  <textarea
                    value={rule}
                    onChange={(e) => updateRule(activeSection, i, e.target.value)}
                    rows={2}
                    className="flex-1 bg-background border border-border rounded px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none leading-relaxed"
                  />
                  <button
                    onClick={() => deleteRule(activeSection, i)}
                    className="text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity px-2 shrink-0 self-center"
                    title="Delete rule"
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                onClick={() => addRule(activeSection)}
                className="w-full py-2 border border-dashed border-border rounded-lg text-xs text-muted hover:border-accent hover:text-accent transition-colors"
              >
                + Add rule
              </button>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-card-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (activeSection === "__raw__" && !!rawError)}
            className="px-4 py-2 text-sm rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Rules"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Product Image Manager (per-product, inside ProductManagerModal) ──

function ProductImageManager({
  product,
  onAdd,
  onRemove,
  onUpdate,
}: {
  product: ProductAsset;
  onAdd: (file: File, label: string, description: string) => Promise<void>;
  onRemove: (filename: string) => void;
  onUpdate: (filename: string, patch: { label?: string; description?: string }) => void;
}) {
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addLabel, setAddLabel] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { label: string; description: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!addFile || !addLabel.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await onAdd(addFile, addLabel, addDescription);
      setAddFile(null);
      setAddLabel("");
      setAddDescription("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="border-t border-border pt-2 space-y-2">
      <div className="space-y-2">
        {product.images.map((img: ProductImage) => {
          const draft = drafts[img.filename];
          const label = draft?.label ?? img.label;
          const description = draft?.description ?? img.description ?? "";
          const dirty =
            draft !== undefined &&
            (draft.label !== img.label || draft.description !== (img.description ?? ""));
          return (
            <div
              key={img.filename}
              className="flex gap-2 items-start p-2 rounded bg-card-hover/40 border border-border"
            >
              <div className="w-12 h-12 shrink-0 bg-card rounded overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.label}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  type="text"
                  value={label}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [img.filename]: { label: e.target.value, description },
                    }))
                  }
                  placeholder="Label (required)"
                  className="w-full bg-card border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
                />
                <textarea
                  value={description}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [img.filename]: { label, description: e.target.value },
                    }))
                  }
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full bg-card border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
                />
                <div className="flex gap-2 text-[11px]">
                  {dirty && (
                    <button
                      onClick={() => {
                        const patch: { label?: string; description?: string } = {};
                        if (draft.label !== img.label) patch.label = draft.label;
                        if (draft.description !== (img.description ?? "")) patch.description = draft.description;
                        onUpdate(img.filename, patch);
                        setDrafts((prev) => {
                          const next = { ...prev };
                          delete next[img.filename];
                          return next;
                        });
                      }}
                      className="text-accent hover:underline"
                    >
                      Save
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(img.filename)}
                    disabled={product.images.length === 1}
                    title={product.images.length === 1 ? "A product must have at least one image" : "Remove this image"}
                    className="text-danger hover:underline disabled:opacity-30 disabled:no-underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-dashed border-border rounded p-2 space-y-1.5">
        <p className="text-[11px] text-muted">Add another reference image</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
          className="w-full text-[11px] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-card-hover file:text-foreground file:text-[10px]"
        />
        <input
          type="text"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          placeholder="Label (required, e.g. Interior cross-section)"
          className="w-full bg-card border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={addDescription}
          onChange={(e) => setAddDescription(e.target.value)}
          placeholder="Description (optional, helps AI pick)"
          className="w-full bg-card border border-border rounded px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          disabled={!addFile || !addLabel.trim() || adding}
          className="w-full px-2 py-1 text-[11px] bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add image"}
        </button>
        {error && <p className="text-[11px] text-danger">{error}</p>}
      </div>
    </div>
  );
}

// ─── Product Manager Modal ─────────────────────────────────────

function ProductManagerModal({
  products,
  brandSlug,
  onClose,
  onChange,
}: {
  products: ProductAsset[];
  brandSlug: string;
  onClose: () => void;
  onChange: (products: ProductAsset[]) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [imageLabel, setImageLabel] = useState("Hero shot");
  const [imageDescription, setImageDescription] = useState("");
  const [categoriesInput, setCategoriesInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allCategories = getProductCategories(products);
  const filteredProducts = products.filter((p) =>
    productMatchesFilters(p, search, categoryFilter)
  );

  const refresh = async () => {
    try {
      const r = await fetch(`/api/products?brand=${encodeURIComponent(brandSlug)}`);
      const data = (await r.json()) as ProductAsset[];
      if (Array.isArray(data)) onChange(data);
    } catch {
      // ignore
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name.trim()) {
      const base = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setName(base);
    }
  };

  const handleUpload = async () => {
    if (!file || !name.trim() || !imageLabel.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("brand", brandSlug);
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("categories", categoriesInput);
      fd.append("label", imageLabel.trim());
      if (imageDescription.trim()) fd.append("description", imageDescription.trim());
      const res = await fetch("/api/products", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
      setFile(null);
      setName("");
      setImageLabel("Hero shot");
      setImageDescription("");
      setCategoriesInput("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddImage = async (
    productId: string,
    addFile: File,
    label: string,
    description: string
  ) => {
    setError(null);
    const fd = new FormData();
    fd.append("brand", brandSlug);
    fd.append("productId", productId);
    fd.append("file", addFile);
    fd.append("label", label.trim());
    if (description.trim()) fd.append("description", description.trim());
    const res = await fetch("/api/products/images", { method: "POST", body: fd });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    await refresh();
  };

  const handleRemoveImage = async (productId: string, filename: string) => {
    if (!confirm("Remove this reference image?")) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/products/images?brand=${encodeURIComponent(brandSlug)}&productId=${encodeURIComponent(productId)}&filename=${encodeURIComponent(filename)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateImage = async (
    productId: string,
    filename: string,
    patch: { label?: string; description?: string }
  ) => {
    setError(null);
    try {
      const res = await fetch("/api/products/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandSlug, productId, filename, ...patch }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      const res = await fetch(
        `/api/products?brand=${encodeURIComponent(brandSlug)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveCategories = async (product: ProductAsset) => {
    setSavingProductId(product.id);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brandSlug,
          id: product.id,
          categories: categoryDrafts[product.id] ?? product.categories.join(", "),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
      setCategoryDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingProductId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Manage products</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-sm"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border space-y-3">
          <p className="text-xs text-muted">
            Upload a PNG (or JPEG/WebP) of a product. Each product can have multiple reference images (different angles, interiors, environments) — the AI picks the best one based on the user&apos;s instruction. Max 25MB.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              onChange={handleFileChange}
              className="text-sm flex-1 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-card-hover file:text-foreground file:text-xs"
            />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={categoriesInput}
              onChange={(e) => setCategoriesInput(e.target.value)}
              placeholder="Categories, comma-separated"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleUpload}
              disabled={!file || !name.trim() || !imageLabel.trim() || uploading}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50 shrink-0"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={imageLabel}
              onChange={(e) => setImageLabel(e.target.value)}
              placeholder="Image label (required, e.g. Hero shot)"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <input
              type="text"
              value={imageDescription}
              onChange={(e) => setImageDescription(e.target.value)}
              placeholder="Description (optional, helps AI pick)"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="px-5 py-4 overflow-auto space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or categories…"
              className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">All categories</option>
              {allCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          {products.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No products yet. Upload one above.
            </p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No products match these filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="border border-border rounded-lg p-2 flex flex-col gap-2 bg-background"
                >
                  <div className="aspect-square w-full bg-card-hover rounded overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="text-xs truncate" title={p.name}>
                    {p.name}
                  </div>
                  <div className="flex flex-wrap gap-1 min-h-5">
                    {(p.categories ?? []).length > 0 ? (
                      p.categories.map((category) => (
                        <span
                          key={category}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted"
                        >
                          {category}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted">No categories</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={categoryDrafts[p.id] ?? (p.categories ?? []).join(", ")}
                    onChange={(e) =>
                      setCategoryDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder="Categories"
                    className="bg-card border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => toggleExpand(p.id)}
                    className="text-[11px] text-left text-muted hover:text-foreground"
                  >
                    {expandedProductIds.has(p.id) ? "▼" : "▶"} {p.images.length} reference image{p.images.length === 1 ? "" : "s"}
                  </button>
                  {expandedProductIds.has(p.id) && (
                    <ProductImageManager
                      product={p}
                      onAdd={(addFile, label, description) =>
                        handleAddImage(p.id, addFile, label, description)
                      }
                      onRemove={(filename) => handleRemoveImage(p.id, filename)}
                      onUpdate={(filename, patch) => handleUpdateImage(p.id, filename, patch)}
                    />
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleSaveCategories(p)}
                      disabled={savingProductId === p.id}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      {savingProductId === p.id ? "Saving…" : "Save categories"}
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export interface CurrentUser {
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export interface PageClientProps {
  currentUser: CurrentUser;
  lockedBrandSlugs: string[];
}

export default function PageClient({ currentUser, lockedBrandSlugs }: PageClientProps) {
  const lockedSlugSet = useMemo(
    () => new Set(lockedBrandSlugs),
    [lockedBrandSlugs]
  );
  const canEditBrand = useCallback(
    (slug: string | null): boolean => {
      if (!slug) return true;
      if (currentUser.isAdmin) return true;
      return !lockedSlugSet.has(slug);
    },
    [currentUser.isAdmin, lockedSlugSet]
  );
  const [promptCharBudget, setPromptCharBudget] = useState<number>(800);
  const [mode, setMode] = useState<Mode>("place_product");
  const [mediaModel, setMediaModel] = useState<string>("google/gemini-3.1-flash-image-preview");
  const [selectedModel, setSelectedModel] = useState<string>("google/gemini-2.5-flash");
  const [selectorModels, setSelectorModels] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [products, setProducts] = useState<ProductAsset[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productPicks, setProductPicks] = useState<ClientProductPick[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [showProductModal, setShowProductModal] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [primaryImages, setPrimaryImages] = useState<UploadedFile[]>([]);
  const [referenceImages, setReferenceImages] = useState<UploadedFile[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandProfile | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [paintTarget, setPaintTarget] = useState<{
    file: UploadedFile;
    zone: "primary" | "reference" | "first_frame" | "last_frame";
  } | null>(null);
  const [cropTarget, setCropTarget] = useState<{
    file: UploadedFile;
    zone: "primary" | "reference" | "first_frame" | "last_frame";
  } | null>(null);

  // animate_keyframes: separate first/last frame slots
  const [firstFrameImage, setFirstFrameImage] = useState<UploadedFile[]>([]);
  const [lastFrameImage, setLastFrameImage] = useState<UploadedFile[]>([]);

  // Feature: Prompt templates
  const [templates, setTemplates] = useState<
    { id: string; name: string; instruction: string; category: string; created_at: string }[]
  >([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");

  // Feature: Prompt variants
  const [variants, setVariants] = useState<string[]>([]);
  const [activeVariant, setActiveVariant] = useState(0);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const [variantHistoryIds, setVariantHistoryIds] = useState<(number | null)[]>([]);

  // Feature: Feedback signal
  const [currentHistoryId, setCurrentHistoryId] = useState<number | null>(null);
  const [currentStatus, setCurrentStatus] = useState<HistoryStatus>(null);
  const [currentTags, setCurrentTags] = useState<string[]>([]);
  const [currentNotes, setCurrentNotes] = useState<string>("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Feature: Insights modal
  const [insightsOpen, setInsightsOpen] = useState(false);

  // Feature: Rule editor
  const [showRuleEditor, setShowRuleEditor] = useState(false);

  // Feature: Smart refinement
  const [refining, setRefining] = useState(false);
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");

  // Feature: Direct media generation
  const [mediaAspectRatio, setMediaAspectRatio] = useState("1:1");
  const [videoDuration, setVideoDuration] = useState(8);
  const [generatingMedia, setGeneratingMedia] = useState(false);
  const [mediaResult, setMediaResult] = useState<{ type: "image" | "video"; url: string } | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoJobStatus, setVideoJobStatus] = useState<"pending" | "in_progress" | "completed" | "failed" | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Per-brand media-generation spend (current month, requesting user only).
  const [brandSpendMonthUsd, setBrandSpendMonthUsd] = useState<number | null>(null);
  const [brandSpendSource, setBrandSpendSource] = useState<"provider" | "computed" | "mixed" | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const generateRef = useRef<() => void>(() => {});
  const variantsRef = useRef<string[]>([]);
  const variantHistoryIdsRef = useRef<(number | null)[]>([]);
  const activeVariantRef = useRef(0);
  const templateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setBrands(data);
      })
      .catch(() => {});

    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.selector_models)) setSelectorModels(data.selector_models);
      })
      .catch(() => {});

    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setHasApiKey(data.hasKey);
        setMounted(true);
      })
      .catch(() => {
        setHasApiKey(true);
        setMounted(true);
      });
  }, []);

  // Reload products whenever the selected brand changes
  useEffect(() => {
    if (!brandSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProducts([]);
      setSelectedProductIds([]);
      return;
    }
    fetch(`/api/products?brand=${encodeURIComponent(brandSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      })
      .catch(() => {});
  }, [brandSlug]);

  // Refresh per-brand spend whenever the brand changes (and after media gens settle).
  useEffect(() => {
    if (!brandSlug) {
      setBrandSpendMonthUsd(null);
      setBrandSpendSource(null);
      return;
    }
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const since = monthStart.toISOString().slice(0, 19).replace("T", " ");
    fetch(`/api/usage?brand=${encodeURIComponent(brandSlug)}&since=${encodeURIComponent(since)}`)
      .then((r) => r.json())
      .then((data: { byBrand: { brand_slug: string; month_usd: number }[]; estimatedUsd: number; providerUsd: number }) => {
        const row = data.byBrand?.find((b) => b.brand_slug === brandSlug);
        setBrandSpendMonthUsd(row?.month_usd ?? 0);
        if (data.providerUsd > 0 && data.estimatedUsd > 0) setBrandSpendSource("mixed");
        else if (data.providerUsd > 0) setBrandSpendSource("provider");
        else if (data.estimatedUsd > 0) setBrandSpendSource("computed");
        else setBrandSpendSource(null);
      })
      .catch(() => {
        setBrandSpendMonthUsd(null);
        setBrandSpendSource(null);
      });
  }, [brandSlug, mediaResult, videoJobStatus]);

  // Load templates on mount
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  // Keep generate ref in sync
  useEffect(() => {
    generateRef.current = handleGenerate;
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd+Enter to generate
      if (meta && e.key === "Enter") {
        e.preventDefault();
        generateRef.current();
        return;
      }

      // Escape to close modals (priority order)
      if (e.key === "Escape") {
        if (cropTarget) {
          setCropTarget(null);
        } else if (paintTarget) {
          setPaintTarget(null);
        } else if (showRuleEditor) {
          setShowRuleEditor(false);
        } else if (showBrandModal) {
          setShowBrandModal(false);
        } else if (showProductModal) {
          setShowProductModal(false);
        } else if (insightsOpen) {
          setInsightsOpen(false);
        } else if (historyOpen) {
          setHistoryOpen(false);
        } else if (showTemplates) {
          setShowTemplates(false);
        } else if (showSaveTemplate) {
          setShowSaveTemplate(false);
          setTemplateName("");
          setTemplateCategory("");
        } else if (showRefineInput) {
          setShowRefineInput(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cropTarget, paintTarget, showBrandModal, showProductModal, historyOpen, insightsOpen, showTemplates, showSaveTemplate, showRuleEditor, showRefineInput]);

  // Close template dropdown on outside click
  useEffect(() => {
    if (!showTemplates) return;
    const handler = (e: MouseEvent) => {
      if (
        templateDropdownRef.current &&
        !templateDropdownRef.current.contains(e.target as Node)
      ) {
        setShowTemplates(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplates]);

  // Poll video generation job until completed or failed
  useEffect(() => {
    if (!videoJobId || !videoJobStatus || videoJobStatus === "completed" || videoJobStatus === "failed") return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/poll-video/${videoJobId}`);
        const data = await res.json();
        setVideoJobStatus(data.status);
        if (data.status === "completed" && data.videoUrl) {
          setMediaResult({ type: "video", url: data.videoUrl });
          setGeneratingMedia(false);
        } else if (data.status === "failed") {
          setMediaError(data.error || "Video generation failed");
          setGeneratingMedia(false);
        }
      } catch (err) {
        setMediaError(err instanceof Error ? err.message : String(err));
        setGeneratingMedia(false);
      }
    };
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [videoJobId, videoJobStatus]);

  // Derive outputTarget and isVideoTarget from the selected media model.
  const ALL_MEDIA_MODELS = [...IMAGE_MODELS, ...VIDEO_MODELS];
  const selectedMediaModelDef = ALL_MEDIA_MODELS.find((m) => m.id === mediaModel);
  const outputTarget: OutputTarget = selectedMediaModelDef?.promptTarget ?? "nano_banana";
  const isVideoMediaModel = VIDEO_MODELS.some((m) => m.id === mediaModel);

  // Available modes depend on whether the selected model is image or video.
  const availableModes = MODES.filter((m) =>
    isVideoMediaModel ? m.videoOnly : !m.videoOnly
  );

  const pickMode = (modes: typeof MODES, current: Mode): Mode => {
    if (modes.some((m) => m.value === current)) return current;
    const preferred = modes.find((m) => m.value === "place_product");
    return preferred?.value ?? modes[0]?.value ?? current;
  };

  const handleMediaModelChange = (nextId: string) => {
    setMediaModel(nextId);
    const nextIsVideo = VIDEO_MODELS.some((m) => m.id === nextId);
    const nextModes = MODES.filter((m) => nextIsVideo ? m.videoOnly : !m.videoOnly);
    const nextMode = pickMode(nextModes, mode);
    if (nextMode !== mode) setMode(nextMode);
  };

  const handleProductToggle = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    // Clear any previous pick for this product so stale info isn't shown.
    setProductPicks((prev) => prev.filter((p) => p.productId !== id));
  };

  const handleModeChange = (next: Mode) => {
    if (next === "animate_keyframes" && mode !== "animate_keyframes") {
      // Transfer existing primary images into first/last slots
      setFirstFrameImage(primaryImages.slice(0, 1));
      setLastFrameImage(primaryImages.slice(1, 2));
      setPrimaryImages([]);
    } else if (mode === "animate_keyframes" && next !== "animate_keyframes") {
      // Merge first/last back into primary
      setPrimaryImages([...firstFrameImage, ...lastFrameImage]);
      setFirstFrameImage([]);
      setLastFrameImage([]);
    }
    setMode(next);
  };

  const charLimit = getCharLimit(outputTarget);
  const promptLength = generatedPrompt.length;
  const overLimit = promptLength > charLimit.hard;
  const isVideoTarget = isVideoMediaModel;

  // Parse multi-clip prompts for video_backdrop mode
  const clipPrompts = (() => {
    if (mode !== "video_backdrop" || !generatedPrompt) return null;
    const parts = generatedPrompt
      .split(/===CLIP \d+===/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : null;
  })();

  const updateClipPrompt = (index: number, newText: string) => {
    if (!clipPrompts) return;
    const updated = [...clipPrompts];
    updated[index] = newText;
    setGeneratedPrompt(
      updated.map((c, i) => `===CLIP ${i + 1}===\n${c}`).join("\n\n")
    );
  };

  const handleCopyClip = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAllClips = () => {
    if (!clipPrompts) return;
    const text = clipPrompts
      .map((c, i) => `Clip ${i + 1}:\n${c}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const effectivePrimaryImages =
    mode === "animate_keyframes"
      ? [...firstFrameImage, ...lastFrameImage]
      : primaryImages;

  const hasPaintedImages =
    effectivePrimaryImages.some((f) => f.paintData) ||
    referenceImages.some((f) => f.paintData);

  // Compress a base64 image client-side to ≤1536px JPEG before sending so
  // the JSON payload stays well under the server body-size limit.
  async function compressBase64(base64: string, mimeType: string): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1536;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX || h > MAX) {
          const scale = MAX / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
        resolve({ base64: dataUrl.split(",")[1], mimeType: "image/jpeg" });
      };
      img.onerror = () => resolve({ base64, mimeType });
      img.src = `data:${mimeType};base64,${base64}`;
    });
  }

  async function prepareImages(files: UploadedFile[]) {
    return Promise.all(
      files.map(async (f) => {
        const { base64, mimeType } = await compressBase64(f.base64, f.type);
        return { base64, mimeType, sourceUrl: f.sourceUrl };
      })
    );
  }

  const handleGenerate = async () => {
    if (!instruction.trim()) {
      setError("Please describe what you want.");
      return;
    }
    const isTextToMode = mode === "text_to_image" || mode === "text_to_video";
    const hasProducts = selectedProductIds.length > 0;
    if (!isTextToMode && effectivePrimaryImages.length === 0 && (mode === "animate_keyframes" || !hasProducts)) {
      setError(
        mode === "animate_keyframes"
          ? "Please upload at least a first-frame image."
          : "Please upload at least one primary image, or select a product."
      );
      return;
    }

    setGenerating(true);
    setError(null);
    setGeneratedPrompt("");
    setUsedModel(null);
    setVariants([]);
    variantsRef.current = [];
    setVariantHistoryIds([]);
    variantHistoryIdsRef.current = [];
    setCurrentHistoryId(null);
    resetCurrentFeedback();
    setShowRefineInput(false);
    setProductPicks([]);

    try {
      const [compPrimary, compReference] = await Promise.all([
        prepareImages(effectivePrimaryImages),
        mode === "text_to_image" || mode === "text_to_video"
          ? Promise.resolve([])
          : prepareImages(referenceImages),
      ]);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          outputTarget,
          brandSlug,
          instruction,
          hasPaintedImages,
          includeAudio: outputTarget === "veo" ? includeAudio : undefined,
          primaryImages: compPrimary,
          referenceImages: compReference,
          selectedModel,
          charBudget: promptCharBudget,
          selectedProductIds,
        }),
      });

      if (!res.ok) {
        // Body may be empty (e.g. on a body-size limit or upstream crash) or
        // non-JSON (e.g. an HTML error page). Read it as text first and only
        // try JSON.parse defensively — otherwise the cryptic "Unexpected end
        // of JSON input" hides the real HTTP error from the user.
        const raw = await res.text().catch(() => "");
        let serverMsg: string | null = null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { error?: string };
            if (parsed?.error) serverMsg = parsed.error;
          } catch {
            // raw was not JSON; show a snippet of it instead
            serverMsg = raw.slice(0, 300);
          }
        }
        throw new Error(
          serverMsg ?? `Generation failed (HTTP ${res.status} ${res.statusText})`
        );
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let prompt = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                setError(data.error);
                setGenerating(false);
              } else if (data.status === "connected") {
                setUsedModel(data.model);
              } else if (Array.isArray(data.productPicks)) {
                setProductPicks(data.productPicks as ClientProductPick[]);
              } else if (data.text) {
                prompt += data.text;
                setGeneratedPrompt(prompt);
                if (data.model) setUsedModel(data.model);
              } else if (data.done) {
                if (data.model) setUsedModel(data.model);
                if (data.historyId) {
                  setCurrentHistoryId(data.historyId);
                  resetCurrentFeedback();
                }
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setPrimaryImages([]);
    setFirstFrameImage([]);
    setLastFrameImage([]);
    setReferenceImages([]);
    setInstruction("");
    setGeneratedPrompt("");
    setError(null);
    setUsedModel(null);
    setVariants([]);
    variantsRef.current = [];
    setVariantHistoryIds([]);
    variantHistoryIdsRef.current = [];
    setCurrentHistoryId(null);
    resetCurrentFeedback();
    setShowRefineInput(false);
    setRefineInstruction("");
  };

  // ─── Template functions ──────────────────────────────────────

  const saveTemplate = async () => {
    if (!templateName.trim() || !instruction.trim() || !templateCategory.trim()) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          instruction: instruction.trim(),
          category: templateCategory.trim(),
        }),
      });
      if (res.ok) {
        const template = await res.json();
        setTemplates((prev) => [...prev, template]);
        setTemplateName("");
        setTemplateCategory("");
        setShowSaveTemplate(false);
      }
    } catch {
      // non-critical
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await fetch(`/api/templates?id=${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // non-critical
    }
  };

  // ─── Variant generation ─────────────────────────────────────

  const handleGenerateVariants = async () => {
    if (!instruction.trim()) {
      setError("Please describe what you want.");
      return;
    }
    const isTextToMode = mode === "text_to_image" || mode === "text_to_video";
    const hasProducts = selectedProductIds.length > 0;
    if (!isTextToMode && effectivePrimaryImages.length === 0 && (mode === "animate_keyframes" || !hasProducts)) {
      setError(
        mode === "animate_keyframes"
          ? "Please upload at least a first-frame image."
          : "Please upload at least one primary image, or select a product."
      );
      return;
    }

    setGeneratingVariants(true);
    setGenerating(false);
    setError(null);
    setGeneratedPrompt("");
    setUsedModel(null);
    variantsRef.current = ["", "", ""];
    variantHistoryIdsRef.current = [null, null, null];
    activeVariantRef.current = 0;
    setVariants(["", "", ""]);
    setVariantHistoryIds([null, null, null]);
    setActiveVariant(0);
    setCurrentHistoryId(null);
    resetCurrentFeedback();

    const [compPrimary, compReference] = await Promise.all([
      prepareImages(effectivePrimaryImages),
      mode === "text_to_image" || mode === "text_to_video"
        ? Promise.resolve([])
        : prepareImages(referenceImages),
    ]);
    const body = {
      mode,
      outputTarget,
      brandSlug,
      instruction,
      hasPaintedImages,
      includeAudio: outputTarget === "veo" ? includeAudio : undefined,
      primaryImages: compPrimary,
      referenceImages: compReference,
      selectedModel,
      charBudget: promptCharBudget,
      selectedProductIds,
    };
    setProductPicks([]);

    const promises = [0, 1, 2].map(async (idx) => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          let serverMsg: string | null = null;
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { error?: string };
              if (parsed?.error) serverMsg = parsed.error;
            } catch {
              serverMsg = raw.slice(0, 300);
            }
          }
          throw new Error(
            serverMsg ?? `Generation failed (HTTP ${res.status} ${res.statusText})`
          );
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let prompt = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text
              .split("\n")
              .filter((l) => l.startsWith("data: "));

            for (const line of lines) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  prompt += data.text;
                  variantsRef.current[idx] = prompt;
                  setVariants([...variantsRef.current]);
                  if (idx === activeVariantRef.current) {
                    setGeneratedPrompt(prompt);
                  }
                }
                if (data.status === "connected" && idx === 0) {
                  setUsedModel(data.model);
                }
                if (data.done && data.historyId) {
                  variantHistoryIdsRef.current[idx] = data.historyId;
                  setVariantHistoryIds([...variantHistoryIdsRef.current]);
                  if (idx === activeVariantRef.current) {
                    setCurrentHistoryId(data.historyId);
                    resetCurrentFeedback();
                  }
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      } catch (err) {
        const errMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
        variantsRef.current[idx] = errMsg;
        setVariants([...variantsRef.current]);
        if (idx === activeVariantRef.current) {
          setGeneratedPrompt(errMsg);
        }
      }
    });

    await Promise.all(promises);
    setGeneratingVariants(false);
    setGeneratedPrompt(
      variantsRef.current[activeVariantRef.current] || ""
    );
  };

  const handleVariantClick = (idx: number) => {
    setActiveVariant(idx);
    activeVariantRef.current = idx;
    setGeneratedPrompt(variantsRef.current[idx] || "");
    setCurrentHistoryId(variantHistoryIdsRef.current[idx] ?? null);
  };

  // ─── Feedback ───────────────────────────────────────────────────

  const resetCurrentFeedback = () => {
    setCurrentStatus(null);
    setCurrentTags([]);
    setCurrentNotes("");
    setFeedbackOpen(false);
  };

  const patchFeedback = async (
    patch: { rating?: number | null; status?: HistoryStatus; tags?: string[] | null; notes?: string | null }
  ) => {
    if (!currentHistoryId) return;
    try {
      await fetch("/api/history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentHistoryId, ...patch }),
      });
    } catch {
      // non-critical
    }
  };

  const handleStatus = async (status: HistoryStatus) => {
    if (!currentHistoryId) return;
    const newStatus: HistoryStatus = currentStatus === status ? null : status;
    setCurrentStatus(newStatus);
    await patchFeedback({ status: newStatus });
  };

  const handleToggleTag = async (tag: string) => {
    if (!currentHistoryId) return;
    const next = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];
    setCurrentTags(next);
    await patchFeedback({ tags: next.length ? next : null });
  };

  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNotesChange = (value: string) => {
    setCurrentNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      if (!currentHistoryId) return;
      patchFeedback({ notes: value.trim() ? value : null });
    }, 600);
  };

  // ─── Smart refinement ──────────────────────────────────────────

  const handleRefine = async (refinement: string) => {
    if (!generatedPrompt.trim() || !refinement.trim()) return;

    setRefining(true);
    setError(null);
    setShowRefineInput(false);
    setRefineInstruction("");

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPrompt: generatedPrompt,
          refinement,
          outputTarget,
          charBudget: promptCharBudget,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Refinement failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let prompt = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text
            .split("\n")
            .filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                prompt += data.text;
                setGeneratedPrompt(prompt);
              }
              if (data.error) {
                setError(data.error);
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefining(false);
    }
  };

  const handleGenerateMedia = async () => {
    if (!generatedPrompt.trim()) return;
    setGeneratingMedia(true);
    setMediaResult(null);
    setMediaError(null);
    setVideoJobId(null);
    setVideoJobStatus(null);

    try {
      if (isVideoTarget) {
        const frameImages: { type: "image_url"; image_url: { url: string }; frame_type: "first_frame" | "last_frame" }[] = [];
        const toDataUrl = (f: { type: string; base64: string }) =>
          `data:${f.type || "image/jpeg"};base64,${f.base64}`;

        if (mode === "animate_keyframes") {
          if (firstFrameImage[0]) frameImages.push({ type: "image_url", image_url: { url: toDataUrl(firstFrameImage[0]) }, frame_type: "first_frame" });
          if (lastFrameImage[0]) frameImages.push({ type: "image_url", image_url: { url: toDataUrl(lastFrameImage[0]) }, frame_type: "last_frame" });
        } else if (mode === "animate_single" && primaryImages[0]) {
          frameImages.push({ type: "image_url", image_url: { url: toDataUrl(primaryImages[0]) }, frame_type: "first_frame" });
        }

        const selectedVideoModel = VIDEO_MODELS.find((m) => m.id === mediaModel);
        const res = await fetch("/api/generate-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: mediaModel,
            prompt: generatedPrompt,
            aspectRatio: mediaAspectRatio,
            resolution: "1080p",
            duration: Math.min(videoDuration, selectedVideoModel?.maxDuration ?? 10),
            generateAudio: includeAudio && (selectedVideoModel?.supportsAudio ?? false),
            frameImages,
            brandSlug,
            historyId: currentHistoryId,
          }),
        });
        const data = await res.json();
        if (data.error) { setMediaError(data.error); setGeneratingMedia(false); return; }
        setVideoJobId(data.jobId);
        setVideoJobStatus(data.status || "pending");
      } else {
        const selectedImageModel = IMAGE_MODELS.find((m) => m.id === mediaModel);
        const imgs = primaryImages.slice(0, 3).map((img) => ({
          base64: img.base64,
          mimeType: img.type || "image/jpeg",
        }));
        const picksForRequest = productPicks
          .filter((p) => selectedProductIds.includes(p.productId))
          .map((p) => ({ productId: p.productId, filename: p.filename }));
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: mediaModel,
            prompt: generatedPrompt,
            aspectRatio: mediaAspectRatio,
            imageSize: "2K",
            imageOnly: selectedImageModel?.textOutput === false,
            primaryImages: imgs,
            productPicks: picksForRequest,
            brandSlug,
            historyId: currentHistoryId,
          }),
        });
        const data = await res.json();
        if (data.error) { setMediaError(data.error); setGeneratingMedia(false); return; }
        setMediaResult({ type: "image", url: data.url });
        setGeneratingMedia(false);
      }
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : String(err));
      setGeneratingMedia(false);
    }
  };

  const handleHistorySelect = (entry: HistoryEntry) => {
    // Migrate legacy GPT model rows that predate the GPT Image consolidation.
    const rawTarget = entry.output_target as string;
    const normalizedTarget: OutputTarget =
      rawTarget === "gpt_image_1_5" || rawTarget === "gpt_image_2"
        ? "gpt_image"
        : (rawTarget as OutputTarget);
    const targetExists = OUTPUT_TARGETS.some(
      (t) => t.value === normalizedTarget
    );
    const finalTarget: OutputTarget = targetExists
      ? normalizedTarget
      : "nano_banana";
    const finalTargetDef = OUTPUT_TARGETS.find((t) => t.value === finalTarget)!;
    const isVideoHistoryEntry = finalTargetDef.type.includes("video");

    // Pick a model whose promptTarget matches the restored entry's outputTarget.
    const candidateModels = isVideoHistoryEntry ? VIDEO_MODELS : IMAGE_MODELS;
    const matchingModel =
      candidateModels.find((m) => m.promptTarget === finalTarget) ??
      candidateModels[0];
    const nextModelId = matchingModel?.id ?? (isVideoHistoryEntry ? VIDEO_MODELS[0]?.id : IMAGE_MODELS[0]?.id) ?? mediaModel;

    const validModes = MODES.filter((m) => isVideoHistoryEntry ? m.videoOnly : !m.videoOnly);
    const nextMode: Mode =
      validModes.find((m) => m.value === entry.mode)?.value ??
      validModes.find((m) => m.value === "place_product")?.value ??
      validModes[0]?.value ??
      (entry.mode as Mode);

    setMediaModel(nextModelId);
    setMode(nextMode);
    setBrandSlug(entry.brand_slug);
    setInstruction(entry.instruction);
    setGeneratedPrompt(entry.generated_prompt);
    setCurrentHistoryId(entry.id);
    setCurrentStatus(entry.status ?? null);
    setCurrentNotes(entry.notes ?? "");
    try {
      setCurrentTags(entry.tags ? (JSON.parse(entry.tags) as string[]) : []);
    } catch {
      setCurrentTags([]);
    }
    setFeedbackOpen(false);
    setHistoryOpen(false);
  };

  if (mounted && hasApiKey === false) {
    return <SetupScreen />;
  }

  const productCategories = getProductCategories(products);
  const visibleProducts = products.filter((p) =>
    productMatchesFilters(p, productSearch, productCategoryFilter)
  );
  // Always show selected products even if they don't match the current filters
  const selectedNotVisible = products.filter(
    (p) => selectedProductIds.includes(p.id) && !visibleProducts.some((v) => v.id === p.id)
  );
  const productListItems = [...selectedNotVisible, ...visibleProducts];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gradient">Wondr Forge</h1>
          <p className="text-xs text-muted">
            Forge AI images and videos with brand-aware prompts.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          {currentUser.isAdmin && (
            <button
              onClick={() => setShowRuleEditor(true)}
              className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-lg hover:bg-card-hover transition-colors"
            >
              Rules
            </button>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-lg hover:bg-card-hover transition-colors"
          >
            History
          </button>
          <button
            onClick={() => setInsightsOpen(true)}
            className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm border border-border rounded-lg hover:bg-card-hover transition-colors"
            title="Aggregate ratings, tags, and provenance"
          >
            Insights
          </button>
          <div className="flex items-center gap-2 pl-3 ml-1 border-l border-border">
            <span
              className="text-xs text-muted hidden sm:inline"
              title={currentUser.email}
            >
              {currentUser.email.split("@")[0]}
              {currentUser.isAdmin && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent/20 text-accent text-[10px] uppercase tracking-wide">
                  admin
                </span>
              )}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-2 py-1 text-xs text-muted hover:text-foreground transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        
        {/* Advanced Settings Accordion */}
        <details className="group bg-card border border-border rounded-xl shadow-sm transition-all open:shadow-md">
          <summary className="text-sm font-semibold cursor-pointer select-none flex items-center justify-between text-foreground p-4">
            Advanced Settings & Configuration
            <span className="text-muted group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="p-4 pt-0 space-y-5 border-t border-border mt-2">
            {/* Row 1: Model + Mode + Char Budget */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Generation Model</label>
            <select
              value={mediaModel}
              onChange={(e) => handleMediaModelChange(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <optgroup label="— Image models —">
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.provider}
                  </option>
                ))}
              </optgroup>
              <optgroup label="— Video models —">
                {VIDEO_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.provider}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-muted mt-1">
              {selectedMediaModelDef?.priceNote ?? ""} · prompt limit: {charLimit.soft}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Mode</label>
            <select
              value={mode}
              onChange={(e) => handleModeChange(e.target.value as Mode)}
              disabled={availableModes.length === 1}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-60"
            >
              {availableModes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Prompt character budget</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={100}
                max={charLimit.hard}
                step={50}
                value={promptCharBudget}
                onChange={(e) => setPromptCharBudget(Number(e.target.value))}
                className="flex-1 accent-accent h-2 bg-card border border-border rounded-lg appearance-none cursor-pointer"
              />
              <input
                type="number"
                min={100}
                max={charLimit.hard}
                step={50}
                value={promptCharBudget}
                onChange={(e) => {
                  const v = Math.min(charLimit.hard, Math.max(100, Number(e.target.value) || 100));
                  setPromptCharBudget(v);
                }}
                className="w-20 bg-background border border-border rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:border-accent shrink-0"
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              Target length for generated prompt. Hard ceiling: {charLimit.hard} chars.
            </p>
          </div>

        </div>

        {/* Row 1a: Veo audio toggle */}
        {outputTarget === "veo" && (
          <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
              className="accent-accent w-4 h-4 rounded"
            />
            <span>Include audio/sound design cues in prompt</span>
            <span className="text-[11px] text-muted">
              (Veo 3 can generate synchronized audio)
            </span>
          </label>
        )}

        {/* Row 1b: Brand Profile */}
        <div>
          <label className="text-sm font-medium block mb-1.5">
            Brand Profile
          </label>
          <div className="flex gap-2 max-w-md">
            <select
              value={brandSlug || ""}
              onChange={(e) => {
                setBrandSlug(e.target.value || null);
                setSelectedProductIds([]);
                setProductPicks([]);
              }}
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setEditingBrand(null);
                setShowBrandModal(true);
              }}
              className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-card-hover transition-colors shrink-0"
              title="Add new brand"
            >
              +
            </button>
            {brandSlug && canEditBrand(brandSlug) && (
              <button
                onClick={() => {
                  const b = brands.find((br) => br.slug === brandSlug);
                  if (!b) return;
                  setEditingBrand(b);
                  setShowBrandModal(true);
                }}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-card-hover transition-colors shrink-0"
                title="Edit selected brand"
              >
                Edit
              </button>
            )}
          </div>
          {brandSlug && !canEditBrand(brandSlug) && (
            <p className="text-[11px] text-muted mt-1">
              <span className="px-1.5 py-0.5 rounded bg-card-hover text-muted/80 mr-1.5">Locked</span>
              Admin-only — generate prompts as usual, but the profile can&apos;t be edited.
            </p>
          )}
          {brandSlug && brandSpendMonthUsd !== null && (
            <p className="text-[11px] text-muted mt-1">
              <span
                className="px-1.5 py-0.5 rounded bg-card-hover mr-1.5"
                title={
                  brandSpendSource === "provider"
                    ? "From provider billing"
                    : brandSpendSource === "computed"
                      ? "Estimated from model pricing — provider total not available"
                      : brandSpendSource === "mixed"
                        ? "Mix of provider-billed and estimated rows"
                        : "No spend yet this month"
                }
              >
                ${brandSpendMonthUsd.toFixed(2)} this month
                {brandSpendSource === "computed" && " (est)"}
                {brandSpendSource === "mixed" && " (~)"}
              </span>
              <a href="/usage" className="underline hover:text-fg">View usage</a>
            </p>
          )}
        </div>

        {/* Row 1c: Product */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium">
              Product
              {selectedProductIds.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted">
                  {selectedProductIds.length} selected
                </span>
              )}
            </label>
            {currentUser.isAdmin && brandSlug && (
              <button
                onClick={() => setShowProductModal(true)}
                className="px-2.5 py-1 text-xs border border-border rounded-lg hover:bg-card-hover transition-colors"
                title="Manage product library"
              >
                Manage
              </button>
            )}
          </div>
          {!brandSlug ? (
            <p className="text-[11px] text-muted">Select a brand above to load its products.</p>
          ) : (
            <div className="space-y-2 max-w-md">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products…"
                  className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
                {productCategories.length > 0 && (
                  <select
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                    className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">All categories</option>
                    {productCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {products.length === 0 ? (
                <p className="text-[11px] text-muted">No products yet — add some via Manage.</p>
              ) : productListItems.length === 0 ? (
                <p className="text-[11px] text-muted">No products match these filters.</p>
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                  {productListItems.map((p) => {
                    const checked = selectedProductIds.includes(p.id);
                    const pick = productPicks.find((x) => x.productId === p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-card-hover transition-colors text-sm ${checked ? "bg-card-hover" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleProductToggle(p.id)}
                          className="accent-accent shrink-0"
                        />
                        <span className="flex-1 truncate">{p.name}</span>
                        {p.images.length > 1 && (
                          <span
                            className="text-[10px] text-muted shrink-0"
                            title={`${p.images.length} reference images — AI picks the best one per generation`}
                          >
                            {p.images.length} imgs
                          </span>
                        )}
                        {checked && pick && (
                          <span
                            className="text-[10px] text-accent shrink-0"
                            title={pick.reason}
                          >
                            {pick.picked ? `→ ${pick.label}` : `default: ${pick.label}`}
                          </span>
                        )}
                        {p.categories.length > 0 && !pick && (
                          <span className="text-[10px] text-muted shrink-0">
                            {p.categories.join(", ")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
              {selectedProductIds.length > 0 && (
                <p className="text-[11px] text-muted">
                  {selectedProductIds.length === 1
                    ? "1 product selected. The AI picks the best reference image based on your instruction."
                    : `${selectedProductIds.length} products selected — all will appear in the final image. The AI picks the best reference per product.`}
                </p>
              )}
            </div>
          )}
        </div>
          </div>
        </details>

        {/* Media Inputs & Prompt Workspace */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-6">
          {/* Row 2: Image Upload Zones */}
        <div className="flex gap-4 flex-col sm:flex-row">
          {mode === "text_to_image" || mode === "text_to_video" ? (
            <ImageUploadZone
              label="Style References (optional)"
              sublabel="Images or videos used only as style hints — color, lighting, mood, composition. Their contents won't be copied into the prompt."
              files={primaryImages}
              onFilesChange={setPrimaryImages}
              accept="image/*,video/*"
              onCrop={(file) => setCropTarget({ file, zone: "primary" })}
            />
          ) : mode === "animate_keyframes" ? (
            <>
              <ImageUploadZone
                label="First Frame"
                sublabel="The starting image — where the animation begins"
                files={firstFrameImage}
                onFilesChange={(files) => setFirstFrameImage(files.slice(-1))}
                onPaint={(file) => setPaintTarget({ file, zone: "first_frame" })}
                onCrop={(file) => setCropTarget({ file, zone: "first_frame" })}
              />
              <ImageUploadZone
                label="Last Frame"
                sublabel="The ending image — where the animation arrives"
                files={lastFrameImage}
                onFilesChange={(files) => setLastFrameImage(files.slice(-1))}
                onPaint={(file) => setPaintTarget({ file, zone: "last_frame" })}
                onCrop={(file) => setCropTarget({ file, zone: "last_frame" })}
              />
              <ImageUploadZone
                label="Reference Images/Videos"
                sublabel="Style or scene references"
                files={referenceImages}
                onFilesChange={setReferenceImages}
                accept="image/*,video/*"
                onPaint={(file) => setPaintTarget({ file, zone: "reference" })}
                onCrop={(file) => setCropTarget({ file, zone: "reference" })}
              />
            </>
          ) : (
            <>
              <ImageUploadZone
                label={
                  mode === "video_backdrop"
                    ? "Video Clips"
                    : "Primary Images"
                }
                sublabel={
                  mode === "video_backdrop"
                    ? "Upload each 5-second clip — a frame will be extracted for analysis"
                    : "Images to be edited/animated"
                }
                files={primaryImages}
                onFilesChange={setPrimaryImages}
                accept={mode === "video_backdrop" ? "video/*,image/*" : undefined}
                onPaint={
                  mode === "video_backdrop"
                    ? undefined
                    : (file) => setPaintTarget({ file, zone: "primary" })
                }
                onCrop={(file) => setCropTarget({ file, zone: "primary" })}
                showOrderBadge={mode === "video_backdrop"}
              />
              <ImageUploadZone
                label={
                  mode === "video_backdrop"
                    ? "Environment References"
                    : "Reference Images/Videos"
                }
                sublabel={
                  mode === "video_backdrop"
                    ? "Optional — photos of the desired background look"
                    : "Style or scene references"
                }
                files={referenceImages}
                onFilesChange={setReferenceImages}
                accept="image/*,video/*"
                onPaint={
                  mode === "video_backdrop"
                    ? undefined
                    : (file) => setPaintTarget({ file, zone: "reference" })
                }
                onCrop={(file) => setCropTarget({ file, zone: "reference" })}
              />
            </>
          )}
        </div>

        {/* Row 3: Instruction */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium">
              Describe what you want
            </label>
            <div className="flex items-center gap-2" ref={templateDropdownRef}>
              <div className="relative">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-2 py-1 text-xs border border-border rounded-md hover:bg-card-hover transition-colors flex items-center gap-1"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h7"
                    />
                  </svg>
                  Templates
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-full mt-1 w-[min(22rem,calc(100vw-1.5rem))] bg-card border border-border rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
                    {templates.length === 0 ? (
                      <p className="text-xs text-muted p-3 text-center">
                        No templates yet
                      </p>
                    ) : (
                      Array.from(
                        templates.reduce((map, t) => {
                          if (!map.has(t.category)) map.set(t.category, []);
                          map.get(t.category)!.push(t);
                          return map;
                        }, new Map<string, typeof templates>())
                      ).map(([category, items]) => (
                        <div key={category}>
                          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                            {category}
                          </div>
                          {items.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-card-hover group"
                            >
                              <button
                                onClick={() => {
                                  setInstruction((prev) =>
                                    prev.trim()
                                      ? prev.trimEnd() + ", " + t.instruction
                                      : t.instruction
                                  );
                                }}
                                className="text-sm text-left flex-1 truncate"
                                title={t.instruction}
                              >
                                {t.name}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTemplate(t.id);
                                }}
                                className="text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              {instruction.trim() && (
                <button
                  onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                  className="px-2 py-1 text-xs border border-border rounded-md hover:bg-card-hover transition-colors"
                  title="Save current instruction as template"
                >
                  Save
                </button>
              )}
            </div>
          </div>
          {showSaveTemplate && (
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Name..."
                  className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                  autoFocus
                />
                <input
                  type="text"
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                  placeholder="Category..."
                  list="template-categories"
                  className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                />
                <datalist id="template-categories">
                  {Array.from(new Set(templates.map((t) => t.category))).map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveTemplate}
                  disabled={!templateName.trim() || !templateCategory.trim()}
                  className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveTemplate(false);
                    setTemplateName("");
                    setTemplateCategory("");
                  }}
                  className="px-3 py-1.5 text-xs border border-border rounded-md hover:bg-card-hover"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            placeholder="Place the bottle in a misty Nordic forest at golden hour, bottle in bottom-right corner, soft diffused light through pine trees..."
            className="w-full bg-card border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <span className="text-[11px] text-muted">
              {"⌘"}+Enter to generate
            </span>
            <span className="text-[11px] text-muted">
              {instruction.length} characters
            </span>
          </div>
        </div>

        {/* Row 4: Generate Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={generating || generatingVariants}
            className="flex-1 py-3 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {generating
              ? usedModel
                ? `Generating via ${usedModel}...`
                : "Connecting..."
              : "Generate Prompt"}
          </button>
          <button
            onClick={handleGenerateVariants}
            disabled={generating || generatingVariants}
            className="px-5 py-3 rounded-lg border-2 border-accent text-accent hover:bg-accent hover:text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
          >
            {generatingVariants ? "Generating..." : "3 Variations"}
          </button>
          <button
            onClick={handleReset}
            disabled={generating || generatingVariants}
            className="px-4 py-3 rounded-lg border border-border text-muted hover:text-foreground hover:border-border-hover font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            title="Clear images, instruction, and output"
          >
            Reset
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            ref={errorRef}
            className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {/* Row 5: Output */}
        {generatedPrompt && (
          <div ref={outputRef} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium">Generated Prompt</h2>
                {usedModel && (
                  <span className="text-[10px] text-muted font-mono">
                    via {usedModel}
                  </span>
                )}
                {!clipPrompts && (
                  <span
                    className={`text-[10px] font-mono ${
                      overLimit ? "text-danger" : "text-muted"
                    }`}
                    title={
                      overLimit
                        ? `Over the ${charLimit.hard}-character limit for ${selectedMediaModelDef?.name ?? outputTarget}`
                        : `Limit: ${charLimit.soft}`
                    }
                  >
                    {promptLength} / {charLimit.hard}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {clipPrompts ? (
                  <button
                    onClick={handleCopyAllClips}
                    className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover transition-colors"
                  >
                    {copied ? "Copied!" : "Copy All"}
                  </button>
                ) : (
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={generating || generatingVariants || refining}
                  className="px-3 py-1 text-xs border border-border rounded-md hover:bg-card-hover transition-colors disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            </div>
            {currentHistoryId && !generating && !generatingVariants && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted">Outcome:</span>
                  <button
                    onClick={() => handleStatus("used")}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      currentStatus === "used"
                        ? "bg-green-600/20 text-green-400 border border-green-600/40"
                        : "border border-border text-muted hover:text-green-400 hover:border-green-600/40"
                    }`}
                    title="Used this prompt — it produced a good result downstream"
                  >
                    Worked
                  </button>
                  <button
                    onClick={() => handleStatus("discarded")}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      currentStatus === "discarded"
                        ? "bg-red-600/20 text-red-400 border border-red-600/40"
                        : "border border-border text-muted hover:text-red-400 hover:border-red-600/40"
                    }`}
                    title="Discarded — regenerated or threw this out"
                  >
                    Redo
                  </button>
                  <button
                    onClick={() => setFeedbackOpen(!feedbackOpen)}
                    className="ml-auto px-2 py-0.5 text-[11px] border border-border rounded text-muted hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    Feedback {feedbackOpen ? "▴" : "▾"}
                    {!feedbackOpen && (currentTags.length > 0 || currentNotes.trim()) && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                  </button>
                </div>
                {feedbackOpen && (
                  <div className="bg-card border border-border rounded-lg p-3 space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-muted">What happened?</div>
                      <div className="flex flex-wrap gap-1.5">
                        {FEEDBACK_TAGS.map((tag) => {
                          const active = currentTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              onClick={() => handleToggleTag(tag)}
                              className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
                                active
                                  ? "bg-accent/20 text-accent border border-accent/40"
                                  : "border border-border text-muted hover:text-foreground"
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-muted">Notes (saves automatically)</div>
                      <textarea
                        value={currentNotes}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        placeholder="What worked, what didn't, what you'd change next time..."
                        rows={2}
                        className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-xs leading-relaxed resize-y focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {variants.length > 0 && (
              <div className="flex gap-1">
                {variants.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => handleVariantClick(i)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                      activeVariant === i
                        ? "bg-accent text-white"
                        : "border border-border hover:bg-card-hover"
                    }`}
                  >
                    Variant {i + 1}
                    {generatingVariants && !v && (
                      <span className="animate-pulse">...</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {clipPrompts ? (
              <div className="space-y-3">
                {clipPrompts.map((clip, i) => {
                  const clipLen = clip.length;
                  const clipOver = clipLen > charLimit.hard;
                  return (
                    <div
                      key={i}
                      className="border border-border rounded-lg overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-3 py-2 bg-card-hover/50 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">
                            Clip {i + 1}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${
                              clipOver ? "text-danger" : "text-muted"
                            }`}
                          >
                            {clipLen} / {charLimit.hard}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyClip(clip)}
                          className="px-2 py-0.5 text-[11px] border border-border rounded hover:bg-card-hover transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <textarea
                        value={clip}
                        onChange={(e) =>
                          updateClipPrompt(i, e.target.value)
                        }
                        readOnly={
                          generating || generatingVariants || refining
                        }
                        className={`w-full bg-card p-3 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:border-accent ${
                          generating || generatingVariants || refining
                            ? "opacity-70 cursor-wait"
                            : ""
                        }`}
                        rows={Math.max(
                          3,
                          clip.split("\n").length + 1
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={generatedPrompt}
                onChange={(e) => setGeneratedPrompt(e.target.value)}
                readOnly={generating || generatingVariants || refining}
                className={`w-full bg-card border border-border rounded-lg p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none focus:border-accent ${
                  generating || generatingVariants || refining
                    ? "opacity-70 cursor-wait"
                    : ""
                }`}
                rows={Math.max(4, generatedPrompt.split("\n").length + 2)}
              />
            )}
            {/* Smart Refinement */}
            {!generating && !generatingVariants && generatedPrompt && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span className="text-[11px] text-muted self-center">
                    Refine:
                  </span>
                  {[
                    "Make shorter",
                    "More detail on lighting",
                    "More vivid language",
                    "Focus on the product",
                    "Simplify",
                  ].map((label) => (
                    <button
                      key={label}
                      onClick={() => handleRefine(label)}
                      disabled={refining}
                      className="px-2.5 py-1 text-[11px] border border-border rounded-md hover:bg-card-hover hover:border-accent transition-colors disabled:opacity-50"
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowRefineInput(!showRefineInput)}
                    disabled={refining}
                    className="px-2.5 py-1 text-[11px] border border-border rounded-md hover:bg-card-hover hover:border-accent transition-colors disabled:opacity-50"
                  >
                    Custom...
                  </button>
                  {refining && (
                    <span className="text-[11px] text-accent self-center animate-pulse">
                      Refining...
                    </span>
                  )}
                </div>
                {showRefineInput && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refineInstruction}
                      onChange={(e) => setRefineInstruction(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && refineInstruction.trim()) {
                          handleRefine(refineInstruction);
                        }
                      }}
                      placeholder="e.g. Add more camera motion detail, remove style keywords..."
                      className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRefine(refineInstruction)}
                      disabled={!refineInstruction.trim() || refining}
                      className="px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent-hover disabled:opacity-50"
                    >
                      Refine
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Row 6: Generate Media */}
        {generatedPrompt && !generating && !generatingVariants && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                {isVideoTarget ? "Generate Video" : "Generate Image"}
              </h2>
              <span className="text-[10px] text-muted">
                {selectedMediaModelDef?.name ?? mediaModel} · {selectedMediaModelDef?.provider ?? ""} · {selectedMediaModelDef?.priceNote ?? ""} · via OpenRouter
              </span>
            </div>

            {/* Settings row */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-muted">Aspect:</label>
                <select
                  value={mediaAspectRatio}
                  onChange={(e) => setMediaAspectRatio(e.target.value)}
                  className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                >
                  {["9:16", "4:5", "16:9", "5:4", "1:1"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {isVideoTarget && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-muted">Duration:</label>
                  <select
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(Number(e.target.value))}
                    className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  >
                    {[5, 8, 10, 15].map((d) => (
                      <option key={d} value={d}>{d}s</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerateMedia}
              disabled={generatingMedia}
              className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {generatingMedia
                ? isVideoTarget
                  ? videoJobStatus === "pending"
                    ? "Queued..."
                    : videoJobStatus === "in_progress"
                    ? "Generating..."
                    : "Processing..."
                  : "Generating..."
                : isVideoTarget
                ? "Generate Video"
                : "Generate Image"}
            </button>

            {/* Error */}
            {mediaError && (
              <div className="bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 text-xs text-danger">
                {mediaError}
              </div>
            )}

            {/* Result */}
            {mediaResult && (
              <div className="space-y-2">
                <div className="border border-border rounded-lg overflow-hidden">
                  {mediaResult.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaResult.url}
                      alt="Generated image"
                      className="w-full h-auto block"
                    />
                  ) : (
                    <video
                      src={mediaResult.url}
                      controls
                      className="w-full h-auto block"
                    />
                  )}
                </div>
                <a
                  href={mediaResult.url}
                  download={mediaResult.type === "image" ? "generated-image.png" : "generated-video.mp4"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-md hover:bg-card-hover transition-colors"
                >
                  ↓ Download
                </a>
              </div>
            )}
          </div>
        )}
        </div>
      </main>

      {/* Modals */}
      {showRuleEditor && (
        <RuleEditor onClose={() => setShowRuleEditor(false)} />
      )}

      {showBrandModal && (
        <BrandModal
          onClose={() => {
            setShowBrandModal(false);
            setEditingBrand(null);
          }}
          onSaved={(brand) => {
            setBrands((prev) => {
              const idx = prev.findIndex((b) => b.slug === brand.slug);
              if (idx === -1) return [...prev, brand];
              const next = prev.slice();
              next[idx] = brand;
              return next;
            });
            setBrandSlug(brand.slug);
            setShowBrandModal(false);
            setEditingBrand(null);
          }}
          existingBrand={editingBrand ?? undefined}
        />
      )}

      {showProductModal && currentUser.isAdmin && brandSlug && (
        <ProductManagerModal
          products={products}
          brandSlug={brandSlug}
          onChange={setProducts}
          onClose={() => setShowProductModal(false)}
        />
      )}

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleHistorySelect}
      />

      <InsightsPanel
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
      />

      {paintTarget && (
        <PaintEditor
          file={paintTarget.file}
          onClose={() => setPaintTarget(null)}
          onSave={(updated) => {
            const apply = (list: UploadedFile[]) =>
              list.map((f) => (f.id === updated.id ? updated : f));
            if (paintTarget.zone === "primary") {
              setPrimaryImages((prev) => apply(prev));
            } else if (paintTarget.zone === "first_frame") {
              setFirstFrameImage((prev) => apply(prev));
            } else if (paintTarget.zone === "last_frame") {
              setLastFrameImage((prev) => apply(prev));
            } else {
              setReferenceImages((prev) => apply(prev));
            }
            setPaintTarget(null);
          }}
        />
      )}

      {cropTarget && (
        <CropEditor
          file={cropTarget.file}
          onClose={() => setCropTarget(null)}
          onSave={(updated) => {
            const apply = (list: UploadedFile[]) =>
              list.map((f) => (f.id === updated.id ? updated : f));
            if (cropTarget.zone === "primary") {
              setPrimaryImages((prev) => apply(prev));
            } else if (cropTarget.zone === "first_frame") {
              setFirstFrameImage((prev) => apply(prev));
            } else if (cropTarget.zone === "last_frame") {
              setLastFrameImage((prev) => apply(prev));
            } else {
              setReferenceImages((prev) => apply(prev));
            }
            setCropTarget(null);
          }}
        />
      )}
    </div>
  );
}
