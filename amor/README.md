# Amor · Encuentros inesperados

Independent responsive AR-style collectible experience at `/bloques/amor/`, with the separate verifier at `/bloques/verificadoramor/`.

## Varieties and creatures

| Catalog variety | Character | Deployed artwork |
| --- | --- | --- |
| Rosé / Liso | Rosalía Terciopelo | `assets/rose.webp` |
| Thin / Extra Fino / Ultrafino | Nimbo Susurro | `assets/thin.webp` |
| Wild Dreams / Corrugado | Rulo Salvaje | `assets/dreams.webp` |
| Long Love | Don Sinprisa | `assets/longlove.webp` |
| Fruit / Color y Aroma | Tutti Frutti | `assets/fruit.webp` |

The five varieties are verified in [Amor's Uruguay catalog](https://preservativosamor.com/). No public sales ranking was found, so they are a catalog selection, not a substantiated top-five sales ranking. The downloaded reference photographs show the packaging versions supported by this detector; other package revisions may need additional training images.

## Recognition and play

Camera frames are analyzed locally in a Worker with bundled JSFeat. Each variety selects its own character. Characters are generated transparent 3D-style illustrations animated as sprites, not 3D meshes. First recognition shows the creature; two spatially consistent observations enable collection. Demo previews never add captures.

Because the Amor logo is identical across varieties, templates focus on the printed variety name/descriptor instead of the shared logo. The compiler rectifies the five source catalog photographs into front views and retains a second tilted reference for each label. ORB/RANSAC includes a projected appearance check; normalized correlation handles fallback matching with a margin between varieties. Color is not an identity requirement, but legible contrast and sufficient visible label detail are needed. Logo-only views or generic sachets are not enough to select a variety.

Use a well-lit, mostly flat package front without strong glare. References are low-resolution catalog images. Tests on transformed reference images are not an accuracy benchmark on physical packaging; a real phone/packaging field test remains pending.

## Independent persistence and QR

`amor_hunt_v1` is a cookie scoped to the Amor game path. Five species use mask `31`. Completion creates one persistent `PREMIO:AMOR:<UUID v4>` payload and QR GIF. Existing King Jr. cookies and assets are unchanged. The exact QR image is reused on reload, and Web Locks serialize cookie writes.

The Amor verifier accepts only AMOR codes, rejects KINGJR codes, and stores first-read timestamps under `amor_verifier_read_v1` in localStorage. A duplicate has no green tick. These are local format and duplicate checks, not server-side issuance/redemption authentication. Clearing browser data or changing browser/device bypasses local history.

## Design and artwork

Lavender, coral and mint; serif editorial headlines; asymmetrical hero; five-creature gallery; independent mobile/scanner styles. Amor logos link to the Uruguay catalog. Rodrigo Pisurno's LinkedIn appears in the hero, footer and collection, as well as the verifier.

Five artwork images were made with the built-in `image_gen` tool. Original transparent PNGs and deployment-optimized WebPs are in `assets/`. The exact final prompt for each is in [generation-prompts.json](assets/generation-prompts.json). No sexual anatomy or activity is depicted. Brand/product imagery comes from the catalog; this project does not make medical performance claims.

## Checks

Development dependencies: `sharp`, `playwright`; optional `NODE_PATH` points to an existing dependency directory. `CHROMIUM_PATH` optionally points to a Chromium executable.

```sh
node tools/compile-targets.cjs
node tests/detector.cjs
node tests/browser.cjs
node ../verificadoramor/tests/browser.cjs
```

Detector fixtures cover all five original catalog images, rectified fronts, grayscale, rotation and visible label crops. Negative fixtures include the common Amor logo, a blank image and every package with the variety obscured. Browser checks cover real Worker image detection, the matching five creatures, immediate appearance/capture confirmation, demo isolation, completion, persistent AMOR QR, no King Jr. cookie creation, attribution links and mobile layout. Verifier checks cover actual QR decoding, duplicates after reload, case normalization, concurrent tabs, invalid/foreign prefixes and storage failures.

## Credits

- Product references and Amor logo: https://preservativosamor.com/ (`img/logo_amor.png`, `img/productos/{liso,fino,corrugado,longlove,aroma}.jpg`). Brand marks remain their owners' property.
- JSFeat: bundled MIT license in `vendor/jsfeat.LICENSE.txt`.
- QR generator: Kazuhiko Arase, license included in `vendor/qrcode.js`.
- jsQR in the verifier: bundled `vendor/LICENSE-jsQR`.
- Creator attribution: [Rodrigo Pisurno](https://www.linkedin.com/in/rodrigo-pisurno-cremona-b57702a2/).
