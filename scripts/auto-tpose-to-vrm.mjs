#!/usr/bin/env node
/**
 * End-to-end full-body pipeline:
 *   T-pose image -> Tripo Open API (generate + rig) -> Headless Blender -> VRM 1.0 + Blend
 * Or local conversion test mode:
 *   --input-model <rigged.glb|fbx> -> Headless Blender -> VRM 1.0 + Blend
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findBlender } from '../server-jobs.mjs';
import { loadApiKey, generateRiggedFullbody } from './tripo-api.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function printHelp() {
  console.log(`Usage:
  node scripts/auto-tpose-to-vrm.mjs <tpose-image> [options]
  node scripts/auto-tpose-to-vrm.mjs --input-model <rigged.glb|fbx> [options]

Options:
  --input-model <path>     Skip Tripo API and convert an existing rigged GLB/GLTF/FBX
  --name <slug>            Output name stem (default: sanitized input filename stem)
  --out-dir <dir>          Working/intermediate output directory (default: work/auto-<name>)
  --model-version <ver>    Tripo model_version (default: v2.5-20250123)
  --target-height <m>      Target character height in meters; 0 disables scaling (default: 1.6)
  --author <name>          VRM metadata author (default: Charakuru Auto)
  -h, --help               Show this help message

Environment:
  TRIPO_API_KEY            Required unless --input-model is specified (or set in .env)
  BLENDER                  Optional explicit path to Blender executable
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
    imagePath: null,
    inputModel: null,
    name: null,
    outDir: null,
    modelVersion: 'v2.5-20250123',
    targetHeight: 1.6,
    author: 'Charakuru Auto',
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

    if (flag === '--input-model') opts.inputModel = nextValue();
    else if (flag === '--name') opts.name = nextValue();
    else if (flag === '--out-dir') opts.outDir = nextValue();
    else if (flag === '--model-version') opts.modelVersion = nextValue();
    else if (flag === '--target-height') {
      const val = Number(nextValue());
      if (!Number.isFinite(val) || val < 0) throw new Error('--target-height must be a non-negative number');
      opts.targetHeight = val;
    } else if (flag === '--author') opts.author = nextValue();
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (!opts.imagePath) opts.imagePath = arg;
    else throw new Error(`Unexpected extra positional argument: ${arg}`);
  }
  return opts;
}

function runBlenderConversion({ blender, inputModel, outVrm, outBlend, name, author, targetHeight }) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ROOT, 'scripts', 'fullbody-to-vrm.py');
    const args = [
      '--background',
      '--disable-autoexec',
      '--python-exit-code',
      '1',
      '--python',
      scriptPath,
      '--',
      '--input',
      inputModel,
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
      const match = stdout.match(/^FULLBODY_VRM_OK\s+(.+)$/m);
      if (!match) {
        reject(new Error('Blender finished without FULLBODY_VRM_OK summary output.'));
        return;
      }
      try {
        resolve(JSON.parse(match[1]));
      } catch (err) {
        reject(new Error(`Failed to parse FULLBODY_VRM_OK JSON: ${err.message}`));
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

  if (!opts.imagePath && !opts.inputModel) {
    printHelp();
    throw new Error('Provide either <tpose-image> or --input-model <path>.');
  }

  const sourcePath = path.resolve(opts.inputModel || opts.imagePath);
  await fs.access(sourcePath);

  const name = sanitizeSlug(opts.name || path.parse(sourcePath).name);
  const outDir = path.resolve(opts.outDir || path.join(ROOT, 'work', `auto-${name}`));
  const outVrm = path.join(ROOT, 'public', 'avatars', `${name}.vrm`);
  const outBlend = path.join(outDir, `${name}.blend`);
  await fs.mkdir(outDir, { recursive: true });

  let modelToConvert = sourcePath;
  let tripoResult = null;

  if (!opts.inputModel) {
    const apiKey = await loadApiKey(path.join(ROOT, '.env'));
    console.log(`[1/3] Running Tripo Open API (${opts.modelVersion})...`);
    tripoResult = await generateRiggedFullbody({
      apiKey,
      imagePath: sourcePath,
      outDir,
      modelVersion: opts.modelVersion,
      onProgress: ({ stage, message }) => {
        if (message) console.log(`  [${stage}] ${message}`);
      },
    });
    modelToConvert = tripoResult.modelPath;
  } else {
    console.log(`[1/3] Using local rigged model: ${modelToConvert}`);
  }

  const blender = await findBlender();
  if (!blender) {
    throw new Error('Blender not found. Set BLENDER=/path/to/Blender or install Blender.');
  }
  console.log(`[2/3] Converting to VRM 1.0 + MToon using ${blender}...`);
  const vrmSummary = await runBlenderConversion({
    blender,
    inputModel: modelToConvert,
    outVrm,
    outBlend,
    name,
    author: opts.author,
    targetHeight: opts.targetHeight,
  });

  const previewPort = process.env.PORT || '8766';
  const previewUrl = `http://127.0.0.1:${previewPort}/vrm-viewer.html?model=${encodeURIComponent(name + '.vrm')}&walk=1`;

  console.log('\n[3/3] Done!');
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        name,
        tripo: tripoResult,
        vrm: vrmSummary,
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
