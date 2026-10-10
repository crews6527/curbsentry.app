# Third-party notices

CurbSentry's original web interface was created with Grok. The exported project
was converted into a portable static React app; its original attribution remains
visible. No application license was supplied in the original upload.

The built app includes React and React DOM (MIT), Zustand (MIT), Lucide icons
(ISC), Tesseract.js (Apache-2.0), and Tesseract.js-core (Apache-2.0). Corresponding
license texts are retained in `licenses/`. The OCR build keeps only LSTM runtime
variants used by the scanner, with ordinary, SIMD, and relaxed-SIMD support.
React, React DOM and Scheduler have the same MIT notice, retained once as
`licenses/react-LICENSE.txt`.

`public/ocr/eng.traineddata.gz` is the unmodified English model from the installed
Debian `tesseract-ocr-eng` package, compressed with gzip. Its upstream source is
the Tesseract project's [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)
repository. Copyright 1988–1995 Hewlett Packard Company; 2006–2022 Google Inc.
Licensed under Apache-2.0. The package's copyright notice and the complete license
are included. SHA-256 of the uncompressed model is recorded in verification docs.

Tesseract integration follows its official [API documentation](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).
The local worker, core, and English data locations are set explicitly. Selected
video content is not sent to Tesseract's public CDNs or an external OCR provider.

Development tools retain their licenses in the installed dependency packages;
the lockfile records their resolved versions. Dependencies are not copied into
the source archive.

The desktop service invokes separately installed FFmpeg/ffprobe and Tesseract.
Their executables are not distributed in this repository or backup. The desktop
reader uses the same bundled English model as the browser reader.
