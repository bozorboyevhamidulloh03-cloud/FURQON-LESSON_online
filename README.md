# FUR Platform

Stage 1 (foundation): `.fur` format library, local file manager, autosave and crash recovery.

- `packages/fur-format` – format spec implementation (pure TypeScript, no dependencies, reusable on Windows/Web)
- `app` – installable offline web app (PWA); the same code will be wrapped as an Android APK
- `docs/FUR-SPEC.md` – format specification
- `scripts/build.sh` – typecheck + bundle to `dist/`; `scripts/e2e.cjs` – browser tests
