# Real-Image Review Example

This dataset is for public app screenshots and walkthroughs, not model accuracy
benchmarks. It pairs a real photograph with an explicitly illustrative caption:
"A rover is visible on rocky terrain." A reviewer can verify that claim directly
from the rover body, camera mast, wheels, and rocky ground in the image.

## Source And Credit

- Image: PIA19808, Looking Up at Mars Rover Curiosity in 'Buckskin' Selfie.
- Source: https://www.jpl.nasa.gov/images/pia19808-looking-up-at-mars-rover-curiosity-in-buckskin-selfie/
- Original JPEG: https://d2pn8kiwq2w21t.cloudfront.net/original_images/jpegPIA19808.jpg
- Credit: NASA/JPL-Caltech/MSSS.
- Image use policy: https://www.jpl.nasa.gov/jpl-image-use-policy/
- Original image SHA-256: `74f979e92230993f37142fc3fb19c7e6f1101a0dd901493f81f832e8323ca2d9`.

The bundled JPEG is unchanged. It is third-party source material governed by the
linked image use policy, not relicensed under the repository's Apache license.
Its inclusion does not imply endorsement by NASA, JPL, Caltech, or MSSS.

## Capture

Run the demo with `MEDIEVAL_DEMO_PROFILE=showcase npm run demo`. For a native
capture, use `MEDIEVAL_SIMULATOR_DEMO_PROFILE=showcase npm run simulator:demo-smoke`
and set `MEDIEVAL_SIMULATOR_SCREENSHOT` to the desired output path. The CI workflow
supports a `showcase_only` manual run and uses this dataset for native screenshots.

The default `smoke` profile intentionally retains synthetic colored test images
for API tests. Never publish those as product screenshots. Inspect every native
capture before publication: photo loaded, claim matches the evidence, text fits,
no private data, and no fabricated model confidence or benchmark results.
