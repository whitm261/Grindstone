import { existsSync, readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { androidTools, appIdentity, cliError, defaultApk, inspectApk, javaTools, parseArgs, projectRoot, run, sdkPackages, sdkRoot, type Runner } from './android-tools';
import { loadSigning, signingCertificate, signingKeys } from './apk-signing';

const help = `Usage: bun run apk [--check] [--help]

Build a signed, standalone release APK at builds/movingweight.apk.
--check  Validate local tools and signing settings without building.
Requires JDK 17, Android SDK/NDK/CMake, and your existing app's signing key.
See README for the one-time setup. No email notification is sent.`;

export async function buildApk(args: string[], runner: Runner = run, root = projectRoot, environment = process.env): Promise<void> {
  const options = parseArgs(args, [], ['--help', '--check']);
  if (options['--help']) { console.log(help); return; }
  const env: NodeJS.ProcessEnv = { ...environment, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CI: '1', NODE_ENV: 'production' };
  const sdk = sdkRoot(env);
  const missing = sdkPackages.filter((pkg) => !existsSync(path.join(sdk, ...pkg.split(';'))));
  if (missing.length) {
    const details = missing.map((pkg) => {
      const [group, version] = pkg.split(';');
      const folder = path.join(sdk, group);
      const installed = version && existsSync(folder)
        ? readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
        : [];
      return `${pkg}${installed.length ? ` (installed alternatives: ${installed.join(', ')})` : ''}`;
    });
    throw new Error(`Required Android SDK packages are missing from ${sdk}:\n${details.join('\n')}\nIn Android Studio's SDK Manager, enable Show Package Details and select these exact versions. Accept the licenses. Newer versions can remain installed alongside them. See README.`);
  }
  const tools = androidTools(sdk);
  const { keytool } = await javaTools(env, root, runner);
  const nodeVersion = (await runner(['node', '--version'], { cwd: root, env })).trim();
  const [major, minor, patch] = nodeVersion.replace(/^v/, '').split('.').map(Number);
  if (!major || major < 20 || (major === 20 && (minor < 19 || (minor === 19 && patch < 4)))) {
    throw new Error('Node.js 20.19.4 or newer is required by React Native 0.81.');
  }
  const signing = loadSigning(env, root);
  const certificate = await signingCertificate(signing, keytool, root, env, runner);
  const identity = appIdentity(root);
  if (!existsSync(path.join(root, 'node_modules', 'expo', 'package.json'))) throw new Error('Run bun install --frozen-lockfile first.');
  console.log(`Local APK checks passed. Package: ${identity.packageName}; version code: ${identity.versionCode}.`);
  if (options['--check']) return;

  const started = Date.now();
  const builds = path.join(root, 'builds');
  await mkdir(builds, { recursive: true });
  const lockFile = path.join(builds, '.apk-build.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('An APK build is already running. If a previous build was interrupted, remove builds/.apk-build.lock after confirming it has stopped.');
    throw error;
  }
  let staging: string | undefined;
  try {
    await lock.writeFile(String(process.pid));
    console.log('Generating Android project…');
    await runner(['bunx', '--no-env-file', '--no-install', 'expo', 'prebuild', '--platform', 'android', '--no-install'], { cwd: root, env, stream: true });
    const android = path.join(root, 'android');
    const source = path.join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
    // A successful command must produce an artifact for this build, never reuse a stale APK.
    await rm(source, { force: true });
    const gradleEnv: NodeJS.ProcessEnv = { ...env, ANDROID_HOME: sdk };
    for (const key of signingKeys) gradleEnv[`ORG_GRADLE_PROJECT_${key}`] = signing[key];
    console.log('Building release APK…');
    await runner([path.join(android, 'gradlew'), ':app:assembleRelease', '-Pmovingweight.localApk=true',
      '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64', '--console=plain'], { cwd: android, env: gradleEnv, stream: true });
    const apk = await inspectApk(source, tools, root, env, runner);
    if (apk.packageName !== identity.packageName || apk.versionCode !== BigInt(identity.versionCode)) throw new Error('Built APK identity does not match app.json. Previous published APK was preserved.');
    if (apk.certificates.length !== 1 || apk.certificates[0] !== certificate) throw new Error('Built APK was not signed with the configured signing key. Previous published APK was preserved.');
    staging = await mkdtemp(path.join(builds, '.apk-'));
    const staged = path.join(staging, 'movingweight.apk');
    await copyFile(source, staged);
    const output = path.join(root, defaultApk);
    await rename(staged, output);
    console.log(`APK: ${output}\nSize: ${(statSync(output).size / 1024 / 1024).toFixed(1)} MB\nBuild time: ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBuild failed; the previous builds/movingweight.apk, if any, was preserved.`);
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await lock.close();
    await rm(lockFile, { force: true });
  }
}

if (import.meta.main) buildApk(process.argv.slice(2)).catch(cliError);
