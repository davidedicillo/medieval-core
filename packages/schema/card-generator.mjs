import {
  evalCardSchemaVersion,
  normalizeBatchId,
  normalizeProjectId,
  slug,
  text,
} from './index.mjs';

const riskRatingFields = [
  'fireRiskRating',
  'fire_risk_rating',
  'riskRating',
  'risk_rating',
  'rating',
  'riskLevel',
  'risk_level',
  'score',
  'riskScore',
  'risk_score',
];

const addressFields = ['address', 'propertyAddress', 'property_address', 'siteAddress', 'site_address'];
const propertyIdFields = ['propertyId', 'property_id', 'parcelId', 'parcel_id', 'apn', 'id'];
const explanationFields = ['explanation', 'reason', 'rationale', 'modelReason', 'model_reason', 'summary'];
const evidenceFields = ['evidence', 'evidenceSummary', 'evidence_summary', 'supportingFacts', 'supporting_facts'];
const recommendationFields = ['recommendation', 'recommendations', 'mitigation', 'mitigationRecommendation', 'mitigation_recommendation'];
const confidenceFields = ['confidence', 'modelConfidence', 'model_confidence'];
const imageFields = ['imageUrl', 'image_url', 'photoUrl', 'photo_url', 'streetviewUrl', 'streetview_url'];
const urlFields = ['url', 'propertyUrl', 'property_url', 'sourceUrl', 'source_url'];

export function parseCsv(raw) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length || row.length) rows.push([...row, cell]);
  const nonEmptyRows = rows.filter((candidate) => candidate.some((value) => text(value)));
  if (!nonEmptyRows.length) return [];
  const headers = nonEmptyRows[0].map((value) => text(value));
  return nonEmptyRows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      if (header) record[header] = text(values[index]);
    });
    return record;
  });
}

export function parseJsonOrJsonl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function recordsFromText(raw, { format = 'auto' } = {}) {
  const normalizedFormat = text(format, 'auto').toLowerCase();
  if (normalizedFormat === 'csv') return parseCsv(raw);
  if (normalizedFormat === 'json' || normalizedFormat === 'jsonl') return parseJsonOrJsonl(raw);
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonOrJsonl(trimmed);
  return parseCsv(trimmed);
}

function firstValue(record, fields) {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  const lowerLookup = new Map(Object.entries(record ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  for (const field of fields) {
    const value = text(lowerLookup.get(field.toLowerCase()));
    if (value) return value;
  }
  return '';
}

function confidenceValue(record) {
  const value = Number(firstValue(record, confidenceFields));
  if (!Number.isFinite(value)) return null;
  if (value > 1 && value <= 100) return Math.round(value) / 100;
  if (value >= 0 && value <= 1) return value;
  return null;
}

function propertyIdentity(record, index) {
  const propertyId = firstValue(record, propertyIdFields);
  const address = firstValue(record, addressFields);
  const sourceKey = propertyId || address || `row-${index + 1}`;
  const title = address || propertyId || `Property ${index + 1}`;
  return { propertyId, address, sourceKey, title };
}

function mediaForRecord(record) {
  const imageUrl = firstValue(record, imageFields);
  if (!imageUrl) return [];
  return [{ url: imageUrl, type: 'image', label: 'Property image', position: 1, source: 'property' }];
}

function subjectForRecord(record, index) {
  const identity = propertyIdentity(record, index);
  const sourceUrl = firstValue(record, urlFields);
  return {
    title: identity.title,
    subtitle: identity.propertyId ? `Parcel ${identity.propertyId}` : 'Property fire-risk assessment',
    url: sourceUrl || null,
    source: 'myfire-rating',
    metadata: Object.fromEntries(Object.entries({
      propertyId: identity.propertyId,
      address: identity.address,
      latitude: firstValue(record, ['latitude', 'lat']),
      longitude: firstValue(record, ['longitude', 'lng', 'lon']),
    }).filter(([, value]) => text(value))),
  };
}

function baseCard(record, index, options, suffix) {
  const projectId = normalizeProjectId(options.projectId);
  const batchId = normalizeBatchId(options.batchId);
  const identity = propertyIdentity(record, index);
  const cardSourceKey = `${identity.sourceKey}:${suffix}`;
  return {
    schemaVersion: evalCardSchemaVersion,
    cardId: `${projectId}:${batchId}:${slug(cardSourceKey, `row-${index + 1}-${suffix}`)}`,
    cardType: 'binary_claim',
    sourceKey: identity.sourceKey,
    priority: text(record.priority, 'medium'),
    confidence: confidenceValue(record),
    subject: subjectForRecord(record, index),
    media: mediaForRecord(record),
    images: [],
    analysisContext: {
      summary: firstValue(record, explanationFields) || firstValue(record, evidenceFields) || '',
      model: firstValue(record, ['model', 'modelName', 'model_name']),
      provider: firstValue(record, ['provider', 'modelProvider', 'model_provider']),
      analysisStage: 'myfire-rating',
      warnings: [],
    },
    evidence: [],
  };
}

function evidenceItems(record) {
  const evidence = firstValue(record, evidenceFields);
  const reason = firstValue(record, explanationFields);
  const fields = [
    ['vegetation', 'Vegetation'],
    ['slope', 'Slope'],
    ['roof', 'Roof'],
    ['defensibleSpace', 'Defensible space'],
    ['defensible_space', 'Defensible space'],
    ['wildfireZone', 'Wildfire zone'],
    ['wildfire_zone', 'Wildfire zone'],
  ];
  const out = [];
  if (evidence) out.push({ source: 'source_record', detail: evidence, confidence: confidenceValue(record) });
  if (reason && reason !== evidence) out.push({ source: 'model_reason', detail: reason, confidence: confidenceValue(record) });
  for (const [field, label] of fields) {
    const value = text(record[field]);
    if (value) out.push({ source: field, detail: `${label}: ${value}`, confidence: null });
  }
  return out;
}

export function generateMyFireRatingCards(records, options = {}) {
  const cards = [];
  const warnings = [];
  records.forEach((record, index) => {
    const rating = firstValue(record, riskRatingFields);
    const explanation = firstValue(record, explanationFields);
    const evidence = firstValue(record, evidenceFields);
    const recommendation = firstValue(record, recommendationFields);
    if (!rating && !explanation && !evidence && !recommendation) {
      warnings.push(`row ${index + 1}: no rating, explanation, evidence, or recommendation field found`);
      return;
    }
    if (rating) {
      cards.push({
        ...baseCard(record, index, options, 'risk-rating'),
        question: 'Is the fire risk rating correct for this property?',
        claim: { template: 'myfire_risk_rating', path: 'fireRiskRating', value: rating },
        evidence: evidenceItems(record),
      });
    }
    if (explanation || evidence) {
      cards.push({
        ...baseCard(record, index, options, 'evidence-support'),
        question: 'Is the rating explanation supported by the available evidence?',
        claim: { template: 'myfire_evidence_support', path: explanation ? 'explanation' : 'evidence', value: explanation || evidence },
        evidence: evidenceItems(record),
      });
    }
    if (recommendation) {
      cards.push({
        ...baseCard(record, index, options, 'mitigation-recommendation'),
        question: 'Is the mitigation recommendation appropriate for this property?',
        claim: { template: 'myfire_mitigation_recommendation', path: 'recommendation', value: recommendation },
        evidence: evidenceItems(record),
      });
    }
  });
  return { cards, warnings };
}

export function generateGenericClaimCards(records, options = {}) {
  const cards = [];
  const warnings = [];
  records.forEach((record, index) => {
    const claimValue = firstValue(record, ['claimValue', 'claim_value', 'value', 'modelOutput', 'model_output', 'answer', 'rating']);
    const question = firstValue(record, ['question', 'prompt']) || `Is this extracted value correct?`;
    if (!claimValue) {
      warnings.push(`row ${index + 1}: no claim value field found`);
      return;
    }
    const identity = propertyIdentity(record, index);
    cards.push({
      schemaVersion: evalCardSchemaVersion,
      cardId: `${normalizeProjectId(options.projectId)}:${normalizeBatchId(options.batchId)}:${slug(identity.sourceKey, `row-${index + 1}`)}:claim`,
      cardType: 'binary_claim',
      question,
      claim: {
        template: firstValue(record, ['template', 'claimTemplate', 'claim_template']) || 'generic_claim',
        path: firstValue(record, ['path', 'claimPath', 'claim_path']) || 'value',
        value: claimValue,
      },
      sourceKey: identity.sourceKey,
      priority: text(record.priority, 'medium'),
      confidence: confidenceValue(record),
      subject: {
        title: firstValue(record, ['title', ...addressFields, ...propertyIdFields]) || `Record ${index + 1}`,
        subtitle: firstValue(record, ['subtitle', 'type']) || 'Generic eval record',
        url: firstValue(record, urlFields) || null,
        source: firstValue(record, ['source']) || 'csv',
        metadata: {},
      },
      media: mediaForRecord(record),
      images: [],
      analysisContext: {
        summary: firstValue(record, explanationFields),
        model: firstValue(record, ['model', 'modelName', 'model_name']),
        provider: firstValue(record, ['provider', 'modelProvider', 'model_provider']),
        analysisStage: 'generic-csv',
        warnings: [],
      },
      evidence: evidenceItems(record),
    });
  });
  return { cards, warnings };
}

export function generateCardsFromRecords(records, options = {}) {
  const adapter = text(options.adapter, 'generic').toLowerCase();
  if (adapter === 'myfire-rating' || adapter === 'myfirerating') {
    return generateMyFireRatingCards(records, options);
  }
  return generateGenericClaimCards(records, options);
}

export function previewCardsFromText(raw, options = {}) {
  const records = recordsFromText(raw, { format: options.format });
  const generated = generateCardsFromRecords(records, options);
  return {
    records,
    cards: generated.cards,
    warnings: generated.warnings,
    adapter: text(options.adapter, 'generic'),
  };
}

