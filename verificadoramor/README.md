# Verificador Amor

Published path: `/bloques/verificadoramor/`. Accepts `PREMIO:AMOR:<UUID v4>` only; `KINGJR` codes are rejected. QR scanning runs locally using bundled jsQR, with manual input available.

First valid read: persist the timestamp in `amor_verifier_read_v1` localStorage, then show OK with a green check. Duplicate: show “Este ya había sido leído” and its original timestamp, without a green check. Web Locks serialize concurrent tabs. Storage failure or corrupted history fails without showing OK. Camera scanning pauses after a result until the operator chooses the next scan.

The history belongs to this browser/origin; clearing storage or using another browser/device bypasses it. It validates format and local repetition, not genuine issuance or server-side redemption. King Jr. uses a separate storage key and is unaffected.

Run `node tests/browser.cjs` with Playwright installed. Optionally supply `CHROMIUM_PATH` and/or `NODE_PATH`. Physical camera testing is still pending.
