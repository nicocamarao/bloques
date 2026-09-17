# King Jr. — Cazador de monstruos

Static GitHub Pages game. Open `index.html` over HTTPS and grant camera access.

## Brand encounters

| Visible logo | Existing creature |
| --- | --- |
| McDonald’s arches | McMonstruo |
| KFC lettering | Satán Sanders |
| Subway wordmark, SUB or WAY | Subterráneo Fernández |
| Domino’s tile | Don Minio |

The first positive detection shows the matching creature. Two consecutive spatially consistent detections enable capture. Switching brands selects the new creature directly, including after a capture; encounters are no longer random. The original animated artwork is retained (three image assets, four collection entries; Subway and McDonald’s share the original burger image). These are animated sprites, not 3D meshes.

## Recognition

- Local grayscale ORB/RANSAC plus normalized template correlation; camera frames never leave the device.
- References include both contrast polarities. Color is not a brand requirement: dark/light, monochrome and recolored prints can match as long as there is visible contrast.
- Full logos and explicit distinctive crops support printed packaging, including Subway SUB/WAY, KFC KF/FC, and upper McDonald’s arches. Modestly rotated template variants supplement feature matching for simple logos.
- A projected-image check rejects accidental feature matches. Partial templates use a stricter correlation threshold. Analysis stays in a Worker; artwork is preloaded.
- A product must have enough visible logo detail. This is not a general food classifier: a burger without branding, an arbitrary tiny fragment, strong folds, severe perspective, reflections or unreadable/low-contrast printing may not match. KFC's lettering is the reference, not the Colonel's face alone.

## Collection

The original scoped cookie, four-species collection and QR format remain compatible. Capture adds a species; demo never contributes. Completion encodes `PREMIO:KINGJR:<crypto UUID>` once. The exact QR image is retained in the cookie. Web Locks serialize writes across tabs. Client-only reward codes do not authenticate redemption; deleting/editing cookies can bypass persistence.

## Build and test

The site itself has no build step or new runtime dependencies. To rebuild references or run the development checks, install `sharp` and `playwright` in your development environment (or provide their directory through `NODE_PATH`):

```sh
node tools/compile-targets.cjs
node tests/detector.cjs
node tests/browser.cjs
```

`CHROMIUM_PATH` optionally selects an installed Chromium executable. The browser check starts an ephemeral localhost server and uses synthetic UI detections, not the physical camera. Detector checks use rasterized logos with recoloring, inverse contrast, rotation, blur and crops, plus unrelated letters/words and a blank frame. Browser checks cover Worker startup, demo isolation, immediate brand-specific appearance, capture confirmation, brand changes, all four captures and persistent QR reload. Physical phones and real packaging photographs have not been validated; synthetic checks are not a real-world accuracy benchmark.

Publish this independent folder at `/kingjr/` within `nicocamarao/bloques` on GitHub Pages. The application, Worker and target database use matching `brands-4` cache versions.

## Reference credits

- JSFeat by Eugene Zatepyakin (MIT, bundled license).
- QR Code Generator by Kazuhiko Arase (MIT, source license).
- McDonald’s and KFC vector references: [Simple Icons v13](https://github.com/simple-icons/simple-icons/tree/13.0.0/icons), CC0 project; brand trademarks belong to their owners.
- Subway: [Subway 2016 wordmark](https://commons.wikimedia.org/wiki/File:Subway_2016_logo.svg).
- Domino’s: [Domino’s pizza tile](https://commons.wikimedia.org/wiki/File:Domino%27s_pizza_logo.svg).
- Existing monster artwork is unchanged. Independent prototype.
