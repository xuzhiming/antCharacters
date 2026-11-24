#!/usr/bin/env node
/**
 * One-click CLI: T-pose body model (.fbx/.glb/.zip) + hair model (.fbx/.glb/.zip)
 *   -> auto-aligned, bound to head bone, MToon converted, exported to VRM 1.0 + Blend.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findBlender } from '../server-jobs.mjs';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SUPPORTED_MODEL_EXTS = new Set(['.fbx', '.glb', '.gltf']);

function printHelp() {
  console.log(`Usage:
  node scripts/body-hair-to-vrm.mjs --body <body.fbx|glb|zip> --hair <hair.fbx|glb|zip> [options]

Options:
  --body <path>             Body model (.fbx, .glb, .gltf, or .zip containing one)
  --hair <path>             Hair model (.fbx, .glb, .gltf, or .zip containing one)
  --name <slug>             Output name stem (default: sanitized body filename stem)
  --out-dir <dir>           Working/intermediate directory (default: work/body-hair-<name>)
  --target-height <m>       Target height in meters; 0 disables scaling (default: 1.6)
  --hair-scale-mult <f>     Fine-tune multiplier on auto-computed hair scale (default: 1.0)
  --hair-offset <x,y,z>     Extra manual offset on top of auto-fit in body-height units (default: 0,0,0)
  --author <str>            VRM metadata author (default: Charakuru Local Blender)
  -h, --help                Show this help message
`);
}

function sanitizeSlug(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'avatar';
}

function parseArgs(argv) {
  const opts = {
    body: null,
    hair: null,
    name: null,
    outDir: null,
    targetHeight: 1.6,
    hairScaleMult: 1.0,
    hairOffset: '0,0,0',
    author: 'Charakuru Local Blender',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }
    const eqIdx = arg.indexOf('=');
    const flag = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg;
    const nextValue = () => {
      if (eqIdx !== -1) return arg.slice(eqIdx + 1);
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${flag}`);
      i += 1;
      return argv[i];
    };

    if (flag === '--body') opts.body = nextValue();
    else if (flag === '--hair') opts.hair = nextValue();
    else if (flag === '--name') opts.name = nextValue();
    else if (flag === '--out-dir') opts.outDir = nextValue();
    else if (flag === '--target-height') {
      const v = Number(nextValue());
      if (!Number.isFinite(v) || v < 0) throw new Error('--target-height must be a non-negative number');
      opts.targetHeight = v;
    } else if (flag === '--hair-scale-mult') {
      const v = Number(nextValue());
      if (!Number.isFinite(v) || v <= 0) throw new Error('--hair-scale-mult must be a positive number');
      opts.hairScaleMult = v;
    } else if (flag === '--hair-offset') opts.hairOffset = nextValue();
    else if (flag === '--author') opts.author = nextValue();
    else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

async function findModelInDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const subdirs = [];
  for (const entry of entries) {
    if (entry.name === '__MACOSX' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && SUPPORTED_MODEL_EXTS.has(path.extname(entry.name).toLowerCase())) {
      return full;
    }
    if (entry.isDirectory()) subdirs.push(full);
  }
  for (const sub of subdirs) {
    const found = await findModelInDir(sub);
    if (found) return found;
  }
  return null;
}

async function resolveModelInput(inputPath, extractDir) {
  const resolved = path.resolve(inputPath);
  await fs.access(resolved);
  const ext = path.extname(resolved).toLowerCase();
  if (SUPPORTED_MODEL_EXTS.has(ext)) return resolved;
  if (ext !== '.zip') {
    throw new Error(`Unsupported input "${resolved}". Expected .fbx, .glb, .gltf, or .zip.`);
  }
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });
  await execFileAsync('unzip', ['-q', '-o', resolved, '-d', extractDir]);
  const modelFile = await findModelInDir(extractDir);
  if (!modelFile) {
    throw new Error(`No .fbx/.glb/.gltf file found inside ${resolved}`);
  }
  return modelFile;
}

function runBlenderAssembly({
  blender,
  bodyModel,
  hairModel,
  outVrm,
  outBlend,
  name,
  author,
  targetHeight,
  hairScaleMult,
  hairOffset,
}) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ROOT, 'scripts', 'body-hair-to-vrm.py');
    const args = [
      '--background',
      '--disable-autoexec',
      '--python-exit-code',
      '1',
      '--python',
      scriptPath,
      '--',
      '--body',
      bodyModel,
      '--hair',
      hairModel,
      '--out-vrm',
      outVrm,
      '--out-blend',
      outBlend,
      '--name',
      name,
      '--author',
      author,
      '--target-height',
      String(targetHeight),
      '--hair-scale-mult',
      String(hairScaleMult),
      '--hair-offset',
      hairOffset,
    ];

    const child = spawn(blender, args, {
      cwd: ROOT,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Blender exited with code ${code}\n${stderr.slice(-1500)}`));
        return;
      }
      const match = stdout.match(/^BODY_HAIR_VRM_OK\s+(.+)$/m);
      if (!match) {
        reject(new Error('Blender finished without BODY_HAIR_VRM_OK summary output.'));
        return;
      }
      try {
        resolve(JSON.parse(match[1]));
      } catch (err) {
        reject(new Error(`Failed to parse BODY_HAIR_VRM_OK JSON: ${err.message}`));
      }
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (!opts.body || !opts.hair) {
    printHelp();
    throw new Error('Both --body and --hair are required.');
  }

  const name = sanitizeSlug(opts.name || path.parse(opts.body).name);
  const outDir = path.resolve(opts.outDir || path.join(ROOT, 'work', `body-hair-${name}`));
  const inputsDir = path.join(outDir, 'inputs');
  await fs.mkdir(inputsDir, { recursive: true });

  console.log('[1/3] Preparing body & hair inputs...');
  const bodyModel = await resolveModelInput(opts.body, path.join(inputsDir, 'body'));
  const hairModel = await resolveModelInput(opts.hair, path.join(inputsDir, 'hair'));
  console.log(`  body: ${bodyModel}`);
  console.log(`  hair: ${hairModel}`);

  const blender = await findBlender();
  if (!blender) {
    throw new Error('Blender not found. Set BLENDER=/path/to/Blender or install Blender.');
  }

  const outVrm = path.join(ROOT, 'public', 'avatars', `${name}.vrm`);
  const outBlend = path.join(outDir, `${name}.blend`);

  console.log(`[2/3] Combining, aligning hair, converting to VRM 1.0 + MToon using ${blender}...`);
  const summary = await runBlenderAssembly({
    blender,
    bodyModel,
    hairModel,
    outVrm,
    outBlend,
    name,
    author: opts.author,
    targetHeight: opts.targetHeight,
    hairScaleMult: opts.hairScaleMult,
    hairOffset: opts.hairOffset,
  });

  const previewPort = process.env.PORT || '8766';
  const previewUrl = `http://127.0.0.1:${previewPort}/vrm-viewer.html?model=${encodeURIComponent(name + '.vrm')}&walk=1`;

  console.log('\n[3/3] Done!');
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        name,
        vrm: summary,
        previewUrl,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
