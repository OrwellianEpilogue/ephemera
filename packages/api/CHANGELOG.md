# @ephemera/api

## 1.4.0

### Minor Changes

- - feat: add email sending functionality for downloaded books
  - fix: stream book downloads and improve error handling
  - Merge remote-tracking branch 'origin/main' into feat/browser-downloads
  - Update README to explain AA_API_KEY requirement (#85)
  - feat: add filter for author and title (#76) (#86)
  - Update FLARESOLVERR_URL and healthcheck URL (#58)
  - feat: Add configurable API base path support (#70)
  - feat: add browser downloads

### Patch Changes

- Updated dependencies
  - @ephemera/shared@1.4.0

## 1.3.1

### Patch Changes

- - feat: build for arm64 (#37)
  - fix(booklore): Fix Booklore authenticate error (#36) by coryshaw1
- Updated dependencies
  - @ephemera/shared@1.3.1

## 1.3.0

### Minor Changes

- v1.3.0

  feat: expose newznab/sabnzbd APIs for usenet indexer tools like readarr (#32)

  fix: improve booklore error handling (#33)

### Patch Changes

- Updated dependencies
  - @ephemera/shared@1.3.0

## 1.2.2

### Patch Changes

- - feat: add manual queue clearing
  - feat: allow deleting downloads manually (#25)
  - fix: queue performance (#28)
  - fix: download cancelling race conditions (#27)
  - fix: book language detection and display (#26)
  - fix docker flaresolverr url defaults and healthchecks
  - fix 'search in descriptions and metadata' filter checkbox see #24
  - fix badge sizes when count > 9 see #23
- Updated dependencies
  - @ephemera/shared@1.2.2

## 1.2.1

### Patch Changes

- - fix imports
- Updated dependencies
  - @ephemera/shared@1.2.1

## 1.2.0

### Minor Changes

- - fix release script
  - fix docker build
  - Revert "chore: version packages"
  - chore: version packages
  - update changeset generator
  - improve changeset and release
  - feat: pwa and icons (#22)
  - feat: fetch libraries from booklore for library/path selection (#21)
  - feat: requests SSE streaming (#20)
  - feat: periodically delete search cache (#18)
  - feat: faster slow download option (#17)
  - feat: run prettier on save, reformat all files (#16)
  - feat: event notifications via apprise (#15)
  - feat: link to calibre/booklore library (#13)
  - show current version and update notification (#11)
  - feat: type safety, linting, pre-commit hooks (#10)
  - simple requests system for books not yet available (#6)
  - add retry button to errored downloads
  - improve dark mode colors
  - fix search cache labels
  - fix search button positioning
  - move flaresolverr to required env vars

### Patch Changes

- Updated dependencies
  - @ephemera/shared@1.2.0

## 1.1.7

### Patch Changes

- auto create .crawlee folder
- Updated dependencies
  - @ephemera/shared@1.1.7

## 1.1.6

### Patch Changes

- fix adduser check, fix download destination label
- Updated dependencies
  - @ephemera/shared@1.1.6

## 1.1.5

### Patch Changes

- don't mount .crawlee
- Updated dependencies
  - @ephemera/shared@1.1.5

## 1.1.4

### Patch Changes

- fix crawlee
- Updated dependencies
  - @ephemera/shared@1.1.4

## 1.1.3

### Patch Changes

- fix .crawlee settings folder
- Updated dependencies
  - @ephemera/shared@1.1.3

## 1.1.2

### Patch Changes

- fix .crawlee folder permissions
- Updated dependencies
  - @ephemera/shared@1.1.2

## 1.1.1

### Patch Changes

- fix uid, pid setup
- Updated dependencies
  - @ephemera/shared@1.1.1

## 1.1.0

### Minor Changes

- use flaresolverr for slow downloads

### Patch Changes

- Updated dependencies
  - @ephemera/shared@1.1.0

## 1.0.7

### Patch Changes

- fix crawlee folder
- Updated dependencies
  - @ephemera/shared@1.0.7

## 1.0.6

### Patch Changes

- fix crawlee data folder
- Updated dependencies
  - @ephemera/shared@1.0.6

## 1.0.5

### Patch Changes

- Fix groupmod install
- Add changesets for version management with synchronized versioning and automatic changelog generation
- Updated dependencies
- Updated dependencies
  - @ephemera/shared@1.0.5

## 1.0.4

### Patch Changes

- Removed Booklore token encryption, fix ingest file handling
- Updated dependencies
  - @ephemera/shared@1.0.4
