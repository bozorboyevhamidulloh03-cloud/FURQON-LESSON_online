# .fur format, version 1.0

A `.fur` file is a ZIP container. It is the authoritative, editable source of a lesson.

```
lesson.fur
  manifest.json          format, formatVersion, page list, asset list, per-file checksums
  metadata.json          title, author, created, modified
  pages/p-0001.json      one file per page: { id, type: "document"|"board", title, bg, view, objects[], blocks[] }
  assets/<id>.<ext>      images (png, jpg, webp, gif), later audio (mp3, wav) and video (mp4)
```

## Rules
1. `manifest.json` is the first entry. `format` must be `"fur"`; `formatVersion` is `major.minor`.
2. Reader accepts every minor of major 1 and the legacy 0.x files (migrated on open). A higher major is refused with a clear message.
3. Unknown fields and unknown object types are ignored, never fatal (forward compatibility).
4. `files` lists every payload file with `size`, `crc32` and, when available, `sha256`. A mismatch is reported as corruption.
5. Entries are deflate-compressed (method 8) or stored (method 0). Images are stored.
6. Pages are separate files so large lessons need not be loaded at once.
7. Object ids are stable strings (`[A-Za-z0-9_-]{1,64}`), a requirement for later collaboration (CRDT).

## Validation (import safety)
- Refused: path traversal (`..`, absolute paths, `\`, `:`), duplicate names, encrypted or ZIP64 archives, non-UTF-8 names.
- Limits: 5000 entries, 512 MB per entry, 1 GB total, 64 MB per JSON file, 200000 objects per page.
- Inflate is streamed and capped at the declared size (zip-bomb protection).
- Colours, numbers, text length and asset MIME types are sanitised on load.

## Saving
The app serialises the whole document and writes it in one IndexedDB transaction (metadata + bytes), so a save is all-or-nothing. A recovery copy is written 250 ms after each change and removed after a successful save.

---

## Update: version 1.1 (Stage 2, document pages)

Backward compatible with 1.0 and legacy 0.x (migrated on read). Unknown fields are ignored.

- Page `type: "document"` holds `blocks`, plus a document-level `layout`
  `{margin: narrow|normal|wide, header, footer, pageNumbers}` in `metadata.json`.
- **Run**: `{t, b, i, u, s, sup, sub, c (color), fs (size), ff (font), href}`. href allows http, https, mailto only.
- **TextBlock** `{type: heading|paragraph|li, level, list: bullet|ordered, indent 0-3, align, runs}`.
- **TableBlock** `{type:"table", header, rows: [[cell{runs}]]}`; rows are padded rectangular on read.
- **ImageBlock** `{type:"image", asset, w 5-100, align, caption runs}`; asset stored in `assets/`.
- Readers reject major > 1, path traversal, zip bombs, ZIP64/encrypted entries.

### Board pages (Stage 3, no format change)
`type:"board"` objects: `stroke {pts,c,w,hl}`, `line|arrow|rect|ellipse {x1,y1,x2,y2,c,w}`, `text {x,y,tx,s,c}` (`\n` = new line), `image {a,x,y,w,h}`. Array order = z-order (first is bottom). Page `view {s,x,y}` is the saved zoom/pan; `bg` is grid|white|dark.
