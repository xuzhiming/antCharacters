import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findBlender, sameOrigin } from './server-jobs.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const AVATARS_DIR = path.join(ROOT, 'public', 'avatars');
const WORK_ROOT = path.join(ROOT, 'work', 'web-body-hair');
const ALLOWED_EXTS = new Set(['.fbx', '.glb', '.gltf', '.zip']);
const SUPPORTED_MODEL_EXTS = new Set(['.fbx', '.glb', '.gltf']);
const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
const MAX_JSON_BYTES = 256 * 1024;
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

const jobs = new Map();
const sessions = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function readBodyLimited(req, maxBytes, tooLargeMsg = '上传数据过大。') {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(tooLargeMsg);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(tooLargeMsg);
    }
    chunks.push(chunk);
  }
  if (total === 0) throw new Error('请求内容为空。');
  return Buffer.concat(chunks);
}

function sanitizeSlug(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || `avatar_${Date.now()}`;
}

function validateFileEntry(entry, label) {
  if (!entry || typeof entry === 'string' || typeof entry.arrayBuffer !== 'function') {
    throw new Error(`请上传${label}模型文件（支持 .fbx / .glb / .gltf / .zip）。`);
  }
  const ext = path.extname(entry.name || '').toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error(`${label}文件格式不支持（${ext || '无扩展名'}），仅支持 .fbx、.glb、.gltf 或 .zip。`);
  }
  return ext;
}

function parseFiniteNumber(raw, fallback, { min = -Infinity, max = Infinity, positive = false, label }) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const trimmed = String(raw).trim();
  if (!trimmed) return fallback;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || (positive ? num <= 0 : num < min) || num > max) {
    throw new Error(`${label}参数无效。`);
  }
  return num;
}

function parseOffset(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '0,0,0';
  const parts = trimmed.split(',').map((s) => s.trim());
  if (parts.length !== 3 || parts.some((p) => p === '' || !Number.isFinite(Number(p)))) {
    throw new Error('头发偏移量格式无效，应为 x,y,z 三个数字。');
  }
  return parts.map((p) => String(Number(p))).join(',');
}

function hasActiveTask() {
  for (const existing of jobs.values()) {
    if (existing.status === 'running') return true;
  }
  for (const existing of sessions.values()) {
    if (existing.status === 'staging') return true;
  }
  return false;
}

async function collectModelCandidates(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && SUPPORTED_MODEL_EXTS.has(path.extname(entry.name).toLowerCase())) {
      const st = await fs.stat(full);
      out.push({ path: full, size: st.size });
    } else if (entry.isDirectory()) {
      await collectModelCandidates(full, out);
    }
  }
  return out;
}

async function resolveUploadedModel(inputPath, extractDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (SUPPORTED_MODEL_EXTS.has(ext)) return inputPath;
  if (ext !== '.zip') {
    throw new Error(`不支持的文件格式：${ext}`);
  }
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync('unzip', ['-q', '-o', inputPath, '-d', extractDir]);
  const candidates = await collectModelCandidates(extractDir);
  if (!candidates.length) {
    throw new Error(`压缩包 ${path.basename(inputPath)} 内未找到 .fbx / .glb / .gltf 文件。`);
  }
  candidates.sort((a, b) => b.size - a.size);
  return candidates[0].path;
}

function spawnBlenderProcess({ blender, blendFile = null, scriptRelPath, scriptArgs, timeoutMs, onLog, onExit, onError }) {
  const scriptPath = path.join(ROOT, scriptRelPath);
  const args = [
    '--background',
    ...(blendFile ? [blendFile] : []),
    '--disable-autoexec',
    '--python-exit-code',
    '1',
    '--python',
    scriptPath,
    '--',
    ...scriptArgs,
  ];

  // Omit --factory-startup so VRM Add-on remains enabled.
  const child = spawn(blender, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => onLog(chunk.toString()));
  child.stderr.on('data', (chunk) => onLog(chunk.toString()));

  let finished = false;
  const timer = setTimeout(() => {
    if (finished) return;
    finished = true;
    child.kill();
    onError('Blender 处理超时（超过 5 分钟），请检查模型是否过大或 Blender 环境是否正常。');
  }, timeoutMs);

  child.on('error', (err) => {
    clearTimeout(timer);
    if (finished) return;
    finished = true;
    onError(err.message);
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (finished) return;
    finished = true;
    onExit(code);
  });

  return child;
}

async function listAvatars() {
  let entries = [];
  try {
    entries = await fs.readdir(AVATARS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.vrm')) continue;
    const full = path.join(AVATARS_DIR, entry.name);
    const stat = await fs.stat(full);
    const stem = entry.name.slice(0, -4);
    items.push({
      name: stem,
      file: entry.name,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
      previewUrl: `/vrm-viewer.html?model=${encodeURIComponent(entry.name)}&walk=1`,
      downloadUrl: `/avatars/${encodeURIComponent(entry.name)}`,
    });
  }
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items.map(({ mtimeMs, ...rest }) => rest);
}

function resolveAvatarPath(rawParam) {
  let file;
  try {
    file = decodeURIComponent(rawParam);
  } catch {
    throw new Error('模型文件名编码无效。');
  }
  if (!file || file.includes('/') || file.includes('\\') || file.includes('\0') || file.includes('..') || path.basename(file) !== file) {
    throw new Error('模型文件名非法。');
  }
  if (path.extname(file).toLowerCase() !== '.vrm') {
    throw new Error('仅支持删除 .vrm 模型文件。');
  }
  const avatarsRoot = path.resolve(AVATARS_DIR);
  const full = path.resolve(avatarsRoot, file);
  if (!full.startsWith(avatarsRoot + path.sep)) {
    throw new Error('模型文件路径非法。');
  }
  return { file, full };
}

function startBodyHairJob({ bodyPath, hairPath, name, outDir, hairScaleMult, hairOffset, targetHeight, author }) {
  const id = randomUUID();
  const job = {
    id,
    name,
    status: 'running',
    stage: '准备输入文件中…',
    log: '',
    error: null,
    result: null,
    previewUrl: null,
    downloadUrl: null,
  };
  jobs.set(id, job);

  const scriptPath = path.join(ROOT, 'scripts', 'body-hair-to-vrm.mjs');
  const args = [
    scriptPath,
    '--body',
    bodyPath,
    '--hair',
    hairPath,
    '--name',
    name,
    '--out-dir',
    outDir,
    '--hair-scale-mult',
    String(hairScaleMult),
    '--hair-offset',
    hairOffset,
    '--target-height',
    String(targetHeight),
    '--author',
    author,
  ];

  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  job.child = child;

  const appendLog = (chunk) => {
    const text = chunk.toString();
    job.log = (job.log + text).slice(-12000);
    if (text.includes('[1/3]')) job.stage = '1/3 正在解包并检查身体与头发模型…';
    else if (text.includes('[2/3]')) job.stage = '2/3 正在运行 Blender 对齐、修补权重并导出 VRM…';
    else if (text.includes('[3/3]')) job.stage = '3/3 导出与校验完成！';
  };
  child.stdout.on('data', appendLog);
  child.stderr.on('data', appendLog);

  const timer = setTimeout(() => {
    if (job.status === 'running') {
      job.status = 'failed';
      job.error = '处理超时（超过 5 分钟），请检查模型是否过大或 Blender 环境是否正常。';
      child.kill();
    }
  }, JOB_TIMEOUT_MS);

  child.on('error', (err) => {
    clearTimeout(timer);
    if (job.status === 'running') {
      job.status = 'failed';
      job.error = err.message;
    }
  });

  child.on('close', (code) => {
    clearTimeout(timer);
    if (job.status !== 'running') return;
    if (code !== 0) {
      job.status = 'failed';
      job.error = job.log.slice(-1500) || `导出进程退出码 ${code}`;
      return;
    }
    const match = job.log.match(/^BODY_HAIR_VRM_OK\s+(.+)$/m);
    if (!match) {
      job.status = 'failed';
      job.error = '导出已完成但未收到 BODY_HAIR_VRM_OK 结果摘要。';
      return;
    }
    try {
      job.result = JSON.parse(match[1]);
      job.status = 'ready';
      job.stage = '已完成 VRM 1.0 导出与校验';
      job.previewUrl = `/vrm-viewer.html?model=${encodeURIComponent(name + '.vrm')}&walk=1`;
      job.downloadUrl = `/avatars/${encodeURIComponent(name + '.vrm')}`;
    } catch (err) {
      job.status = 'failed';
      job.error = `解析导出结果失败：${err.message}`;
    }
  });

  return job;
}

function startStageSession({ bodyPath, hairPath, name, sessionDir }) {
  const id = randomUUID();
  const stagedDir = path.join(sessionDir, 'staged');
  const session = {
    id,
    name,
    dir: sessionDir,
    stagedDir,
    stageJsonPath: path.join(stagedDir, 'stage.json'),
    status: 'staging',
    stage: '1/2 正在解包并准备模型…',
    log: '',
    error: null,
    data: null,
  };
  sessions.set(id, session);

  (async () => {
    const resolvedBody = await resolveUploadedModel(bodyPath, path.join(sessionDir, 'extracted-body'));
    const resolvedHair = await resolveUploadedModel(hairPath, path.join(sessionDir, 'extracted-hair'));
    const blender = await findBlender();
    if (!blender) {
      throw new Error('未找到 Blender 可执行文件，请安装 Blender 或设置 BLENDER 环境变量。');
    }

    session.stage = '2/2 正在执行 Blender 自动头型拟合与过渡场景导出…';
    spawnBlenderProcess({
      blender,
      scriptRelPath: 'scripts/stage-body-hair.py',
      scriptArgs: ['--body', resolvedBody, '--hair', resolvedHair, '--out-dir', stagedDir, '--name', name],
      timeoutMs: JOB_TIMEOUT_MS,
      onLog: (text) => {
        session.log = (session.log + text).slice(-12000);
      },
      onError: (msg) => {
        session.status = 'failed';
        session.error = msg;
      },
      onExit: (code) => {
        if (code !== 0) {
          session.status = 'failed';
          session.error = session.log.slice(-1500) || `Blender 过渡场景准备失败（退出码 ${code}）`;
          return;
        }
        const match = session.log.match(/^STAGE_BODY_HAIR_OK\s+(.+)$/m);
        if (!match) {
          session.status = 'failed';
          session.error = '过渡场景已生成但未收到 STAGE_BODY_HAIR_OK 结果摘要。';
          return;
        }
        try {
          const parsed = JSON.parse(match[1]);
          session.data = {
            ...parsed,
            bodyGlbUrl: `/api/body-hair/stage/${id}/body.glb`,
            hairGlbUrl: `/api/body-hair/stage/${id}/hair.glb`,
          };
          session.status = 'ready';
          session.stage = '过渡调整场景已就绪，可拖拽滑块实时调整。';
        } catch (err) {
          session.status = 'failed';
          session.error = `解析过渡场景结果失败：${err.message}`;
        }
      },
    });
  })().catch((err) => {
    session.status = 'failed';
    session.error = err.message || String(err);
  });

  return session;
}

function startFinalizeJob({ session, name, scaleMult, offsetX, offsetFB, offsetZ, targetHeight, author }) {
  const id = randomUUID();
  const outVrm = path.join(AVATARS_DIR, `${name}.vrm`);
  const outBlend = path.join(session.dir, `${name}.blend`);
  const job = {
    id,
    name,
    status: 'running',
    stage: '正在按当前滑块参数应用变换并导出 VRM…',
    log: '',
    error: null,
    result: null,
    previewUrl: null,
    downloadUrl: null,
  };
  jobs.set(id, job);

  (async () => {
    const blender = await findBlender();
    if (!blender) {
      throw new Error('未找到 Blender 可执行文件，请安装 Blender 或设置 BLENDER 环境变量。');
    }

    spawnBlenderProcess({
      blender,
      blendFile: session.data.stagedBlend,
      scriptRelPath: 'scripts/finalize-staged-vrm.py',
      scriptArgs: [
        '--stage-json',
        session.stageJsonPath,
        '--out-vrm',
        outVrm,
        '--out-blend',
        outBlend,
        '--scale-mult',
        String(scaleMult),
        '--offset-x',
        String(offsetX),
        '--offset-fb',
        String(offsetFB),
        '--offset-z',
        String(offsetZ),
        '--name',
        name,
        '--author',
        author,
        '--target-height',
        String(targetHeight),
      ],
      timeoutMs: JOB_TIMEOUT_MS,
      onLog: (text) => {
        job.log = (job.log + text).slice(-12000);
      },
      onError: (msg) => {
        job.status = 'failed';
        job.error = msg;
      },
      onExit: (code) => {
        if (code !== 0) {
          job.status = 'failed';
          job.error = job.log.slice(-1500) || `导出进程退出码 ${code}`;
          return;
        }
        const match = job.log.match(/^BODY_HAIR_VRM_OK\s+(.+)$/m);
        if (!match) {
          job.status = 'failed';
          job.error = '导出已完成但未收到 BODY_HAIR_VRM_OK 结果摘要。';
          return;
        }
        try {
          job.result = JSON.parse(match[1]);
          job.status = 'ready';
          job.stage = '已同步最新调整并完成 VRM 1.0 导出';
          job.previewUrl = `/vrm-viewer.html?model=${encodeURIComponent(name + '.vrm')}&walk=1`;
          job.downloadUrl = `/avatars/${encodeURIComponent(name + '.vrm')}`;
        } catch (err) {
          job.status = 'failed';
          job.error = `解析导出结果失败：${err.message}`;
        }
      },
    });
  })().catch((err) => {
    job.status = 'failed';
    job.error = err.message || String(err);
  });

  return job;
}

async function saveMultipartUploads(req, ct, prefix) {
  const rawBody = await readBodyLimited(req, MAX_UPLOAD_BYTES, '上传文件总大小不能超过 300 MB。');
  const form = await new Response(rawBody, { headers: { 'content-type': ct } }).formData();

  const bodyFile = form.get('body');
  const hairFile = form.get('hair');
  const bodyExt = validateFileEntry(bodyFile, '身体');
  const hairExt = validateFileEntry(hairFile, '头发');

  const workDir = path.join(WORK_ROOT, `${prefix}-${randomUUID()}`);
  const uploadsDir = path.join(workDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const bodyPath = path.join(uploadsDir, `body${bodyExt}`);
  const hairPath = path.join(uploadsDir, `hair${hairExt}`);
  await fs.writeFile(bodyPath, Buffer.from(await bodyFile.arrayBuffer()));
  await fs.writeFile(hairPath, Buffer.from(await hairFile.arrayBuffer()));

  return { form, workDir, bodyPath, hairPath };
}

export async function handleBodyHairRequest(req, res, pathname) {
  if (!pathname.startsWith('/api/body-hair/')) return false;
  if (!sameOrigin(req)) {
    sendJson(res, 403, { error: 'Local access only' });
    return true;
  }

  try {
    if (pathname === '/api/body-hair/list' && req.method === 'GET') {
      sendJson(res, 200, { models: await listAvatars() });
      return true;
    }

    const deleteMatch = pathname.match(/^\/api\/body-hair\/models\/([^/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const { file, full } = resolveAvatarPath(deleteMatch[1]);
      for (const existing of jobs.values()) {
        if (existing.status === 'running' && `${existing.name}.vrm` === file) {
          sendJson(res, 409, { error: '该模型正在导出中，请等待完成后再删除。' });
          return true;
        }
      }
      try {
        await fs.unlink(full);
      } catch (err) {
        if (err.code === 'ENOENT') {
          sendJson(res, 404, { error: '未找到要删除的模型文件。' });
          return true;
        }
        throw err;
      }
      sendJson(res, 200, { deleted: true, file });
      return true;
    }

    if (pathname === '/api/body-hair/stage' && req.method === 'POST') {
      if (hasActiveTask()) {
        sendJson(res, 409, { error: '当前已有合成或准备任务正在运行，请等待完成后再提交。' });
        return true;
      }
      const ct = req.headers['content-type'] || '';
      if (!ct.toLowerCase().includes('multipart/form-data')) {
        sendJson(res, 400, { error: '请使用 multipart/form-data 上传模型文件。' });
        return true;
      }

      const { form, workDir, bodyPath, hairPath } = await saveMultipartUploads(req, ct, 'stage');
      const name = sanitizeSlug(form.get('name'));
      const session = startStageSession({ bodyPath, hairPath, name, sessionDir: workDir });
      sendJson(res, 202, { id: session.id, status: session.status, name: session.name });
      return true;
    }

    const glbMatch = pathname.match(/^\/api\/body-hair\/stage\/([a-f0-9-]{36})\/(body|hair)\.glb$/);
    if (glbMatch && req.method === 'GET') {
      const session = sessions.get(glbMatch[1]);
      if (!session || session.status !== 'ready' || !session.data) {
        sendJson(res, 404, { error: '过渡预览场景尚未就绪或不存在。' });
        return true;
      }
      const targetPath = glbMatch[2] === 'body' ? session.data.bodyGlb : session.data.hairGlb;
      const buf = await fs.readFile(targetPath);
      res.writeHead(200, {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
      return true;
    }

    const stageMatch = pathname.match(/^\/api\/body-hair\/stage\/([a-f0-9-]{36})$/);
    if (stageMatch && req.method === 'GET') {
      const session = sessions.get(stageMatch[1]);
      if (!session) {
        sendJson(res, 404, { error: '未找到对应的过渡调整会话。' });
        return true;
      }
      sendJson(res, 200, {
        id: session.id,
        name: session.name,
        status: session.status,
        stage: session.stage,
        error: session.error,
        log: session.log,
        data: session.data,
      });
      return true;
    }

    if (pathname === '/api/body-hair/finalize' && req.method === 'POST') {
      if (hasActiveTask()) {
        sendJson(res, 409, { error: '当前已有导出任务正在运行，请稍候重试。' });
        return true;
      }
      const raw = await readBodyLimited(req, MAX_JSON_BYTES, '参数内容过大。');
      const payload = JSON.parse(raw.toString('utf8'));
      const session = sessions.get(String(payload?.sessionId || ''));
      if (!session || session.status !== 'ready' || !session.data?.stagedBlend) {
        sendJson(res, 404, { error: '过渡调整会话不存在或尚未就绪，请重新上传模型。' });
        return true;
      }

      const name = sanitizeSlug(payload.name || session.name);
      const scaleMult = parseFiniteNumber(payload.scaleMult, 1.0, { positive: true, min: 0.2, max: 3.0, label: '头发等比缩放' });
      const offsetX = parseFiniteNumber(payload.offsetX, 0.0, { min: -1.0, max: 1.0, label: '左右偏移' });
      const offsetFB = parseFiniteNumber(payload.offsetFB, 0.0, { min: -1.0, max: 1.0, label: '前后偏移' });
      const offsetZ = parseFiniteNumber(payload.offsetZ, 0.0, { min: -1.0, max: 1.0, label: '上下偏移' });
      const targetHeight = parseFiniteNumber(payload.targetHeight, 1.6, { min: 0, max: 5.0, label: '目标身高' });
      const author = String(payload.author || '').trim() || 'Charakuru Local Blender';

      const job = startFinalizeJob({
        session,
        name,
        scaleMult,
        offsetX,
        offsetFB,
        offsetZ,
        targetHeight,
        author,
      });
      sendJson(res, 202, { id: job.id, status: job.status, name: job.name });
      return true;
    }

    if (pathname === '/api/body-hair/export' && req.method === 'POST') {
      if (hasActiveTask()) {
        sendJson(res, 409, { error: '当前已有合成任务正在运行，请等待完成后再提交。' });
        return true;
      }

      const ct = req.headers['content-type'] || '';
      if (!ct.toLowerCase().includes('multipart/form-data')) {
        sendJson(res, 400, { error: '请使用 multipart/form-data 上传模型文件。' });
        return true;
      }

      const { form, workDir, bodyPath, hairPath } = await saveMultipartUploads(req, ct, 'export');
      const name = sanitizeSlug(form.get('name'));
      const hairScaleMult = parseFiniteNumber(form.get('hairScaleMult'), 1.0, { positive: true, label: '头发缩放倍率' });
      const hairOffset = parseOffset(form.get('hairOffset'));
      const targetHeight = parseFiniteNumber(form.get('targetHeight'), 1.6, { min: 0, label: '目标身高' });
      const author = String(form.get('author') || '').trim() || 'Charakuru Local Blender';

      const job = startBodyHairJob({
        bodyPath,
        hairPath,
        name,
        outDir: workDir,
        hairScaleMult,
        hairOffset,
        targetHeight,
        author,
      });
      sendJson(res, 202, { id: job.id, status: job.status, name: job.name });
      return true;
    }

    const match = pathname.match(/^\/api\/body-hair\/jobs\/([a-f0-9-]{36})$/);
    if (match && req.method === 'GET') {
      const job = jobs.get(match[1]);
      if (!job) {
        sendJson(res, 404, { error: '未找到对应的合成任务。' });
        return true;
      }
      sendJson(res, 200, {
        id: job.id,
        name: job.name,
        status: job.status,
        stage: job.stage,
        log: job.log,
        error: job.error,
        result: job.result,
        previewUrl: job.previewUrl,
        downloadUrl: job.downloadUrl,
      });
      return true;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: err.message });
  }
  return true;
}
