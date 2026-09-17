# Verificador King Jr.

Static GitHub Pages page at `/bloques/verificadorkingjr/`. Camera scanning uses the bundled jsQR library; manual input is available as a fallback. Camera frames remain on the device.

Accepts `PREMIO:KINGJR:` followed by a valid UUID v4, matching the game's generator. Surrounding whitespace and letter casing are normalized. A valid first read is saved before showing a green check and `OK`. A repeated identifier shows `Este ya había sido leído`, its first-read date and no check. Scanning pauses on each result until the operator chooses another scan.

Records persist under the `kingjr_verifier_read_v1` localStorage key. Web Locks serialize check-and-save operations between same-origin tabs. Invalid QR content is never stored. Storage errors, corrupted history or missing Web Locks fail without a green check. The verifier does not reset existing history automatically.

This validates format and local duplicate history only. It does not authenticate issuance or redemption. Clearing browser data, changing browser/device or editing storage bypasses the local history. No central registry is used.

Verified in Chromium: first read; duplicate after reload; case normalization; concurrent tabs; decoding an actual QR from the game's encoder; invalid input; unavailable/corrupt storage; no green check on unsuccessful results; mobile layout. Physical camera hardware has not been tested.

jsQR license is in `vendor/LICENSE-jsQR`.
