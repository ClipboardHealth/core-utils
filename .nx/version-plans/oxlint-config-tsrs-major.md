---
oxlint-config: major
---

Use tsrs as the type-aware lint backend (#1024). The `oxlint` peer now requires `>=1.92.0`, and the optional `oxlint-tsgolint` peer is replaced by an optional `tsrs` peer (`>=0.21.0-ts7.1.0-beta`). To upgrade, move to oxlint `>=1.92.0` and replace `oxlint-tsgolint` with `tsrs`.
