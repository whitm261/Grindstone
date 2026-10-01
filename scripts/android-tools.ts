import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultApk = 'builds/movingweight.apk';
export const sdkPackages = [
  'platform-tools', 'platforms;android-36', 'build-tools;36.0.0',
  'ndk;27.1.12297006', 'cmake;3.22.1', 'cmdline-tools;latest',
] as const;

type CommandOptions = { cwd: string; env?: NodeJS.ProcessEnv; stream?: boolean };
export type Runner = (command: string[], options: CommandOptions) => Promise<string>;

export const run: Runner = async (command, options) => {
  let child;
  try {
    child = Bun.spawn(command, {
      cwd: options.cwd, env: options.env ?? process.env,
      stdin: 'ignore', stdout: options.stream ? 'inherit' : 'pipe',
      stderr: options.stream ? 'inherit' : 'pipe',
    });
  } catch {
    throw new Error(`Cannot start ${path.basename(command[0])}. Check its installation and PATH.`);
  }
  const [stdout, stderr, status] = await Promise.all([
    child.stdout ? new Response(child.stdout).text() : '',
    child.stderr ? new Response(child.stderr).text() : '', child.exited,
  ]);
  if (status !== 0) {
    throw new Error(`${path.basename(command[0])} failed (exit ${status}).${stderr ? `\n${stderr.trim()}` : ''}`);
  }
  return stdout;
};

export function cliError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

export function parseArgs(args: string[], valueFlags: string[], switches: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--') continue;
    if (flag in parsed) throw new Error(`Repeated option: ${flag}`);
    if (switches.includes(flag)) parsed[flag] = true;
    else if (valueFlags.includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
      parsed[flag] = value;
    } else throw new Error(`Unknown option: ${flag}. Use --help for usage.`);
  }
  return parsed;
}

export function sdkRoot(env: NodeJS.ProcessEnv): string {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(homedir(), 'Android', 'Sdk');
  if (!path.isAbsolute(sdk) || !existsSync(sdk)) {
    throw new Error('Android SDK not found. Set ANDROID_HOME to its absolute directory (usually ~/Android/Sdk).');
  }
  return sdk;
}

export function androidTools(sdk: string) {
  const tools = {
    adb: path.join(sdk, 'platform-tools', 'adb'),
    aapt: path.join(sdk, 'build-tools', '36.0.0', 'aapt'),
    apksigner: path.join(sdk, 'build-tools', '36.0.0', 'apksigner'),
  };
  const missing = Object.values(tools).filter((file) => !existsSync(file));
  if (missing.length) throw new Error(`Missing Android tools:\n${missing.join('\n')}\nInstall Platform-Tools and Build-Tools 36.0.0 in Android Studio's SDK Manager.`);
  return tools;
}

export async function javaTools(env: NodeJS.ProcessEnv, cwd: string, runner: Runner) {
  if (!env.JAVA_HOME) {
    const javac = Bun.which('javac', { PATH: env.PATH });
    if (!javac) throw new Error('JDK 17 is missing. Install it and set JAVA_HOME.');
    env.JAVA_HOME = path.dirname(path.dirname(realpathSync(javac)));
  }
  const tool = (name: string) => env.JAVA_HOME ? path.join(env.JAVA_HOME, 'bin', name) : name;
  // java -version writes to stderr; javac reliably reports the selected JDK on stdout.
  const version = await runner([tool('javac'), '-version'], { cwd, env });
  if (!/^javac 17(?:\.|\s)/.test(version.trim())) {
    throw new Error('Local APK tools require JDK 17. Set JAVA_HOME to JDK 17 and add its bin directory to PATH.');
  }
  const runtime = await runner([tool('java'), '--version'], { cwd, env });
  if (!/^(?:openjdk|java) 17(?:\.|\s)/.test(runtime.trim())) throw new Error('JAVA_HOME must select the JDK 17 runtime.');
  return { javac: tool('javac'), keytool: tool('keytool') };
}

export function appIdentity(root: string): { packageName: string; versionCode: number } {
  const config = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
  const packageName = config.expo?.android?.package;
  const versionCode = config.expo?.android?.versionCode ?? 1;
  if (typeof packageName !== 'string' || !/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(packageName)) {
    throw new Error('app.json must define a valid expo.android.package.');
  }
  if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
    throw new Error('expo.android.versionCode must be a positive Android version code.');
  }
  return { packageName, versionCode };
}

export function requireFile(file: string): void {
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0) {
    throw new Error(`File missing or empty: ${file}`);
  }
}

export type ApkInfo = { packageName: string; versionCode: bigint; certificates: string[] };

export function parseApkInfo(badging: string, signing: string): ApkInfo {
  const pkg = badging.match(/^package: name='([^']+)' versionCode='(\d+)'/m);
  if (!pkg) throw new Error('Cannot read APK package and version code.');
  const major = badging.match(/^package: .*\bversionCodeMajor='(\d+)'/m)?.[1] ?? '0';
  const certificates = [...signing.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f\d]{64})\s*$/gim)]
    .map((match) => match[1].toLowerCase()).sort();
  if (!certificates.length) throw new Error('Cannot read APK signing certificate.');
  return { packageName: pkg[1], versionCode: (BigInt(major) << 32n) + BigInt(pkg[2]), certificates };
}

export async function inspectApk(file: string, tools: ReturnType<typeof androidTools>, cwd: string, env: NodeJS.ProcessEnv, runner: Runner): Promise<ApkInfo> {
  requireFile(file);
  const badging = await runner([tools.aapt, 'dump', 'badging', file], { cwd, env });
  const signing = await runner([tools.apksigner, 'verify', '--print-certs', file], { cwd, env });
  return parseApkInfo(badging, signing);
}

export function checkUpdate(candidate: ApkInfo, installed: ApkInfo): void {
  if (candidate.packageName !== installed.packageName) throw new Error('APK package does not match the installed app.');
  if (candidate.certificates.join(',') !== installed.certificates.join(',')) {
    throw new Error(`Signing certificate mismatch.\nInstalled APK SHA-256: ${installed.certificates.join(', ')}\nNew APK SHA-256: ${candidate.certificates.join(', ')}\nUse the signing key that signed the installed APK. Installation stopped; do not uninstall the app to work around this.`);
  }
  if (candidate.versionCode < installed.versionCode) {
    throw new Error(`APK version code ${candidate.versionCode} is below installed version ${installed.versionCode}. Set expo.android.versionCode to at least ${installed.versionCode} in app.json and rebuild.`);
  }
}

export type Device = { serial: string; state: string };
export function selectDevice(output: string, serial?: string): Device {
  const devices = output.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('List of devices') && !line.startsWith('*'))
    .map((line) => { const [id, state] = line.trim().split(/\s+/); return { serial: id, state }; });
  if (!devices.length) throw new Error('No ADB devices found. Connect a data-capable USB cable and enable USB debugging.');
  if (!serial && devices.length > 1) {
    throw new Error(`Multiple ADB devices found. Select one with --serial:\n${devices.map((d) => `${d.serial} (${d.state})`).join('\n')}`);
  }
  const device = serial ? devices.find((d) => d.serial === serial) : devices[0];
  if (!device) throw new Error(`ADB device ${serial} was not found. Run adb devices -l.`);
  if (device.state === 'unauthorized') throw new Error(`Device ${device.serial} is unauthorized. Unlock your phone and accept the USB debugging authorization prompt.`);
  if (device.state === 'offline') throw new Error(`Device ${device.serial} is offline. Reconnect it and check USB debugging.`);
  if (device.state !== 'device') throw new Error(`Device ${device.serial} is not ready (${device.state}). Check USB permissions and adb devices -l.`);
  return device;
}
