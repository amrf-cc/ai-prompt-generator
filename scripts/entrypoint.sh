#!/usr/bin/env bash
# Idempotent boot script for the Fly.io deploy.
#
# On first boot the persistent volume mounted at /app/data is empty, so we
# seed it from the read-only copies baked into the image (brands.seed/,
# config.seed/). On subsequent boots we leave existing files alone so admin
# edits persist across redeploys.
#
# Set BRAND_RESEED=1 to force-overwrite the locked brand profiles (default:
# chip-city) from the seed copy. Useful when shipping an updated guideline
# PDF or new style references.
#
# Set CONFIG_RESEED=1 to force-overwrite the locked config files (default:
# prompt-rules.json, model-preferences.json) from the seed copy. The previous
# version is saved alongside as `<name>.bak.<timestamp>`. Use this when a new
# rule block / model fallback ships in the repo and needs to land on the
# volume — admin edits made via the in-app rule editor will be replaced.
# `prompt-templates.json` is intentionally excluded so user-saved templates
# survive a reseed.
set -euo pipefail

: "${DATA_DIR:=/app/data/data}"
: "${BRANDS_DIR:=/app/data/brands}"
: "${CONFIG_DIR:=/app/data/config}"
: "${UPLOADS_DIR:=/app/data/uploads}"
: "${LOCKED_BRAND_SLUGS:=chip-city}"
: "${LOCKED_CONFIG_FILES:=prompt-rules.json model-preferences.json}"

mkdir -p "$DATA_DIR" "$BRANDS_DIR" "$CONFIG_DIR" "$UPLOADS_DIR"

SEED_BRANDS="/app/brands.seed"
SEED_CONFIG="/app/config.seed"

if [ -d "$SEED_BRANDS" ]; then
  for src in "$SEED_BRANDS"/*; do
    [ -d "$src" ] || continue
    slug="$(basename "$src")"
    dest="$BRANDS_DIR/$slug"

    if [ ! -d "$dest" ]; then
      echo "[entrypoint] seeding brand: $slug"
      cp -R "$src" "$dest"
      continue
    fi

    if [ "${BRAND_RESEED:-0}" = "1" ]; then
      # Only force-reseed locked brands so we don't clobber user-uploaded brands
      # that happen to share a slug with the seed.
      case ",$LOCKED_BRAND_SLUGS," in
        *,"$slug",*)
          echo "[entrypoint] BRAND_RESEED=1 — refreshing locked brand: $slug"
          rm -rf "$dest"
          cp -R "$src" "$dest"
          ;;
      esac
    fi
  done
fi

if [ -d "$SEED_CONFIG" ]; then
  for src in "$SEED_CONFIG"/*; do
    [ -f "$src" ] || continue
    name="$(basename "$src")"
    dest="$CONFIG_DIR/$name"

    if [ ! -f "$dest" ]; then
      echo "[entrypoint] seeding config: $name"
      cp "$src" "$dest"
      continue
    fi

    if [ "${CONFIG_RESEED:-0}" = "1" ]; then
      # Only force-reseed locked config files so user data (e.g. saved
      # prompt templates) survives a refresh.
      case " $LOCKED_CONFIG_FILES " in
        *" $name "*)
          ts="$(date +%Y%m%d-%H%M%S)"
          backup="${dest}.bak.${ts}"
          echo "[entrypoint] CONFIG_RESEED=1 — refreshing locked config: $name (backup: $(basename "$backup"))"
          cp "$dest" "$backup"
          cp "$src" "$dest"
          ;;
      esac
    fi
  done
fi

echo "[entrypoint] starting Next.js standalone server on :${PORT:-3000}"
exec node server.js
