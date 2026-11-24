/**
 * Zero-dependency Tripo Open API v2 client for Node.js 22+.
 * Supports image upload, image_to_model / multiview_to_model, and animate_rig.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE_URL = 'https://api.tripo3d.ai/v2/openapi';

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const EXT_TO_TYPE = {
  '.png': 'png',
  '.jpg': 'jpg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
};

/**
 * Load TRIPO_API_KEY from process.env or an optional .env file.
 * @param {string} [envPath]
 * @returns {Promise<string>}
 */
export async function loadApiKey(envPath = path.resolve(process.cwd(), '.env')) {
  const fromEnv = process.env.TRIPO_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key !== 'TRIPO_API_KEY') continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val) return val;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  throw new Error(
    'TRIPO_API_KEY is not set. Export TRIPO_API_KEY in your shell or add TRIPO_API_KEY=... to .env in the project root.',
  );
}

function imageFormatInfo(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext];
  const type = EXT_TO_TYPE[ext];
  if (!mime || !type) {
    throw new Error(`Unsupported image format "${ext}". Supported formats: .png, .jpg, .jpeg, .webp`);
  }
  return { mime, type };
}

async function parseTripoResponse(res, context) {
  let payload;
  const text = await res.text();
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${context} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || (payload.code !== undefined && payload.code !== 0)) {
    const msg = payload.message || payload.error || text.slice(0, 300);
    throw new Error(`${context} failed (HTTP ${res.status}, code ${payload.code ?? 'n/a'}): ${msg}`);
  }
  return payload.data ?? payload;
}

/**
 * Upload an image to Tripo Open API and return its image_token.
 * @param {string} apiKey
 * @param {string} filePath
 * @returns {Promise<{imageToken: string, fileType: string}>}
 */
export async function uploadImage(apiKey, filePath) {
  const { mime, type } = imageFormatInfo(filePath);
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), path.basename(filePath));

  const res = await fetch(`${BASE_URL}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await parseTripoResponse(res, `Upload ${path.basename(filePath)}`);
  if (!data?.image_token) {
    throw new Error(`Upload succeeded but response missing image_token: ${JSON.stringify(data)}`);
  }
  return { imageToken: data.image_token, fileType: type };
}

/**
 * Create a Tripo task and return its task_id.
 * @param {string} apiKey
 * @param {object} body
 * @returns {Promise<string>}
 */
export async function createTask(apiKey, body) {
  const res = await fetch(`${BASE_URL}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await parseTripoResponse(res, `Create task (${body?.type || 'unknown'})`);
  if (!data?.task_id) {
    throw new Error(`Create task succeeded but missing task_id: ${JSON.stringify(data)}`);
  }
  return data.task_id;
}

/**
 * Poll a Tripo task until completion.
 * @param {string} apiKey
 * @param {string} taskId
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function pollTask(
  apiKey,
  taskId,
  { intervalMs = 3000, timeoutMs = 600000, onProgress } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastProgress = -1;

  while (Date.now() < deadline) {
    const res = await fetch(`${BASE_URL}/task/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await parseTripoResponse(res, `Poll task ${taskId}`);
    const status = data.status;
    const progress = typeof data.progress === 'number' ? data.progress : null;

    if (onProgress && progress !== null && progress !== lastProgress) {
      lastProgress = progress;
      onProgress({ taskId, status, progress, data });
    }

    if (status === 'success') return data;
    if (['failed', 'cancelled', 'unknown', 'banned', 'expired'].includes(status)) {
      throw new Error(`Tripo task ${taskId} ended with status "${status}": ${JSON.stringify(data)}`);
    }

    await delay(intervalMs);
  }

  throw new Error(`Tripo task ${taskId} timed out after ${Math.round(timeoutMs / 1000)}s`);
}

/**
 * Download a file URL to a local destination path.
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<string>}
 */
export async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buffer);
  return destPath;
}

function extractModelUrl(output) {
  if (!output || typeof output !== 'object') return null;
  for (const key of ['model', 'pbr_model', 'base_model']) {
    const candidate = output[key];
    if (typeof candidate === 'string' && candidate.startsWith('http')) return candidate;
    if (candidate && typeof candidate === 'object' && typeof candidate.url === 'string') {
      return candidate.url;
    }
  }
  return null;
}

/**
 * Generate a rigged full-body 3D model from a single T-pose image or 4 views.
 * @param {object} opts
 * @returns {Promise<{rawTaskId: string, rigTaskId: string, rawModelPath: string|null, modelPath: string}>}
 */
export async function generateRiggedFullbody({
  apiKey,
  imagePath,
  views,
  outDir,
  modelVersion = 'v2.5-20250123',
  faceLimit = 25000,
  rigFormat = 'glb',
  onProgress,
}) {
  if (!apiKey) throw new Error('apiKey is required');
  if (!outDir) throw new Error('outDir is required');
  await fs.mkdir(outDir, { recursive: true });

  const log = (stage, info) => {
    if (onProgress) onProgress({ stage, ...info });
  };

  let genPayload;
  if (Array.isArray(views) && views.length === 4) {
    log('upload', { message: 'Uploading 4 views (front, left, back, right)...' });
    const uploaded = [];
    for (const v of views) {
      uploaded.push(await uploadImage(apiKey, v));
    }
    genPayload = {
      type: 'multiview_to_model',
      files: uploaded.map(({ imageToken, fileType }) => ({ type: fileType, file_token: imageToken })),
      model_version: modelVersion,
      texture: true,
      pbr: true,
      quad: true,
      face_limit: faceLimit,
    };
  } else if (imagePath) {
    log('upload', { message: `Uploading ${path.basename(imagePath)}...` });
    const { imageToken, fileType } = await uploadImage(apiKey, imagePath);
    genPayload = {
      type: 'image_to_model',
      file: { type: fileType, file_token: imageToken },
      model_version: modelVersion,
      texture: true,
      pbr: true,
      quad: true,
      face_limit: faceLimit,
    };
  } else {
    throw new Error('Provide either imagePath or 4 views [front, left, back, right].');
  }

  const rawTaskId = await createTask(apiKey, genPayload);
  log('generate', { taskId: rawTaskId, message: `Model generation started (${rawTaskId})` });
  const rawTask = await pollTask(apiKey, rawTaskId, {
    onProgress: ({ progress, status }) =>
      log('generate', { taskId: rawTaskId, status, progress, message: `Generating 3D model: ${progress}%` }),
  });

  let rawModelPath = null;
  const rawUrl = extractModelUrl(rawTask.output);
  if (rawUrl) {
    rawModelPath = path.join(outDir, 'tripo-raw.glb');
    await downloadFile(rawUrl, rawModelPath);
    log('generate', { taskId: rawTaskId, message: `Saved raw model to ${rawModelPath}` });
  }

  const rigPayload = {
    type: 'animate_rig',
    original_model_task_id: rawTaskId,
    out_format: rigFormat,
    spec: 'mixamo',
    rig_type: 'biped',
  };
  const rigTaskId = await createTask(apiKey, rigPayload);
  log('rig', { taskId: rigTaskId, message: `Auto-rigging started (${rigTaskId})` });
  const rigTask = await pollTask(apiKey, rigTaskId, {
    onProgress: ({ progress, status }) =>
      log('rig', { taskId: rigTaskId, status, progress, message: `Auto-rigging model: ${progress}%` }),
  });

  const rigUrl = extractModelUrl(rigTask.output);
  if (!rigUrl) {
    throw new Error(`Rig task ${rigTaskId} succeeded but output contains no model URL: ${JSON.stringify(rigTask.output)}`);
  }

  const ext = rigFormat.startsWith('.') ? rigFormat : `.${rigFormat}`;
  const modelPath = path.join(outDir, `tripo-rigged${ext}`);
  await downloadFile(rigUrl, modelPath);
  log('rig', { taskId: rigTaskId, message: `Saved rigged model to ${modelPath}` });

  return { rawTaskId, rigTaskId, rawModelPath, modelPath };
}
