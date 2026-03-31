#!/usr/bin/env node

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const PAGE_GOTO_TIMEOUT_MS = 60000;
const GRAPH_API_TIMEOUT_MS = 240000;
const BROWSER_LAUNCH_TIMEOUT_MS = 15000;

function printUsage() {
  console.log(`Usage:
  node scripts/render-graph-video.mjs --script ./scripts/video-script.example.json [options]

Required:
  --script, -s       Path to JSON action script

Options:
  --output, -o       Output video path (default: ./tmp/graph-video.mp4)
  --fps              Frames per second (default: 30)
  --width            Viewport width (default: 1920)
  --height           Viewport height (default: 1080)
  --url              Use an already-running graph URL (skip local static server)
  --fast-path        Try in-browser MediaRecorder first (experimental)
  --frames-dir       Directory for intermediate PNG frames
  --keep-frames      Keep PNG frames after ffmpeg completes
  --verbose, -v      Enable verbose diagnostics
  --help, -h         Show this help
`);
}

function parseArgs(argv) {
  const parsed = {
    output: path.resolve(projectRoot, 'tmp', 'graph-video.mp4'),
    fps: DEFAULT_FPS,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    url: null,
    fastPath: false,
    scriptPath: null,
    framesDir: null,
    keepFrames: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      case '--script':
      case '-s':
        parsed.scriptPath = next;
        i += 1;
        break;
      case '--output':
      case '-o':
        parsed.output = path.resolve(next);
        i += 1;
        break;
      case '--fps':
        parsed.fps = Number(next);
        i += 1;
        break;
      case '--width':
        parsed.width = Number(next);
        i += 1;
        break;
      case '--height':
        parsed.height = Number(next);
        i += 1;
        break;
      case '--url':
        parsed.url = next;
        i += 1;
        break;
      case '--fast-path':
        parsed.fastPath = true;
        break;
      case '--frames-dir':
        parsed.framesDir = path.resolve(next);
        i += 1;
        break;
      case '--keep-frames':
        parsed.keepFrames = true;
        break;
      case '--verbose':
      case '-v':
        parsed.verbose = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(parsed.fps) || parsed.fps <= 0) {
    throw new Error('--fps must be a positive number.');
  }
  if (!Number.isFinite(parsed.width) || parsed.width <= 0) {
    throw new Error('--width must be a positive number.');
  }
  if (!Number.isFinite(parsed.height) || parsed.height <= 0) {
    throw new Error('--height must be a positive number.');
  }

  return parsed;
}

function makeLogger(verbose) {
  const ts = () => new Date().toISOString();
  const format = (level, message) => `[${ts()}] [${level}] ${message}`;
  return {
    info(message) {
      console.log(format('info', message));
    },
    warn(message) {
      console.warn(format('warn', message));
    },
    debug(message) {
      if (!verbose) return;
      console.log(format('debug', message));
    },
  };
}

function formatError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return error.stack || error.message || String(error);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? 'pipe',
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${command}): exit code ${code}`));
    });
  });
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new Error('Expected a base64 data URL string.');
  }

  const match = /^data:(.+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error('Unexpected data URL payload.');
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function parseDurationFromFfmpegOutput(output) {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  return (hours * 3600) + (minutes * 60) + seconds;
}

async function probeVideoDurationSeconds(ffmpegPath, filePath) {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
      env: process.env,
    });

    let output = '';
    const appendChunk = (chunk) => {
      if (!chunk) return;
      output += String(chunk);
    };
    child.stdout?.on('data', appendChunk);
    child.stderr?.on('data', appendChunk);
    child.once('error', () => resolve(null));
    child.once('close', () => resolve(parseDurationFromFfmpegOutput(output)));
  });
}

function createTimingStats() {
  return {
    frameSeekMs: 0,
    frameCaptureMs: 0,
    frameOutputMs: 0,
    frameCount: 0,
    ffmpegFinalizeMs: 0,
  };
}

function formatAverageMs(totalMs, sampleCount) {
  if (!sampleCount) return '0.00';
  return (totalMs / sampleCount).toFixed(2);
}

function logTimingSummary(logger, stats) {
  logger.info(
    `Timing summary: avg seek ${formatAverageMs(stats.frameSeekMs, stats.frameCount)} ms, `
      + `avg capture ${formatAverageMs(stats.frameCaptureMs, stats.frameCount)} ms, `
      + `avg output ${formatAverageMs(stats.frameOutputMs, stats.frameCount)} ms, `
      + `ffmpeg finalize ${stats.ffmpegFinalizeMs.toFixed(2)} ms`,
  );
}

function getFrameStateSignature(frameState) {
  if (!frameState) return null;
  return JSON.stringify({
    sceneVersion: frameState.sceneVersion ?? null,
    visibilityMode: frameState.visibilityMode ?? null,
    selectedNodeIds: frameState.selectedNodeIds ?? [],
    tooltips: frameState.tooltips ?? [],
    cameraState: frameState.cameraState ?? null,
  });
}

function startFfmpegEncoder(ffmpegPath, args) {
  const ffmpegArgs = [
    '-y',
    '-hide_banner',
    '-loglevel', 'warning',
    '-threads', '1',
    '-filter_threads', '1',
    '-f', 'png_pipe',
    '-framerate', String(args.fps),
    '-i', 'pipe:0',
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    args.output,
  ];

  const child = spawn(ffmpegPath, ffmpegArgs, {
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: process.cwd(),
    env: process.env,
  });

  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${ffmpegPath}): exit code ${code}`));
    });
  });

  return {
    async writeFrame(frameBuffer) {
      if (!child.stdin || child.stdin.destroyed) {
        throw new Error('ffmpeg stdin closed before all frames were written.');
      }
      if (child.stdin.write(frameBuffer)) {
        return;
      }
      await once(child.stdin, 'drain');
    },
    async finish() {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
      await done;
    },
    async abort() {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.destroy();
      }
      child.kill('SIGKILL');
      await done.catch(() => {});
    },
  };
}

function isChromiumSandboxLaunchError(error) {
  const message = String(error?.message || error || '');
  return /sandbox|setuid|credentials\.cc|permission denied/i.test(message);
}

function isBrowserDependencyLaunchError(error) {
  const message = String(error?.message || error || '');
  return /error while loading shared libraries|failed to launch the browser process|lib[a-z0-9._-]+\.so/i
    .test(message);
}

async function resolveFfmpegPath() {
  try {
    await runCommand('ffmpeg', ['-version'], { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    // Fall through.
  }

  try {
    const module = await import('ffmpeg-static');
    const ffmpegPath = module.default ?? module;
    if (typeof ffmpegPath === 'string' && ffmpegPath.length > 0) {
      await fs.access(ffmpegPath, fsSync.constants.X_OK);
      return ffmpegPath;
    }
  } catch {
    // Fall through.
  }

  throw new Error(
    'ffmpeg is required but was not found in PATH, and ffmpeg-static is unavailable.',
  );
}

async function loadPuppeteer() {
  try {
    const module = await import('puppeteer');
    return module.default ?? module;
  } catch {
    throw new Error(
      'Missing dependency "puppeteer". Install it with: npm install --save-dev puppeteer',
    );
  }
}

async function loadChromiumFallbackRuntime() {
  const [puppeteerCoreModule, chromiumModule, helperModule, lambdafsModule] = await Promise.all([
    import('puppeteer-core'),
    import('@sparticuz/chromium'),
    import(
      pathToFileURL(
        path.resolve(projectRoot, 'node_modules', '@sparticuz', 'chromium', 'build', 'esm', 'helper.js'),
      ).href
    ),
    import(
      pathToFileURL(
        path.resolve(projectRoot, 'node_modules', '@sparticuz', 'chromium', 'build', 'esm', 'lambdafs.js'),
      ).href
    ),
  ]);

  return {
    puppeteerCore: puppeteerCoreModule.default ?? puppeteerCoreModule,
    chromium: chromiumModule.default ?? chromiumModule,
    helper: helperModule,
    lambdafs: lambdafsModule,
  };
}

async function launchBundledChromium(launchOptions, logger) {
  const { puppeteerCore, chromium, helper, lambdafs } = await loadChromiumFallbackRuntime();
  const chromiumBinDir = path.resolve(projectRoot, 'node_modules', '@sparticuz', 'chromium', 'bin');
  const al2023ArchivePath = path.join(chromiumBinDir, 'al2023.tar.br');
  const al2023LibPath = path.join('/tmp', 'al2023', 'lib');

  if (fsSync.existsSync(al2023ArchivePath) && !fsSync.existsSync(al2023LibPath)) {
    await lambdafs.inflate(al2023ArchivePath);
  }
  helper.setupLambdaEnvironment(al2023LibPath);

  const executablePath = await chromium.executablePath();
  logger.debug(`Chromium fallback executable: ${executablePath}`);

  const browser = await puppeteerCore.launch({
    executablePath,
    headless: 'shell',
    timeout: BROWSER_LAUNCH_TIMEOUT_MS,
    defaultViewport: launchOptions.defaultViewport,
    args: puppeteerCore.defaultArgs({
      args: chromium.args,
      headless: 'shell',
    }),
  });

  logger.debug(`Chromium fallback executable: ${executablePath}`);
  return browser;
}

async function launchBrowserWithFallbacks({ defaultPuppeteer, launchOptions, logger }) {
  const attemptDefaultLaunch = async (extraArgs = []) => {
    return defaultPuppeteer.launch({
      ...launchOptions,
      timeout: BROWSER_LAUNCH_TIMEOUT_MS,
      args: [...launchOptions.args, ...extraArgs],
    });
  };

  try {
    const browser = await attemptDefaultLaunch();
    return { browser, runtime: 'puppeteer' };
  } catch (error) {
    if (isChromiumSandboxLaunchError(error)) {
      logger.warn(
        'Chromium sandbox launch failed. Retrying with --no-sandbox --disable-setuid-sandbox.',
      );
      try {
        const browser = await attemptDefaultLaunch(['--no-sandbox', '--disable-setuid-sandbox']);
        return { browser, runtime: 'puppeteer' };
      } catch (retryError) {
        logger.warn(`No-sandbox Chromium launch failed: ${formatError(retryError)}`);
      }
    } else if (isBrowserDependencyLaunchError(error)) {
      logger.warn(`Default Chromium launch failed: ${formatError(error)}`);
    } else {
      logger.warn(`Default Chromium launch failed unexpectedly: ${formatError(error)}`);
    }
  }

  logger.warn('Default Chromium could not start in this environment. Trying @sparticuz/chromium.');
  const browser = await launchBundledChromium(launchOptions, logger);
  return { browser, runtime: '@sparticuz/chromium' };
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function startStaticServer(rootDir) {
  const normalizedRoot = path.resolve(rootDir);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const requestPath = decodeURIComponent(url.pathname);
      const relativePath = requestPath === '/'
        ? 'index.html'
        : requestPath.replace(/^\/+/, '');
      const absolutePath = path.resolve(normalizedRoot, relativePath);
      const relativeFromRoot = path.relative(normalizedRoot, absolutePath);

      if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      const stats = await fs.stat(absolutePath).catch(() => null);
      if (!stats || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(200, { 'Content-Type': getMimeType(absolutePath) });
      fsSync.createReadStream(absolutePath).pipe(res);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine local server address.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

function attachPageDiagnostics(page, logger, verbose) {
  page.on('pageerror', (error) => {
    logger.warn(`Page runtime error: ${formatError(error)}`);
  });

  page.on('error', (error) => {
    logger.warn(`Page crashed/error event: ${formatError(error)}`);
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    logger.warn(
      `Request failed (${request.method()} ${request.url()}): ${failure?.errorText || 'unknown'}`,
    );
  });

  page.on('console', (message) => {
    if (!verbose) return;
    logger.debug(`Page console [${message.type()}] ${message.text()}`);
  });
}

async function getCanvasCaptureClip(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#canvas-container canvas')
      ?? document.querySelector('canvas');
    if (!canvas) {
      throw new Error('Could not find the graph canvas for screenshot capture.');
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      scale: 1,
    };
  });
}

async function captureFrameAsPngBuffer(client, clip) {
  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    clip,
    fromSurface: true,
    captureBeyondViewport: false,
  });
  return Buffer.from(data, 'base64');
}

async function tryFastRecord(page, { fps, duration }, timingStats, logger) {
  logger.info('Trying in-browser MediaRecorder fast path...');
  const recordStart = performance.now();

  const browserRecording = await page.evaluate(async ({ fps, duration: timelineDuration }) => {
    const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
    if (!canvas || typeof canvas.captureStream !== 'function') {
      throw new Error('Canvas captureStream() is unavailable.');
    }
    if (typeof MediaRecorder !== 'function') {
      throw new Error('MediaRecorder is unavailable.');
    }

    const preferredMimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = preferredMimeTypes.find((candidate) => {
      return typeof MediaRecorder.isTypeSupported !== 'function'
        || MediaRecorder.isTypeSupported(candidate);
    }) ?? '';

    const frameTotal = Math.max(1, Math.floor((timelineDuration * fps) + 1));
    const stream = canvas.captureStream(0);
    const [videoTrack] = stream.getVideoTracks();

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: 12_000_000 } : { videoBitsPerSecond: 12_000_000 },
    );
    const chunks = [];
    let totalSeekMs = 0;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const stopPromise = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => {
        reject(recorder.error ?? new Error('MediaRecorder failed.'));
      };
    });

    recorder.start(250);
    await new Promise((resolve) => setTimeout(resolve, 0));

    for (let frameIndex = 0; frameIndex < frameTotal; frameIndex += 1) {
      const seekStart = performance.now();
      await window.graphVideo.seek(frameIndex / fps);
      totalSeekMs += performance.now() - seekStart;
      if (videoTrack && typeof videoTrack.requestFrame === 'function') {
        videoTrack.requestFrame();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 / fps));
    }

    await new Promise((resolve) => setTimeout(resolve, Math.max(500, 1000 / fps)));
    recorder.stop();
    await stopPromise;
    stream.getTracks().forEach((track) => track.stop());

    const resolvedMimeType = recorder.mimeType || mimeType || 'video/webm';
    const blob = new Blob(chunks, { type: resolvedMimeType });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const binaryChunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += binaryChunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + binaryChunkSize));
    }

    return {
      dataUrl: `data:${resolvedMimeType};base64,${btoa(binary)}`,
      frameCount: frameTotal,
      totalSeekMs,
    };
  }, { fps, duration });

  timingStats.frameCaptureMs = performance.now() - recordStart;
  timingStats.frameSeekMs = Number(browserRecording.totalSeekMs) || 0;
  timingStats.frameCount = Number(browserRecording.frameCount) || 0;
  return browserRecording;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = makeLogger(args.verbose);
  const timingStats = createTimingStats();
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.scriptPath) {
    printUsage();
    throw new Error('Missing required --script argument.');
  }

  const scriptPath = path.resolve(args.scriptPath);
  logger.info(`Loading timeline script: ${scriptPath}`);
  const scriptContents = await fs.readFile(scriptPath, 'utf8');
  const actions = JSON.parse(scriptContents);
  if (!Array.isArray(actions)) {
    throw new Error(`Script file must contain a JSON array: ${scriptPath}`);
  }
  logger.info(`Loaded ${actions.length} action(s).`);
  if (args.verbose) {
    logger.debug(`Action preview: ${JSON.stringify(actions.slice(0, 3), null, 2)}`);
  }

  const ffmpegPath = await resolveFfmpegPath();
  const puppeteer = await loadPuppeteer();

  await fs.mkdir(path.dirname(args.output), { recursive: true });

  const shouldPersistFrames = Boolean(args.framesDir || args.keepFrames);
  let frameRoot = shouldPersistFrames
    ? (
      args.framesDir
        ? path.resolve(args.framesDir)
        : path.resolve(projectRoot, 'tmp', `graph-video-frames-${Date.now()}`)
    )
    : null;
  if (frameRoot) {
    await fs.mkdir(frameRoot, { recursive: true });
    logger.info(`Frame directory: ${frameRoot}`);
  } else {
    logger.info('Frame output: streaming PNG frames directly to ffmpeg.');
  }

  let browser = null;
  let localServer = null;
  let ffmpegEncoder = null;

  try {
    if (!args.url) {
      localServer = await startStaticServer(projectRoot);
      logger.info(`Local server started at ${localServer.url}`);
    }

    const launchOptions = {
      headless: 'new',
      defaultViewport: {
        width: Math.round(args.width),
        height: Math.round(args.height),
        deviceScaleFactor: 1,
      },
      args: [
        '--disable-dev-shm-usage',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    };
    const launchResult = await launchBrowserWithFallbacks({
      defaultPuppeteer: puppeteer,
      launchOptions,
      logger,
    });
    browser = launchResult.browser;
    logger.info(`Browser launched successfully (${launchResult.runtime}).`);

    const pageUrl = args.url || localServer.url;
    let page = null;
    const initializeRenderPage = async () => {
      if (page) {
        const previousPage = page;
        // Do not let a stuck page close block fallback startup.
        Promise.race([
          previousPage.close().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 2000)),
        ]).catch(() => {});
        page = null;
      }
      page = await browser.newPage();
      attachPageDiagnostics(page, logger, args.verbose);
      logger.info(`Opening graph page: ${pageUrl}`);
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT_MS });
      await page.waitForFunction(
        () => window.graphVideo && typeof window.graphVideo.runScript === 'function',
        { timeout: GRAPH_API_TIMEOUT_MS },
      );
      return page.evaluate((timelineActions) => {
        return window.graphVideo.runScript(timelineActions);
      }, actions);
    };

    let runSummary = await initializeRenderPage();

    let duration = Number(
      runSummary?.duration ?? (await page.evaluate(() => window.graphVideo.getDuration())),
    );
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error('Invalid timeline duration returned by graphVideo API.');
    }

    let frameCount = Math.max(1, Math.floor((duration * args.fps) + 1));
    logger.info(`Duration: ${duration.toFixed(3)}s`);
    logger.info(`Rendering ${frameCount} frame(s) at ${args.fps} fps...`);

    if (!frameRoot && args.fastPath) {
      let fastRecordingPath = null;
      try {
        const browserRecording = await tryFastRecord(
          page,
          { fps: args.fps, duration },
          timingStats,
          logger,
        );
        const fastRecording = decodeDataUrl(browserRecording.dataUrl);
        const recordingExt = fastRecording.mimeType.includes('webm')
          ? 'webm'
          : (fastRecording.mimeType.includes('mp4') ? 'mp4' : 'bin');
        fastRecordingPath = path.resolve(
          projectRoot,
          'tmp',
          `graph-video-fast-capture-${Date.now()}.${recordingExt}`,
        );
        await fs.writeFile(fastRecordingPath, fastRecording.buffer);

        logger.info('Fast path capture complete. Transcoding to MP4...');
        const ffmpegFinalizeStart = performance.now();
        await runCommand(ffmpegPath, [
          '-y',
          '-hide_banner',
          '-loglevel', 'warning',
          '-i', fastRecordingPath,
          '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          args.output,
        ], { stdio: 'inherit' });
        timingStats.ffmpegFinalizeMs = performance.now() - ffmpegFinalizeStart;

        const renderedDuration = await probeVideoDurationSeconds(ffmpegPath, args.output);
        const minExpectedDuration = duration > 1 ? duration - (1 / args.fps) : duration * 0.9;
        if (!Number.isFinite(renderedDuration) || renderedDuration < minExpectedDuration) {
          throw new Error(
            `Fast path output duration ${renderedDuration ?? 'unknown'}s `
            + `is shorter than expected ${duration.toFixed(3)}s.`,
          );
        }

        logger.info(`Video written to ${args.output}`);
        logTimingSummary(logger, timingStats);
        await fs.rm(fastRecordingPath, { force: true });
        return;
      } catch (fastPathError) {
        if (fastRecordingPath) {
          await fs.rm(fastRecordingPath, { force: true }).catch(() => {});
        }
        logger.warn(`Fast path failed; falling back to PNG frame capture: ${formatError(fastPathError)}`);
        logger.info('Reinitializing page for deterministic fallback...');
        runSummary = await initializeRenderPage();
        duration = Number(
          runSummary?.duration ?? (await page.evaluate(() => window.graphVideo.getDuration())),
        );
        if (!Number.isFinite(duration) || duration < 0) {
          throw new Error('Invalid timeline duration returned during fallback initialization.');
        }
        frameCount = Math.max(1, Math.floor((duration * args.fps) + 1));
        logger.info(`Fallback mode: rendering ${frameCount} frame(s) at ${args.fps} fps...`);
      }
    }

    if (!frameRoot && !args.fastPath) {
      logger.info('Fast path disabled; using deterministic PNG capture.');
    }

    if (!frameRoot) {
      ffmpegEncoder = startFfmpegEncoder(ffmpegPath, args);
    }

    const progressInterval = Math.max(1, Math.floor(frameCount / 100));

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const t = frameIndex / args.fps;
      const framePath = frameRoot
        ? path.join(frameRoot, `frame-${String(frameIndex).padStart(6, '0')}.png`)
        : null;

      const frameCaptureResult = await page.evaluate(async (timelineTime) => {
        const seekStart = performance.now();
        const frameState = await window.graphVideo.seek(timelineTime);
        const seekMs = performance.now() - seekStart;

        const captureStart = performance.now();
        const frameDataUrl = await window.graphVideo.captureFrame({ mimeType: 'image/png' });
        const captureMs = performance.now() - captureStart;

        return {
          frameState,
          frameDataUrl,
          seekMs,
          captureMs,
        };
      }, t);

      timingStats.frameSeekMs += Number(frameCaptureResult?.seekMs) || 0;
      timingStats.frameCaptureMs += Number(frameCaptureResult?.captureMs) || 0;
      const frameState = frameCaptureResult?.frameState ?? null;

      const frameSignature = getFrameStateSignature(frameState);
      if (args.verbose && frameIndex < 3) {
        logger.debug(`Frame signature ${frameIndex + 1}: ${frameSignature}`);
      }
      const pngBuffer = decodeDataUrl(frameCaptureResult?.frameDataUrl).buffer;
      if (!pngBuffer || pngBuffer.length === 0) {
        throw new Error(`Captured an empty PNG frame at index ${frameIndex}.`);
      }

      const outputStart = performance.now();
      if (framePath) {
        await fs.writeFile(framePath, pngBuffer);
      } else {
        await ffmpegEncoder.writeFrame(pngBuffer);
      }
      timingStats.frameOutputMs += performance.now() - outputStart;
      timingStats.frameCount += 1;

      if (frameIndex === 0
        || frameIndex === frameCount - 1
        || (frameIndex + 1) % progressInterval === 0) {
        logger.info(`frame ${frameIndex + 1}/${frameCount}`);
      }
    }

    if (ffmpegEncoder) {
      logger.info('Finalizing ffmpeg output...');
      const ffmpegFinalizeStart = performance.now();
      await ffmpegEncoder.finish();
      timingStats.ffmpegFinalizeMs = performance.now() - ffmpegFinalizeStart;
      ffmpegEncoder = null;
    } else {
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }

      const ffmpegFinalizeStart = performance.now();
      await runCommand(ffmpegPath, [
        '-y',
        '-hide_banner',
        '-loglevel', 'warning',
        '-threads', '1',
        '-filter_threads', '1',
        '-framerate', String(args.fps),
        '-start_number', '0',
        '-i', path.join(frameRoot, 'frame-%06d.png'),
        '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        args.output,
      ], { stdio: 'inherit' });
      timingStats.ffmpegFinalizeMs = performance.now() - ffmpegFinalizeStart;
    }

    logger.info(`Video written to ${args.output}`);
    logTimingSummary(logger, timingStats);

    if (frameRoot && !args.keepFrames) {
      await fs.rm(frameRoot, { recursive: true, force: true });
    }
  } finally {
    if (ffmpegEncoder) {
      await ffmpegEncoder.abort().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (localServer?.server) {
      await new Promise((resolve) => localServer.server.close(resolve));
    }
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
