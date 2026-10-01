import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { androidTools, appIdentity, checkUpdate, cliError, defaultApk, inspectApk, javaTools, parseArgs, projectRoot, requireFile, run, sdkRoot, selectDevice, type Runner } from './android-tools';

const help = `Usage: bun run apk:install [--apk <path>] [--serial <device>] [--check] [--help]

Install builds/movingweight.apk, preserving existing app data.
--apk     Install a different APK (relative paths use the current directory).
--serial  Select an ADB device when more than one is connected.
--check   Verify update compatibility without installing or changing the app.
Checks the package, signing certificate, and version before adb install -r.
Never uninstalls, clears data, permits downgrades, or launches the app.`;

export async function installApk(args: string[], runner: Runner = run, root = projectRoot, environment = process.env): Promise<void> {
  const options = parseArgs(args, ['--apk', '--serial'], ['--help', '--check']);
  if (options['--help']) { console.log(help); return; }
  const file = options['--apk'] ? path.resolve(String(options['--apk'])) : path.join(root, defaultApk);
  requireFile(file);
  const env = { ...environment };
  const tools = androidTools(sdkRoot(env));
  await javaTools(env, root, runner);
  const { packageName } = appIdentity(root);
  // Snapshot the candidate so a concurrent build cannot replace it between checking and installing.
  const temp = await mkdtemp(path.join(tmpdir(), 'movingweight-install-'));
  try {
    const staged = path.join(temp, 'candidate.apk');
    await copyFile(file, staged);
    const candidate = await inspectApk(staged, tools, root, env, runner);
    if (candidate.packageName !== packageName) throw new Error(`Expected ${packageName}, but APK contains ${candidate.packageName}. Installation stopped.`);
    const output = await runner([tools.adb, 'devices', '-l'], { cwd: root, env });
    const device = selectDevice(output, options['--serial'] ? String(options['--serial']) : env.ANDROID_SERIAL);
    const adb = (...args: string[]) => runner([tools.adb, '-s', device.serial, ...args], { cwd: root, env });
    const packages = await adb('shell', 'pm', 'list', 'packages', '--user', 'current', packageName);
    // Unexpected shell output must not silently bypass the existing-app checks.
    const lines = packages.trim().split(/\r?\n/).filter(Boolean);
    if (lines.some((line) => !/^package:[\w.]+$/.test(line))) throw new Error('Cannot determine installed packages. Check the phone connection; installation stopped.');
    if (lines.includes(`package:${packageName}`)) {
      const paths = await adb('shell', 'pm', 'path', '--user', 'current', packageName);
      const entries = paths.trim().split(/\r?\n/).map((line) => line.startsWith('package:') ? line.slice(8) : '');
      const base = entries.find((entry) => entry.endsWith('/base.apk')) ?? (entries.length === 1 ? entries[0] : undefined);
      if (!base || !base.startsWith('/') || !base.endsWith('.apk')) throw new Error('Cannot locate the installed base APK. Installation stopped.');
      const installedApk = path.join(temp, 'installed.apk');
      await adb('pull', base, installedApk);
      const installed = await inspectApk(installedApk, tools, root, env, runner);
      checkUpdate(candidate, installed);
      console.log(`Compatible update for ${device.serial}; installed version ${installed.versionCode}, APK version ${candidate.versionCode}.`);
    } else console.log(`Installing ${packageName} on ${device.serial} for the first time.`);
    console.log(`APK: ${file}`);
    if (options['--check']) {
      console.log('APK installation checks passed. No app installation was performed.');
      return;
    }
    try {
      await runner([tools.adb, '-s', device.serial, 'install', '-r', staged], { cwd: root, env, stream: true });
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nInstallation failed. Existing app data was not cleared. Resolve signing/version/device errors and retry; do not uninstall to force an update.`);
    }
    console.log('APK installed. Open MovingWeight on your phone.');
  } finally { await rm(temp, { recursive: true, force: true }); }
}

if (import.meta.main) installApk(process.argv.slice(2)).catch(cliError);
