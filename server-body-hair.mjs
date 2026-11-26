import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findBlender, sameOrigin } from './server-jobs.mjs';
import { initializeLab, serveLab } from './scripts/expression-lab.mjs';

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

const ZIP_EXTRACT_PY = `
import pathlib, shutil, sys, zipfile
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).resolve()
def decode_name(info):
    name = info.filename
    if info.flag_bits & 0x800:
        return name
    raw = name.encode('cp437', errors='surrogateescape')
    for enc in ('utf-8', 'gb18030', 'shift_jis', 'cp437'):
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return name
with zipfile.ZipFile(src, 'r') as zf:
    for info in zf.infolist():
        if info.is_dir():
            continue
        rel = decode_name(info).replace('\\\\', '/').lstrip('/')
        parts = [p for p in rel.split('/') if p and p != '.']
        if not parts or parts[0] == '__MACOSX' or any(p == '..' for p in parts):
            continue
        target = (dst / '/'.join(parts)).resolve()
        if not target.is_relative_to(dst):
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(info, 'r') as r, open(target, 'wb') as w:
            shutil.copyfileobj(r, w)
`;

async function resolveUploadedModel(inputPath, extractDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (SUPPORTED_MODEL_EXTS.has(ext)) return inputPath;
  if (ext !== '.zip') {
    throw new Error(`不支持的文件格式：${ext}`);
  }
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync('python3', ['-c', ZIP_EXTRACT_PY, inputPath, extractDir]);
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

function startStageSession({ bodyPath = null, headPath = null, hairPath = null, trimBodyHead = true, autoSurgery = true, name, sessionDir }) {
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
    exprLab: null,
  };
  sessions.set(id, session);

  (async () => {
    const resolvedBody = bodyPath ? await resolveUploadedModel(bodyPath, path.join(sessionDir, 'extracted-body')) : null;
    const resolvedHead = headPath ? await resolveUploadedModel(headPath, path.join(sessionDir, 'extracted-head')) : null;
    const resolvedHair = hairPath ? await resolveUploadedModel(hairPath, path.join(sessionDir, 'extracted-hair')) : null;
    const blender = await findBlender();
    if (!blender) {
      throw new Error('未找到 Blender 可执行文件，请安装 Blender 或设置 BLENDER 环境变量。');
    }

    const scriptArgs = ['--out-dir', stagedDir, '--name', name];
    if (resolvedBody) scriptArgs.push('--body', resolvedBody);
    if (resolvedHead) scriptArgs.push('--head', resolvedHead);
    if (resolvedHair) scriptArgs.push('--hair', resolvedHair);
    if (resolvedBody && resolvedHead && trimBodyHead) scriptArgs.push('--trim-body-head');
    if (resolvedHead && autoSurgery) scriptArgs.push('--auto-surgery');

    if (!resolvedBody && resolvedHead) {
      session.stage = autoSurgery
        ? '2/2 正在纯头部测试模式下执行自动局部开刀（分眼眶/睫毛/唇缝）…'
        : '2/2 正在准备纯头部测试过渡场景…';
    } else if (resolvedHead) {
      session.stage = autoSurgery
        ? '2/2 正在裁切旧头、执行头部局部开刀与接颈装配…'
        : '2/2 正在裁切旧头、对齐独立高模头部并准备过渡场景…';
    } else {
      session.stage = '2/2 正在执行 Blender 自动头型拟合与过渡场景导出…';
    }
    spawnBlenderProcess({
      blender,
      scriptRelPath: 'scripts/stage-body-hair.py',
      scriptArgs,
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
            bodyGlbUrl: parsed.hasBody ? `/api/body-hair/stage/${id}/body.glb` : null,
            headGlbUrl: parsed.hasHead ? `/api/body-hair/stage/${id}/head.glb` : null,
            hairGlbUrl: parsed.hasHair ? `/api/body-hair/stage/${id}/hair.glb` : null,
          };
          session.status = 'ready';
          session.stage = parsed.headOnly
            ? '纯头部测试场景已就绪，可微调 42 个五官轮廓点并生成表情。'
            : '过渡调整场景已就绪，可拖拽滑块实时调整。';
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

function validateLandmarks(rawLandmarks, fallbackLandmarks) {
  const merged = { ...(fallbackLandmarks || {}), ...(rawLandmarks || {}) };
  const required = [
    'eyeInnerL', 'eyeOuterL', 'eyeUpperL', 'eyeLowerL',
    'eyeInnerR', 'eyeOuterR', 'eyeUpperR', 'eyeLowerR',
    'mouthCornerL', 'mouthCornerR', 'mouthUpper', 'mouthLower',
    'browInnerL', 'browOuterL', 'browInnerR', 'browOuterR',
  ];
  const isValidCoord = (pt) => Array.isArray(pt) && pt.length === 3 && pt.every((v) => typeof v === 'number' && Number.isFinite(v));
  const out = {};
  for (const k of required) {
    const pt = merged[k];
    if (!isValidCoord(pt)) {
      throw new Error(`五官地标 ${k} 坐标无效。`);
    }
    out[k] = pt.map((v) => Number(v.toFixed(5)));
  }
  for (const [k, pt] of Object.entries(merged)) {
    if (k in out) continue;
    if (/^[a-zA-Z0-9_]+$/.test(k) && isValidCoord(pt)) {
      out[k] = pt.map((v) => Number(v.toFixed(5)));
    }
  }
  return out;
}

function startExpressionJob({ session, landmarks, parts }) {
  const id = randomUUID();
  const isHeadTarget = Boolean(session.data?.hasHead);
  const glbFilename = isHeadTarget ? 'head_expr.glb' : 'body_expr.glb';
  const glbRouteName = isHeadTarget ? 'head-expr.glb' : 'body-expr.glb';
  const landmarksPath = path.join(session.stagedDir, 'landmarks.json');
  const outBlend = path.join(session.stagedDir, 'staged_expr.blend');
  const outExprGlb = path.join(session.stagedDir, glbFilename);
  const job = {
    id,
    name: session.name,
    status: 'running',
    stage: isHeadTarget ? '正在独立高模头部上生成 23 组表情 Shape Keys…' : '正在生成 23 组眼/嘴/眉表情 Shape Keys…',
    log: '',
    error: null,
    result: null,
    previewUrl: null,
    downloadUrl: null,
  };
  jobs.set(id, job);

  (async () => {
    await fs.writeFile(landmarksPath, JSON.stringify(landmarks, null, 2), 'utf8');
    const blender = await findBlender();
    if (!blender) {
      throw new Error('未找到 Blender 可执行文件，请安装 Blender 或设置 BLENDER 环境变量。');
    }

    spawnBlenderProcess({
      blender,
      blendFile: session.data.stagedBlend,
      scriptRelPath: 'scripts/body-hair-expressions.py',
      scriptArgs: [
        '--stage-json',
        session.stageJsonPath,
        '--landmarks-json',
        landmarksPath,
        '--out-blend',
        outBlend,
        '--out-expr-glb',
        outExprGlb,
        '--parts',
        parts.join(','),
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
          job.error = job.log.slice(-1500) || `表情生成进程退出码 ${code}`;
          return;
        }
        const match = job.log.match(/^BODY_HAIR_EXPR_OK\s+(.+)$/m);
        if (!match) {
          job.status = 'failed';
          job.error = '表情生成完成但未收到 BODY_HAIR_EXPR_OK 摘要。';
          return;
        }
        try {
          const parsed = JSON.parse(match[1]);
          const exprGlbUrl = `/api/body-hair/stage/${session.id}/${glbRouteName}`;
          session.data.exprBlend = parsed.exprBlend;
          session.data.exprTarget = parsed.exprTarget;
          session.data.exprGlb = parsed.exprGlb || parsed.bodyExprGlb;
          session.data.exprGlbUrl = exprGlbUrl;
          session.data.bodyExprGlb = isHeadTarget ? session.data.bodyExprGlb : (parsed.exprGlb || parsed.bodyExprGlb);
          session.data.headExprGlb = isHeadTarget ? (parsed.exprGlb || parsed.bodyExprGlb) : session.data.headExprGlb;
          session.data.bodyExprGlbUrl = exprGlbUrl;
          session.data.expressions = parsed.expressions;
          session.data.mouthMode = parsed.mouthMode;
          session.data.faceLandmarks = landmarks;
          job.result = { ...parsed, exprGlbUrl, bodyExprGlbUrl: exprGlbUrl };
          job.status = 'ready';
          job.stage = `已生成 ${parsed.count} 组表情变形键，可直接在过渡窗口试看`;
        } catch (err) {
          job.status = 'failed';
          job.error = `解析表情生成结果失败：${err.message}`;
        }
      },
    });
  })().catch((err) => {
    job.status = 'failed';
    job.error = err.message || String(err);
  });

  return job;
}

function startFinalizeJob({
  session,
  name,
  scaleMult,
  offsetX,
  offsetFB,
  offsetZ,
  headScaleMult = 1.0,
  headOffsetX = 0.0,
  headOffsetFB = 0.0,
  headOffsetZ = 0.0,
  headRotZ = 0.0,
  targetHeight,
  author,
  includeExpressions = true,
}) {
  const id = randomUUID();
  const outVrm = path.join(AVATARS_DIR, `${name}.vrm`);
  const outBlend = path.join(session.dir, `${name}.blend`);
  const useExpr = includeExpressions && Boolean(session.data?.exprBlend);
  const job = {
    id,
    name,
    status: 'running',
    stage: useExpr ? '正在应用微调与表情绑定并导出 VRM…' : '正在按当前滑块参数应用变换并导出 VRM…',
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

    const scriptArgs = [
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
      '--head-scale-mult',
      String(headScaleMult),
      '--head-offset-x',
      String(headOffsetX),
      '--head-offset-fb',
      String(headOffsetFB),
      '--head-offset-z',
      String(headOffsetZ),
      '--head-rot-z',
      String(headRotZ),
      '--name',
      name,
      '--author',
      author,
      '--target-height',
      String(targetHeight),
    ];
    if (useExpr) {
      scriptArgs.push('--bind-expressions');
    }

    spawnBlenderProcess({
      blender,
      blendFile: useExpr ? session.data.exprBlend : session.data.stagedBlend,
      scriptRelPath: 'scripts/finalize-staged-vrm.py',
      scriptArgs,
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

function hasFileEntry(entry) {
  return Boolean(entry && typeof entry !== 'string' && typeof entry.arrayBuffer === 'function' && entry.size > 0);
}

async function saveMultipartUploads(req, ct, prefix, { requireBody = true, requireHair = true } = {}) {
  const rawBody = await readBodyLimited(req, MAX_UPLOAD_BYTES, '上传文件总大小不能超过 300 MB。');
  const form = await new Response(rawBody, { headers: { 'content-type': ct } }).formData();

  const bodyFile = form.get('body');
  const headFile = form.get('head');
  const hairFile = form.get('hair');
  const hasBody = hasFileEntry(bodyFile);
  const hasHead = hasFileEntry(headFile);
  const hasHair = hasFileEntry(hairFile);

  if (requireBody && !hasBody) {
    throw new Error('请上传身体模型文件（支持 .fbx / .glb / .gltf / .zip）。');
  }
  if (!hasBody && !hasHead) {
    throw new Error('请上传“身体模型”，或仅上传“独立高模头部”进入头部测试模式。');
  }
  if (!hasBody && hasHair) {
    throw new Error('仅测头部模式请勿单独上传头发，如需装配头发请同时上传身体模型。');
  }
  if (hasBody && !hasHead && !hasHair) {
    throw new Error('上传身体模型后，请至少再上传“独立头部模型”或“头发模型”。');
  }

  const bodyExt = hasBody ? validateFileEntry(bodyFile, '身体') : null;
  const headExt = hasHead ? validateFileEntry(headFile, '独立头部') : null;
  const hairExt = (requireHair || hasHair) ? validateFileEntry(hairFile, '头发') : null;

  const workDir = path.join(WORK_ROOT, `${prefix}-${randomUUID()}`);
  const uploadsDir = path.join(workDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  let bodyPath = null;
  if (hasBody && bodyExt) {
    bodyPath = path.join(uploadsDir, `body${bodyExt}`);
    await fs.writeFile(bodyPath, Buffer.from(await bodyFile.arrayBuffer()));
  }

  let headPath = null;
  if (hasHead && headExt) {
    headPath = path.join(uploadsDir, `head${headExt}`);
    await fs.writeFile(headPath, Buffer.from(await headFile.arrayBuffer()));
  }

  let hairPath = null;
  if (hasHair && hairExt) {
    hairPath = path.join(uploadsDir, `hair${hairExt}`);
    await fs.writeFile(hairPath, Buffer.from(await hairFile.arrayBuffer()));
  }

  return { form, workDir, bodyPath, headPath, hairPath };
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

      const { form, workDir, bodyPath, headPath, hairPath } = await saveMultipartUploads(req, ct, 'stage', { requireBody: false, requireHair: false });
      const name = sanitizeSlug(form.get('name'));
      const trimBodyHead = String(form.get('trimBodyHead') ?? 'true').toLowerCase() !== 'false';
      const autoSurgery = String(form.get('autoSurgery') ?? 'true').toLowerCase() !== 'false';
      const session = startStageSession({ bodyPath, headPath, hairPath, trimBodyHead, autoSurgery, name, sessionDir: workDir });
      sendJson(res, 202, { id: session.id, status: session.status, name: session.name });
      return true;
    }

    const stageDlMatch = pathname.match(/^\/api\/body-hair\/stage\/([a-f0-9-]{36})\/download\/(staged\.blend|staged-expr\.blend|head\.glb|head-expr\.glb)$/);
    if (stageDlMatch && req.method === 'GET') {
      const session = sessions.get(stageDlMatch[1]);
      if (!session || session.status !== 'ready' || !session.data) {
        sendJson(res, 404, { error: '过渡预览场景尚未就绪或不存在。' });
        return true;
      }
      const kind = stageDlMatch[2];
      const pathMap = {
        'staged.blend': session.data.stagedBlend,
        'staged-expr.blend': session.data.exprBlend,
        'head.glb': session.data.headGlb,
        'head-expr.glb': session.data.headExprGlb,
      };
      const filePath = pathMap[kind];
      if (!filePath) {
        sendJson(res, 404, { error: `文件 ${kind} 尚未生成。` });
        return true;
      }
      const buf = await fs.readFile(filePath);
      const ext = path.extname(kind).toLowerCase();
      const mimeType = ext === '.glb' ? 'model/gltf-binary' : 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': buf.length,
        'Content-Disposition': `attachment; filename="${session.name}-${kind}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
      return true;
    }

    if (pathname === '/api/body-hair/expression-lab' && req.method === 'POST') {
      const raw = await readBodyLimited(req, MAX_JSON_BYTES, '参数内容过大。');
      const payload = JSON.parse(raw.toString('utf8'));
      const session = sessions.get(String(payload?.sessionId || ''));
      if (!session || session.status !== 'ready' || !session.data?.stagedBlend) {
        sendJson(res, 404, { error: '过渡调整会话不存在或尚未就绪。' });
        return true;
      }
      const sourceBlend = session.data.exprBlend || session.data.stagedBlend;
      const srcStat = await fs.stat(sourceBlend);
      if (session.exprLab && session.exprLab.sourceBlend === sourceBlend && session.exprLab.mtimeMs === srcStat.mtimeMs) {
        sendJson(res, 200, { url: session.exprLab.url, reused: true });
        return true;
      }
      if (session.exprLab?.close) {
        await session.exprLab.close().catch(() => {});
        session.exprLab = null;
      }
      const labDir = path.join(session.dir, `expression-lab-${Date.now()}`);
      const visibleObjects = session.data.hasHead
        ? (session.data.headMeshes || [])
        : (session.data.bodyMeshes || []);
      const blender = await findBlender();
      const config = visibleObjects.length
        ? { objects: visibleObjects, render_objects: visibleObjects }
        : {};
      await initializeLab(sourceBlend, labDir, { blender: blender || undefined, config });
      const served = await serveLab(labDir, { port: 0 });
      session.exprLab = {
        url: served.url,
        close: served.close,
        dir: labDir,
        sourceBlend,
        mtimeMs: srcStat.mtimeMs,
      };
      sendJson(res, 200, { url: served.url, dir: labDir });
      return true;
    }

    const glbMatch = pathname.match(/^\/api\/body-hair\/stage\/([a-f0-9-]{36})\/(body|head|hair|body-expr|head-expr)\.glb$/);
    if (glbMatch && req.method === 'GET') {
      const session = sessions.get(glbMatch[1]);
      if (!session || session.status !== 'ready' || !session.data) {
        sendJson(res, 404, { error: '过渡预览场景尚未就绪或不存在。' });
        return true;
      }
      const keyMap = {
        body: 'bodyGlb',
        head: 'headGlb',
        hair: 'hairGlb',
        'body-expr': 'bodyExprGlb',
        'head-expr': 'headExprGlb',
      };
      const targetPath = session.data[keyMap[glbMatch[2]]];
      if (!targetPath) {
        sendJson(res, 404, { error: '对应的预览 GLB 尚未生成。' });
        return true;
      }
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

    if (pathname === '/api/body-hair/expressions' && req.method === 'POST') {
      if (hasActiveTask()) {
        sendJson(res, 409, { error: '当前已有任务正在运行，请稍候重试。' });
        return true;
      }
      const raw = await readBodyLimited(req, MAX_JSON_BYTES, '参数内容过大。');
      const payload = JSON.parse(raw.toString('utf8'));
      const session = sessions.get(String(payload?.sessionId || ''));
      if (!session || session.status !== 'ready' || !session.data?.stagedBlend) {
        sendJson(res, 404, { error: '过渡调整会话不存在或尚未就绪，请先上传模型。' });
        return true;
      }
      const allowedParts = new Set(['eyes', 'mouth', 'brows']);
      const rawParts = Array.isArray(payload?.parts) ? payload.parts : ['eyes', 'mouth', 'brows'];
      const parts = [...new Set(rawParts.map((p) => String(p).trim().toLowerCase()).filter((p) => allowedParts.has(p)))];
      if (!parts.length) {
        sendJson(res, 400, { error: '请至少选择一个需要生成的表情部位（eyes / mouth / brows）。' });
        return true;
      }
      const landmarks = validateLandmarks(payload?.landmarks, session.data.faceLandmarks);
      const job = startExpressionJob({ session, landmarks, parts });
      sendJson(res, 202, { id: job.id, status: job.status, name: job.name });
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
      if (session.data.headOnly || !session.data.hasBody) {
        sendJson(res, 400, { error: '当前为纯头部测试模式（未上传身体骨骼），不支持导出全身 VRM；可下载带表情的 GLB/Blend 或打开 Expression Lab 对比视图。' });
        return true;
      }

      const name = sanitizeSlug(payload.name || session.name);
      const scaleMult = parseFiniteNumber(payload.scaleMult, 1.0, { positive: true, min: 0.2, max: 3.0, label: '头发等比缩放' });
      const offsetX = parseFiniteNumber(payload.offsetX, 0.0, { min: -1.0, max: 1.0, label: '左右偏移' });
      const offsetFB = parseFiniteNumber(payload.offsetFB, 0.0, { min: -1.0, max: 1.0, label: '前后偏移' });
      const offsetZ = parseFiniteNumber(payload.offsetZ, 0.0, { min: -1.0, max: 1.0, label: '上下偏移' });
      const headScaleMult = parseFiniteNumber(payload.headScaleMult, 1.0, { positive: true, min: 0.3, max: 3.0, label: '头部等比缩放' });
      const headOffsetX = parseFiniteNumber(payload.headOffsetX, 0.0, { min: -1.0, max: 1.0, label: '头部左右偏移' });
      const headOffsetFB = parseFiniteNumber(payload.headOffsetFB, 0.0, { min: -1.0, max: 1.0, label: '头部前后偏移' });
      const headOffsetZ = parseFiniteNumber(payload.headOffsetZ, 0.0, { min: -1.0, max: 1.0, label: '头部上下偏移' });
      const headRotZ = parseFiniteNumber(payload.headRotZ, 0.0, { min: -360, max: 360, label: '头部旋转角度' });
      const targetHeight = parseFiniteNumber(payload.targetHeight, 1.6, { min: 0, max: 5.0, label: '目标身高' });
      const author = String(payload.author || '').trim() || 'Charakuru Local Blender';
      const includeExpressions = payload.includeExpressions !== false;

      const job = startFinalizeJob({
        session,
        name,
        scaleMult,
        offsetX,
        offsetFB,
        offsetZ,
        headScaleMult,
        headOffsetX,
        headOffsetFB,
        headOffsetZ,
        headRotZ,
        targetHeight,
        author,
        includeExpressions,
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
