import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  cardReviewerKey,
  batchIdFrom,
  evalAnswerValues,
  normalizeEvalCard,
  normalizeEvalResult,
  normalizeBatchId,
  normalizeProjectId,
  normalizeReviewer,
  resultIdempotencyKey,
  summarizeEvalBatch,
  text,
  validateEvalCard,
  validateEvalResult,
} from '../../packages/schema/index.mjs';

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = await fs.readFile(filePath, 'utf8');
  const rows = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (error) {
      throw new Error(`${filePath}:${index + 1}: invalid JSONL row: ${error.message}`);
    }
  }
  return rows;
}

async function readJsonlMany(filePaths) {
  const rows = [];
  for (const filePath of filePaths) {
    rows.push(...await readJsonl(filePath));
  }
  return rows;
}

async function writeJsonl(filePath, rows) {
  await ensureDir(filePath);
  const body = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, body ? `${body}\n` : '', 'utf8');
}

async function appendJsonl(filePath, row) {
  await ensureDir(filePath);
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

function parseJsonlText(raw) {
  const rows = [];
  for (const [index, line] of String(raw ?? '').split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (error) {
      const row = index + 1;
      throw Object.assign(new Error(`Invalid JSONL row ${row}: ${error.message}`), { status: 400 });
    }
  }
  return rows;
}

function csvCell(value) {
  const textValue = String(value ?? '');
  return /[",\n\r]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

export function resultsToCsv(results) {
  const columns = [
    'eventId',
    'projectId',
    'batchId',
    'runId',
    'cardId',
    'sourceKey',
    'reviewer',
    'userId',
    'reviewerName',
    'workspaceId',
    'answer',
    'correction',
    'notes',
    'durationMs',
    'clientGeneratedAt',
    'serverReceivedAt',
  ];
  const lines = [columns.join(',')];
  for (const result of results) {
    lines.push(columns.map((column) => {
      const value = column === 'correction' ? JSON.stringify(result.correction ?? null) : result[column];
      return csvCell(value);
    }).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function resultTimestamp(result) {
  return text(result?.serverReceivedAt ?? result?.receivedAt ?? result?.clientGeneratedAt);
}

function hasCorrection(result) {
  const correction = result?.correction;
  if (!correction) return false;
  if (typeof correction === 'string') return Boolean(text(correction));
  if (Array.isArray(correction)) return correction.length > 0;
  if (typeof correction === 'object') return Object.keys(correction).length > 0;
  return true;
}

function answerDistribution(results) {
  const distribution = Object.fromEntries(evalAnswerValues.map((answer) => [answer, 0]));
  for (const result of results) {
    const answer = text(result.answer, 'unknown');
    distribution[answer] = (distribution[answer] ?? 0) + 1;
  }
  return distribution;
}

function averageDurationMs(results) {
  const durations = results
    .map((result) => Number(result.durationMs))
    .filter((duration) => Number.isFinite(duration) && duration >= 0);
  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
}

function reviewerBreakdown(results) {
  const byReviewer = new Map();
  for (const result of results) {
    const reviewer = normalizeReviewer(result.reviewer);
    const existing = byReviewer.get(reviewer) ?? {
      reviewer,
      total: 0,
      corrections: 0,
      skipped: 0,
      durationTotal: 0,
      durationCount: 0,
      lastReviewedAt: null,
    };
    existing.total += 1;
    if (hasCorrection(result)) existing.corrections += 1;
    if (text(result.answer) === 'skip') existing.skipped += 1;
    const duration = Number(result.durationMs);
    if (Number.isFinite(duration) && duration >= 0) {
      existing.durationTotal += duration;
      existing.durationCount += 1;
    }
    const timestamp = resultTimestamp(result);
    if (timestamp && (!existing.lastReviewedAt || timestamp > existing.lastReviewedAt)) {
      existing.lastReviewedAt = timestamp;
    }
    byReviewer.set(reviewer, existing);
  }
  return Array.from(byReviewer.values())
    .map((row) => ({
      reviewer: row.reviewer,
      total: row.total,
      corrections: row.corrections,
      correctionRate: row.total ? row.corrections / row.total : 0,
      skipped: row.skipped,
      avgDurationMs: row.durationCount ? Math.round(row.durationTotal / row.durationCount) : null,
      lastReviewedAt: row.lastReviewedAt,
    }))
    .sort((a, b) => (b.lastReviewedAt ?? '').localeCompare(a.lastReviewedAt ?? '') || b.total - a.total);
}

function latestResultsByCard(results) {
  const latest = new Map();
  for (const result of results) {
    if (text(result.cardId)) latest.set(text(result.cardId), result);
  }
  return latest;
}

function computeBatchMetrics(cards, results) {
  const latestByCard = latestResultsByCard(results);
  let reviewedCards = 0;
  let skippedCards = 0;
  for (const card of cards) {
    const latest = latestByCard.get(text(card.cardId));
    if (!latest) continue;
    if (text(latest.answer) === 'skip') skippedCards += 1;
    else reviewedCards += 1;
  }
  const correctionCount = results.filter(hasCorrection).length;
  const lastReviewedAt = results
    .map(resultTimestamp)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  return {
    totalCards: cards.length,
    reviewedCards,
    skippedCards,
    pendingCards: Math.max(0, cards.length - reviewedCards - skippedCards),
    totalResultRows: results.length,
    answerDistribution: answerDistribution(results),
    correctionCount,
    correctionRate: results.length ? correctionCount / results.length : 0,
    avgReviewTimeMs: averageDurationMs(results),
    reviewerBreakdown: reviewerBreakdown(results),
    lastReviewedAt,
    exportStatus: {
      jsonlRows: results.length,
      csvRows: results.length,
      ready: results.length > 0,
      lastLabelAt: lastReviewedAt,
    },
  };
}

function cardById(cards) {
  return new Map(cards.map((card) => [text(card.cardId), card]));
}

function enrichResult(result, cards) {
  const card = cardById(cards).get(text(result.cardId)) ?? null;
  return {
    ...result,
    duplicateStatus: 'accepted',
    question: card?.question ?? '',
    claim: card?.claim ?? null,
    subject: card?.subject ?? null,
    evidence: card?.evidence ?? [],
    analysisContext: card?.analysisContext ?? {},
  };
}

export class EvalFileStore {
  constructor({ dataDir }) {
    this.dataDir = path.resolve(dataDir);
  }

  projectDir(projectId) {
    return path.join(this.dataDir, 'projects', normalizeProjectId(projectId));
  }

  projectMetadataPath(projectId) {
    return path.join(this.projectDir(projectId), 'project.json');
  }

  batchDir(projectId, batchId) {
    return path.join(this.projectDir(projectId), 'batches', normalizeBatchId(batchId));
  }

  legacyRunDir(projectId, batchId) {
    return path.join(this.dataDir, 'projects', normalizeProjectId(projectId), 'runs', normalizeBatchId(batchId));
  }

  cardsPath(projectId, batchId) {
    return path.join(this.batchDir(projectId, batchId), 'cards.jsonl');
  }

  legacyCardsPath(projectId, batchId) {
    return path.join(this.legacyRunDir(projectId, batchId), 'cards.jsonl');
  }

  resultsPath(projectId, batchId) {
    return path.join(this.batchDir(projectId, batchId), 'results.jsonl');
  }

  legacyResultsPath(projectId, batchId) {
    return path.join(this.legacyRunDir(projectId, batchId), 'results.jsonl');
  }

  metadataPath(projectId, batchId) {
    return path.join(this.batchDir(projectId, batchId), 'batch.json');
  }

  async createProject({ projectId, name = '', description = '' } = {}) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const existing = await this.projectMetadata({ projectId: normalizedProjectId });
    const metadata = {
      projectId: normalizedProjectId,
      name: text(name, existing?.name ?? normalizedProjectId),
      description: text(description, existing?.description ?? ''),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ensureDir(this.projectMetadataPath(normalizedProjectId));
    await fs.writeFile(this.projectMetadataPath(normalizedProjectId), JSON.stringify(metadata, null, 2), 'utf8');
    return metadata;
  }

  async projectMetadata({ projectId }) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const filePath = this.projectMetadataPath(normalizedProjectId);
    if (existsSync(filePath)) return JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!existsSync(this.projectDir(normalizedProjectId))) return null;
    return {
      projectId: normalizedProjectId,
      name: normalizedProjectId,
      description: '',
      createdAt: null,
      updatedAt: null,
    };
  }

  async listProjects() {
    const projectsRoot = path.join(this.dataDir, 'projects');
    if (!existsSync(projectsRoot)) return [];
    const projectRows = [];
    for (const projectDir of await fs.readdir(projectsRoot, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue;
      const metadata = await this.projectMetadata({ projectId: projectDir.name });
      projectRows.push(metadata ?? {
        projectId: projectDir.name,
        name: projectDir.name,
        description: '',
        createdAt: null,
        updatedAt: null,
      });
    }
    const batches = await this.listBatches();
    const stats = new Map();
    for (const batch of batches) {
      const projectId = normalizeProjectId(batch.projectId);
      const existing = stats.get(projectId) ?? {
        totalBatches: 0,
        totalCards: 0,
        reviewedCards: 0,
        pendingCards: 0,
        totalResultRows: 0,
        lastReviewedAt: null,
      };
      const cards = await this.listCards(batch);
      const results = await this.listResults(batch);
      const metrics = computeBatchMetrics(cards, results);
      existing.totalBatches += 1;
      existing.totalCards += metrics.totalCards;
      existing.reviewedCards += metrics.reviewedCards;
      existing.pendingCards += metrics.pendingCards;
      existing.totalResultRows += metrics.totalResultRows;
      if (metrics.lastReviewedAt && (!existing.lastReviewedAt || metrics.lastReviewedAt > existing.lastReviewedAt)) {
        existing.lastReviewedAt = metrics.lastReviewedAt;
      }
      stats.set(projectId, existing);
    }
    return projectRows
      .map((project) => ({ ...project, ...(stats.get(project.projectId) ?? {
        totalBatches: 0,
        totalCards: 0,
        reviewedCards: 0,
        pendingCards: 0,
        totalResultRows: 0,
        lastReviewedAt: null,
      }) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createBatch({ projectId, batchId, runId, name = '', description = '', projectName = '', projectDescription = '' }) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    await this.createProject({
      projectId: normalizedProjectId,
      name: projectName,
      description: projectDescription,
    });
    const existing = await this.batchMetadata({ projectId: normalizedProjectId, batchId: normalizedBatchId });
    const metadata = {
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      runId: normalizedBatchId,
      name: text(name, existing?.name ?? normalizedBatchId),
      description: text(description, existing?.description ?? ''),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ensureDir(this.metadataPath(normalizedProjectId, normalizedBatchId));
    await fs.writeFile(this.metadataPath(normalizedProjectId, normalizedBatchId), JSON.stringify(metadata, null, 2), 'utf8');
    return metadata;
  }

  async createRun(options) {
    return this.createBatch(options);
  }

  async batchMetadata({ projectId, batchId, runId }) {
    const filePath = this.metadataPath(projectId, batchIdFrom({ batchId, runId }));
    if (!existsSync(filePath)) return null;
    const metadata = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const normalizedBatchId = batchIdFrom(metadata, batchId ?? runId);
    return { ...metadata, batchId: normalizedBatchId, runId: normalizedBatchId };
  }

  async runMetadata(options) {
    return this.batchMetadata(options);
  }

  async listBatches() {
    const projectsRoot = path.join(this.dataDir, 'projects');
    if (!existsSync(projectsRoot)) return [];
    const batches = [];
    for (const projectDir of await fs.readdir(projectsRoot, { withFileTypes: true })) {
      if (!projectDir.isDirectory()) continue;
      for (const rootName of ['batches', 'runs']) {
        const batchesRoot = path.join(projectsRoot, projectDir.name, rootName);
        if (!existsSync(batchesRoot)) continue;
        for (const batchDir of await fs.readdir(batchesRoot, { withFileTypes: true })) {
          if (!batchDir.isDirectory()) continue;
          const alreadyListed = batches.some((batch) => (
            batch.projectId === projectDir.name && batch.batchId === batchDir.name
          ));
          if (alreadyListed) continue;
          const metadata = rootName === 'batches'
            ? await this.batchMetadata({ projectId: projectDir.name, batchId: batchDir.name })
            : null;
          batches.push(metadata ?? {
            projectId: projectDir.name,
            batchId: batchDir.name,
            runId: batchDir.name,
            name: batchDir.name,
            description: '',
            createdAt: null,
            updatedAt: null,
          });
        }
      }
    }
    return batches.sort((a, b) => `${a.projectId}/${a.batchId}`.localeCompare(`${b.projectId}/${b.batchId}`));
  }

  async listRuns() {
    return this.listBatches();
  }

  async listBatchSummaries({ projectId, reviewer } = {}) {
    const normalizedProjectId = projectId ? normalizeProjectId(projectId) : '';
    const batches = (await this.listBatches())
      .filter((batch) => !normalizedProjectId || normalizeProjectId(batch.projectId) === normalizedProjectId);
    const summaries = [];
    for (const batch of batches) {
      const cards = await this.listCards(batch);
      const results = await this.listResults(batch);
      const metrics = computeBatchMetrics(cards, results);
      summaries.push({
        ...batch,
        summary: summarizeEvalBatch(cards, results, { reviewer, batchId: batch.batchId }),
        metrics,
      });
    }
    return summaries.sort((a, b) => (
      (b.metrics.lastReviewedAt ?? b.updatedAt ?? '').localeCompare(a.metrics.lastReviewedAt ?? a.updatedAt ?? '')
      || `${a.projectId}/${a.batchId}`.localeCompare(`${b.projectId}/${b.batchId}`)
    ));
  }

  async listCards({ projectId, batchId, runId }) {
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const primary = this.cardsPath(projectId, normalizedBatchId);
    if (existsSync(primary)) return readJsonl(primary);
    return readJsonl(this.legacyCardsPath(projectId, normalizedBatchId));
  }

  async listResults({ projectId, batchId, runId }) {
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    return readJsonlMany([
      this.legacyResultsPath(projectId, normalizedBatchId),
      this.resultsPath(projectId, normalizedBatchId),
    ]);
  }

  async importCards({ projectId, batchId, runId, cards, replace = false }) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const normalizedCards = cards.map((card) => normalizeEvalCard(card, {
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
    }));
    const errors = [];
    normalizedCards.forEach((card, index) => {
      const cardErrors = validateEvalCard(card);
      if (cardErrors.length) errors.push(`card ${index + 1}: ${cardErrors.join('; ')}`);
    });
    if (errors.length) {
      throw Object.assign(new Error(errors.join('\n')), { status: 400 });
    }

    await this.createBatch({ projectId: normalizedProjectId, batchId: normalizedBatchId });
    const existing = replace ? [] : await this.listCards({ projectId: normalizedProjectId, batchId: normalizedBatchId });
    const byCardId = new Map(existing.map((card) => [text(card.cardId), card]));
    let imported = 0;
    let replaced = 0;
    for (const card of normalizedCards) {
      if (byCardId.has(text(card.cardId))) replaced += 1;
      else imported += 1;
      byCardId.set(text(card.cardId), card);
    }
    const nextCards = Array.from(byCardId.values());
    await writeJsonl(this.cardsPath(normalizedProjectId, normalizedBatchId), nextCards);
    return {
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      runId: normalizedBatchId,
      imported,
      replaced,
      totalCards: nextCards.length,
    };
  }

  parseImportPayload(raw, contentType) {
    if (contentType.includes('application/x-ndjson') || contentType.includes('application/jsonl') || contentType.includes('text/plain')) {
      return { cards: parseJsonlText(raw), replace: false };
    }
    const parsed = JSON.parse(raw || '{}');
    if (Array.isArray(parsed)) return { cards: parsed, replace: false };
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
      replace: Boolean(parsed.replace),
      projectId: parsed.projectId,
      batchId: parsed.batchId,
      runId: parsed.runId,
      name: parsed.name,
      description: parsed.description,
      projectName: parsed.projectName,
      projectDescription: parsed.projectDescription,
    };
  }

  async mobileDeck({ projectId, batchId, runId, reviewer, limit = 20, page = 1, reviewState = 'unreviewed' }) {
    const normalizedReviewer = normalizeReviewer(reviewer);
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const cards = await this.listCards({ projectId, batchId: normalizedBatchId });
    const results = await this.listResults({ projectId, batchId: normalizedBatchId });
    const reviewed = new Set(results
      .filter((result) => cardReviewerKey(result.reviewer, result.cardId).startsWith(`${normalizedReviewer}\n`))
      .map((result) => text(result.cardId)));
    const visible = reviewState === 'all'
      ? cards
      : cards.filter((card) => !reviewed.has(text(card.cardId)));
    const pageSize = Math.max(1, Math.min(100, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    const start = (safePage - 1) * pageSize;
    return {
      ok: true,
      cards: visible.slice(start, start + pageSize),
      page: safePage,
      pageSize,
      pageCount,
      total: visible.length,
      unfilteredTotal: cards.length,
      reviewer: normalizedReviewer,
      reviewState,
    };
  }

  async summary({ projectId, batchId, runId, reviewer }) {
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const cards = await this.listCards({ projectId, batchId: normalizedBatchId });
    const results = await this.listResults({ projectId, batchId: normalizedBatchId });
    return {
      ok: true,
      summary: summarizeEvalBatch(cards, results, { reviewer, batchId: normalizedBatchId }),
    };
  }

  async storeResult({ projectId, batchId, runId, payload }) {
    const errors = validateEvalResult(payload);
    if (errors.length) {
      throw Object.assign(new Error(errors.join('; ')), { status: 400 });
    }
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const cards = await this.listCards({ projectId, batchId: normalizedBatchId });
    const card = cards.find((candidate) => text(candidate.cardId) === text(payload.cardId));
    if (!card) {
      throw Object.assign(new Error(`Unknown cardId: ${text(payload.cardId)}`), { status: 404 });
    }
    const results = await this.listResults({ projectId, batchId: normalizedBatchId });
    const key = resultIdempotencyKey(payload);
    const existing = results.find((result) => resultIdempotencyKey(result) === key);
    if (existing) {
      return {
        ok: true,
        stored: true,
        duplicate: true,
        result: existing,
        totalResultRows: results.length,
      };
    }
    const result = normalizeEvalResult(payload, {
      projectId,
      batchId: normalizedBatchId,
      sourceKey: card.sourceKey,
      serverReceivedAt: new Date().toISOString(),
    });
    await appendJsonl(this.resultsPath(projectId, normalizedBatchId), result);
    return {
      ok: true,
      stored: true,
      duplicate: false,
      result,
      totalResultRows: results.length + 1,
    };
  }

  async dashboardState({ projectId, batchId, runId, reviewer }) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const projects = await this.listProjects();
    const batches = await this.listBatchSummaries({ reviewer });
    const detail = await this.batchDetail({
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      reviewer,
    });
    const recentActivity = await this.recentActivity({ limit: 30 });
    return {
      ok: true,
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      runId: normalizedBatchId,
      reviewer: normalizeReviewer(reviewer),
      dataDir: this.dataDir,
      projects,
      batches,
      runs: batches,
      summary: detail.summary,
      metrics: detail.metrics,
      selectedBatch: detail,
      recentActivity,
      recentResults: detail.recentResults,
    };
  }

  async batchDetail({ projectId, batchId, runId, reviewer }) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedBatchId = batchIdFrom({ batchId, runId });
    const project = await this.projectMetadata({ projectId: normalizedProjectId }) ?? {
      projectId: normalizedProjectId,
      name: normalizedProjectId,
      description: '',
      createdAt: null,
      updatedAt: null,
    };
    const batch = await this.batchMetadata({ projectId: normalizedProjectId, batchId: normalizedBatchId }) ?? {
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      runId: normalizedBatchId,
      name: normalizedBatchId,
      description: '',
      createdAt: null,
      updatedAt: null,
    };
    const cards = await this.listCards({ projectId: normalizedProjectId, batchId: normalizedBatchId });
    const results = await this.listResults({ projectId: normalizedProjectId, batchId: normalizedBatchId });
    const latestByCard = latestResultsByCard(results);
    const enrichedCards = cards.map((card) => ({
      ...card,
      latestResult: latestByCard.get(text(card.cardId)) ?? null,
    }));
    const recentResults = results
      .slice()
      .sort((a, b) => resultTimestamp(b).localeCompare(resultTimestamp(a)))
      .slice(0, 100)
      .map((result) => enrichResult(result, cards));
    const metrics = computeBatchMetrics(cards, results);
    return {
      ok: true,
      project,
      batch,
      projectId: normalizedProjectId,
      batchId: normalizedBatchId,
      runId: normalizedBatchId,
      reviewer: normalizeReviewer(reviewer),
      summary: summarizeEvalBatch(cards, results, { reviewer, batchId: normalizedBatchId }),
      metrics,
      answerDistribution: metrics.answerDistribution,
      reviewerBreakdown: metrics.reviewerBreakdown,
      cards: enrichedCards,
      recentResults,
      exportStatus: metrics.exportStatus,
    };
  }

  async recentActivity({ limit = 30 } = {}) {
    const activity = [];
    for (const batch of await this.listBatches()) {
      const cards = await this.listCards(batch);
      const results = await this.listResults(batch);
      for (const result of results) {
        activity.push({
          ...enrichResult(result, cards),
          projectId: batch.projectId,
          batchId: batch.batchId,
          batchName: batch.name,
        });
      }
    }
    return activity
      .sort((a, b) => resultTimestamp(b).localeCompare(resultTimestamp(a)))
      .slice(0, Math.max(1, Math.min(200, Number(limit) || 30)));
  }

  async exportResults({ projectId, batchId, runId, format = 'jsonl' }) {
    const results = await this.listResults({ projectId, batchId: batchIdFrom({ batchId, runId }) });
    if (format === 'csv') return resultsToCsv(results);
    return results.map((result) => JSON.stringify(result)).join('\n') + (results.length ? '\n' : '');
  }
}
