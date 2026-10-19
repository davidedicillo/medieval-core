import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const showcaseSource = {
  id: 'PIA19808',
  url: 'https://www.jpl.nasa.gov/images/pia19808-looking-up-at-mars-rover-curiosity-in-buckskin-selfie/',
  credit: 'NASA/JPL-Caltech/MSSS',
  sha256: '74f979e92230993f37142fc3fb19c7e6f1101a0dd901493f81f832e8323ca2d9',
};

export function loadShowcaseImage() {
  const bytes = readFileSync(new URL('../examples/showcase/curiosity-buckskin.jpg', import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== showcaseSource.sha256) {
    throw new Error('Showcase source photo does not match its verified checksum');
  }
  return bytes;
}

export function showcaseCard(baseURL) {
  const image = `${baseURL}/demo/showcase/curiosity.jpg`;
  return {
    schemaVersion: '1.0',
    cardId: 'showcase-curiosity-caption',
    cardType: 'binary_claim',
    question: 'Does this caption match the photo?',
    claim: { template: 'image_caption', path: 'caption', value: 'A rover is visible on rocky terrain.' },
    sourceKey: `nasa:${showcaseSource.id}`,
    priority: 'medium',
    confidence: null,
    subject: {
      title: 'Curiosity at Buckskin',
      url: showcaseSource.url,
      subtitle: `Photo: ${showcaseSource.credit}`,
      source: 'NASA/JPL Photojournal',
      metadata: { domain: 'image-caption verification', photoId: showcaseSource.id, exampleType: 'illustrative review question' },
    },
    images: [{ url: image, position: 1, source: showcaseSource.credit }],
    media: [{ url: image, type: 'image', label: 'Curiosity rover source photograph', position: 1, source: showcaseSource.credit }],
    analysisContext: {
      summary: 'Check the caption against the source photo. The rover body, camera mast, and wheels are visible on rocky ground.',
      model: 'human-authored example',
      provider: 'MediEval demonstration',
      analysisStage: 'illustrative review',
      warnings: ['Real source photograph; illustrative caption, not a model benchmark or customer result.'],
    },
    evidence: [{ source: 'image', detail: 'The rover body, camera mast, and wheels are visible on rocky ground.', confidence: null, imagePositions: ['1'] }],
  };
}
