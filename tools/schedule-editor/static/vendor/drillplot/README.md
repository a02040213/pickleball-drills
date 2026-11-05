# Vendored: drillplot

`editor.js` + `chunk-YDA6FYBE.js` are the `<drillplot-editor>` web component
from [drillplot](https://github.com/maikuru/drillplot) v0.2.0 (MIT, see
`LICENSE`), fetched from `https://maikuru.github.io/drillplot/dist/` and
vendored here so the schedule editor can embed the real editor same-origin
(no iframe, no cross-origin clipboard dance).

To update: re-fetch `dist/editor.js` and `dist/chunk-YDA6FYBE.js` from the
same URL (the chunk's hashed filename changes across releases — update the
import path at the top of `editor.js` and the filename here together if it
does) and overwrite these two files.
