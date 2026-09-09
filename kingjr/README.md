# King Jr. — Cazador de monstruos

Static GitHub Pages game. Open `index.html` over HTTPS and grant camera access.

- The only target is the crown-and-Jr. logo from the supplied King Jr. box photograph.
- Local JSFeat ORB/RANSAC image tracking plus template matching; no camera frames are uploaded.
- Each stable encounter selects one of the four existing creatures uniformly using browser crypto. Repeats are possible. The creature stays fixed until the marker leaves view for at least 1.2 seconds and three analyzed frames.
- Capture adds a species to the four-item collection. Demo never contributes.
- One scoped cookie stores the collection, QR payload and exact GIF image for a year. No localStorage, database or server persistence.
- Completion automatically encodes `PREMIO:KINGJR:<crypto UUID>` in a QR. The payload is not printed in the UI. Reopening shows the same stored QR. Web Locks serialize updates across tabs. Cookies must be enabled.
- Client-only limitation: deleting/editing cookies, changing browser or crafting a payload can bypass this mechanism. The string PREMIO identifies the requested QR format; it does not authenticate a redemption or prevent repeated redemption. No server-side redemption validation is implemented.

## Hosting

This folder is independent of other games and uses relative URLs. Publish it at `/kingjr/` within the existing `nicocamarao/bloques` Pages site. No Sites dependencies or account-specific URLs are used.

## Checks performed

Full worker bootstrap without `window`; input logo detection; demo isolation; pinned random encounters and marker-removal gate; four-species completion; cookie write failure; concurrent reward generation and reload; independent QR decoding and cookie size (about 570 bytes). No physical camera test has been performed.

## Credits

JSFeat by Eugene Zatepyakin (MIT, bundled LICENSE). QR Code Generator by Kazuhiko Arase (MIT, license in source). Existing generated monster artwork and the user-supplied King Jr. reference. The four collection entries reuse the existing three artworks: the two burger species share the existing burger image. This is an independent prototype.
