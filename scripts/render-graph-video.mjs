#!/usr/bin/env node

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_FPS = 30;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const PAGE_GOTO_TIMEOUT_MS = 60000;
const GRAPH_API_TIMEOUT_MS = 240000;

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
  --frames-dir       Directory for intermediate PNG frames
  --keep-frames      Keep PNG frames after ffmpeg completes
  --verbose, -v      Enable verbose diagnostics (Puppeteer/page/frame-level logs)
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
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${command}): exit code ${code}`));
    });
  });
}

function isChromiumSandboxLaunchError(error) {
  const message = String(error?.message || error || '');
  return /sandbox|setuid|credentials\.cc|permission denied/i.test(message);
}

async function ensureFfmpegInstalled() {
  try {
    await runCommand('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error('ffmpeg is required but was not found in PATH.');
  }
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

  page.on('response', (response) => {
    if (!verbose) return;
    if (response.status() >= 400) {
      logger.debug(`HTTP ${response.status()} ${response.url()}`);
    }
  });
}

function decodePngDataUrl(dataUrl) {
  const prefix = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
    throw new Error('captureFrame() returned an unexpected payload (expected PNG data URL).');
  }
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const logger = makeLogger(args.verbose);
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
  let actions;
  try {
    actions = JSON.parse(scriptContents);
  } catch (error) {
    throw new Error(`Failed to parse JSON from script file: ${scriptPath}\n${formatError(error)}`);
  }
  if (!Array.isArray(actions)) {
    throw new Error(`Script file must contain a JSON array: ${scriptPath}`);
  }
  logger.info(`Loaded ${actions.length} action(s).`);
  if (args.verbose) {
    logger.debug(`Action preview: ${JSON.stringify(actions.slice(0, 3), null, 2)}`);
  }

  logger.debug('Checking ffmpeg availability...');
  await ensureFfmpegInstalled();
  logger.debug('Loading Puppeteer...');
  const puppeteer = await loadPuppeteer();

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  logger.debug(`Ensured output directory: ${path.dirname(args.output)}`);

  const frameRoot = args.framesDir
    ? path.resolve(args.framesDir)
    : path.resolve(projectRoot, 'tmp', `graph-video-frames-${Date.now()}`);
  await fs.mkdir(frameRoot, { recursive: true });
  logger.info(`Frame directory: ${frameRoot}`);

  let browser = null;
  let localServer = null;

  try {
    if (!args.url) {
      logger.debug('Starting local static server...');
      localServer = await startStaticServer(projectRoot);
      logger.info(`Local server started at ${localServer.url}`);
    }

    const pageUrl = args.url || localServer.url;

    logger.info(`Opening graph page: ${pageUrl}`);

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
    logger.debug(`Launch options: ${JSON.stringify(launchOptions)}`);

    try {
      browser = await puppeteer.launch(launchOptions);
      logger.info('Browser launched successfully.');
    } catch (error) {
      if (!isChromiumSandboxLaunchError(error)) {
        logger.warn(`Browser launch failed: ${formatError(error)}`);
        throw error;
      }

      logger.warn(
        'Chromium sandbox launch failed. Retrying with --no-sandbox --disable-setuid-sandbox.',
      );
      const fallbackLaunchOptions = {
        ...launchOptions,
        args: [
          ...launchOptions.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      };
      logger.debug(`Fallback launch options: ${JSON.stringify(fallbackLaunchOptions)}`);
      browser = await puppeteer.launch(fallbackLaunchOptions);
      logger.info('Browser launched with no-sandbox fallback.');
    }

    const page = await browser.newPage();
    attachPageDiagnostics(page, logger, args.verbose);
    logger.debug('Created new page and attached diagnostics listeners.');

    logger.info(`Navigating to graph page (waitUntil=domcontentloaded, timeout=${PAGE_GOTO_TIMEOUT_MS}ms)...`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT_MS });
    logger.info('Navigation complete (DOMContentLoaded).');
    const readyState = await page.evaluate(() => document.readyState);
    logger.debug(`Document readyState after navigation: ${readyState}`);

    logger.info(`Waiting for window.graphVideo API to be ready (timeout=${GRAPH_API_TIMEOUT_MS}ms)...`);
    await page.waitForFunction(
      () => window.graphVideo && typeof window.graphVideo.runScript === 'function',
      { timeout: GRAPH_API_TIMEOUT_MS },
    );
    logger.info('window.graphVideo API detected.');
    if (args.verbose) {
      const pageState = await page.evaluate(() => ({
        readyState: document.readyState,
        hasGraphVideo: Boolean(window.graphVideo),
        graphVideoKeys: window.graphVideo ? Object.keys(window.graphVideo) : [],
      }));
      logger.debug(`Page state after API wait: ${JSON.stringify(pageState)}`);
    }

    logger.info('Running graphVideo.runScript(...) in page context...');
    const runSummary = await page.evaluate((timelineActions) => {
      return window.graphVideo.runScript(timelineActions);
    }, actions);
    logger.info('Timeline script injected successfully.');
    if (args.verbose) {
      logger.debug(`runScript summary: ${JSON.stringify(runSummary)}`);
    }

    const duration = Number(
      runSummary?.duration ?? (await page.evaluate(() => window.graphVideo.getDuration())),
    );
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error('Invalid timeline duration returned by graphVideo API.');
    }

    const frameCount = Math.max(1, Math.floor((duration * args.fps) + 1));
    logger.info(`Duration: ${duration.toFixed(3)}s`);
    logger.info(`Rendering ${frameCount} frame(s) at ${args.fps} fps...`);

    const progressInterval = Math.max(1, Math.floor(frameCount / 20));

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const t = frameIndex / args.fps;
      const frameNumber = frameIndex + 1;
      const framePath = path.join(
        frameRoot,
        `frame-${String(frameIndex).padStart(6, '0')}.png`,
      );

      if (args.verbose) {
        logger.debug(`Frame ${frameNumber}/${frameCount}: seek(t=${t.toFixed(4)}) start.`);
      }
      const seekStart = Date.now();
      await page.evaluate((timelineTime) => window.graphVideo.seek(timelineTime), t);
      if (args.verbose) {
        logger.debug(`Frame ${frameNumber}/${frameCount}: seek done (${Date.now() - seekStart} ms).`);
      }

      const captureStart = Date.now();
      const frameDataUrl = await page.evaluate(() => window.graphVideo.captureFrame());
      if (args.verbose) {
        logger.debug(
          `Frame ${frameNumber}/${frameCount}: capture done (${Date.now() - captureStart} ms).`,
        );
      }

      const pngBuffer = decodePngDataUrl(frameDataUrl);
      if (args.verbose) {
        logger.debug(`Frame ${frameNumber}/${frameCount}: decoded PNG (${pngBuffer.length} bytes).`);
      }

      const writeStart = Date.now();
      await fs.writeFile(framePath, pngBuffer);
      if (args.verbose) {
        logger.debug(
          `Frame ${frameNumber}/${frameCount}: wrote ${framePath} (${Date.now() - writeStart} ms).`,
        );
      }

      if (frameIndex === 0
        || frameIndex === frameCount - 1
        || (frameIndex + 1) % progressInterval === 0) {
        logger.info(`frame ${frameIndex + 1}/${frameCount}`);
      }
    }

    const generatedFrames = (await fs.readdir(frameRoot))
      .filter((fileName) => fileName.endsWith('.png'))
      .length;
    logger.info(`Generated ${generatedFrames} PNG frame(s) in ${frameRoot}`);
    if (generatedFrames === 0) {
      throw new Error(`No PNG frames were generated in ${frameRoot}.`);
    }

    logger.info('Encoding video with ffmpeg...');
    logger.debug(`ffmpeg input pattern: ${path.join(frameRoot, 'frame-%06d.png')}`);

    await runCommand('ffmpeg', [
      '-y',
      '-framerate', String(args.fps),
      '-start_number', '0',
      '-i', path.join(frameRoot, 'frame-%06d.png'),
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      args.output,
    ], { stdio: 'inherit' });

    logger.info(`Video written to ${args.output}`);

    if (!args.keepFrames) {
      await fs.rm(frameRoot, { recursive: true, force: true });
      logger.info('Intermediate frames removed.');
    } else {
      logger.info(`Frames kept in ${frameRoot}`);
    }
  } finally {
    if (browser) {
      logger.debug('Closing browser...');
      await browser.close().catch((error) => {
        logger.warn(`Failed to close browser cleanly: ${formatError(error)}`);
      });
    }
    if (localServer?.server) {
      logger.debug('Stopping local static server...');
      await new Promise((resolve) => localServer.server.close(resolve));
      logger.debug('Local static server stopped.');
    }
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
