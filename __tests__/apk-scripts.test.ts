import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkUpdate, parseApkInfo, parseArgs, sdkPackages, selectDevice, type Runner } from '../scripts/android-tools';
import { loadSigning, localSigningProperties, parseProperties, signingCertificate } from '../scripts/apk-signing';
import { buildApk } from '../scripts/build-apk';
import { installApk } from '../scripts/install-apk';

const { applySigning } = require('../plugins/with-local-apk-signing.cjs');
const packageName = 'com.whitm261.movingweight';
const cert = 'ab'.repeat(32);
const otherCert = 'cd'.repeat(32);
const badging = (version = 5, pkg = packageName) => `package: name='${pkg}' versionCode='${version}' versionName='1.0.0'\n`;
const signing = (digest = cert) => `Signer #1 certificate SHA-256 digest: ${digest}\n`;
const temporary: string[] = [];

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'movingweight-apk-test-'));
  temporary.push(temporaryRoot);
  const root = path.join(temporaryRoot, 'project');
  await mkdir(root);
  const sdk = path.join(root, 'sdk');
  for (const pkg of sdkPackages) await mkdir(path.join(sdk, ...pkg.split(';')), { recursive: true });
  for (const file of ['platform-tools/adb', 'build-tools/36.0.0/aapt', 'build-tools/36.0.0/apksigner']) {
    await writeFile(path.join(sdk, file), 'test tool');
  }
  await mkdir(path.join(root, 'node_modules', 'expo'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'expo', 'package.json'), '{}');
  await writeFile(path.join(root, 'app.json'), JSON.stringify({ expo: { android: { package: packageName, versionCode: 5 } } }));
  await mkdir(path.join(root, 'builds'));
  await writeFile(path.join(root, 'builds', 'movingweight.apk'), 'previous APK');
  const store = path.join(temporaryRoot, 'signing key.jks');
  await writeFile(store, 'test keystore');
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    ANDROID_HOME: sdk, JAVA_HOME: path.join(root, 'jdk'), GRADLE_USER_HOME: path.join(temporaryRoot, 'gradle-home'),
    XDG_CONFIG_HOME: path.join(temporaryRoot, 'config'),
    ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_FILE: store,
    ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_PASSWORD: 'private-store-password',
    ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_ALIAS: 'release',
    ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_PASSWORD: 'private-key-password',
  };
  const calls: { command: string[]; env?: NodeJS.ProcessEnv }[] = [];
  const settings = { failBuild: false, buildCertificate: cert, noBuildOutput: false, installed: true,
    installedCertificate: cert, installedVersion: 4, apkPackage: packageName,
    devices: 'List of devices attached\nphone\tdevice product:test\n', badPackages: false, failPull: false, failInstall: false };
  const runner: Runner = async (command, options) => {
    calls.push({ command, env: options.env });
    const tool = path.basename(command[0]);
    if (tool === 'javac') return 'javac 17.0.20\n';
    if (tool === 'java') return 'openjdk 17.0.20\n';
    if (tool === 'node') return 'v24.18.0\n';
    if (tool === 'keytool') return `Entry type: PrivateKeyEntry\nSHA256: ${cert.match(/../g)!.join(':')}\n`;
    if (tool === 'bunx') {
      await mkdir(path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release'), { recursive: true });
      return '';
    }
    if (tool === 'gradlew') {
      if (settings.failBuild) throw new Error('Gradle compile failed');
      if (!settings.noBuildOutput) await writeFile(path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'), 'new APK');
      return '';
    }
    if (tool === 'aapt') return badging(command.at(-1)!.endsWith('installed.apk') ? settings.installedVersion : 5, settings.apkPackage);
    if (tool === 'apksigner') return signing(command.at(-1)!.endsWith('installed.apk') ? settings.installedCertificate : settings.buildCertificate);
    if (tool === 'adb') {
      if (command.includes('devices')) return settings.devices;
      if (command.includes('list')) return settings.badPackages ? 'Error: device disconnected\n' : settings.installed ? `package:${packageName}\n` : '';
      if (command.includes('path')) return 'package:/data/app/test/base.apk\npackage:/data/app/test/split_config.arm64.apk\n';
      if (command.includes('pull')) {
        if (settings.failPull) throw new Error('ADB pull failed');
        await writeFile(command.at(-1)!, 'installed APK');
        return '';
      }
      if (command.includes('install')) {
        if (settings.failInstall) throw new Error('INSTALL_FAILED_UPDATE_INCOMPATIBLE');
        expect(readFileSync(command.at(-1)!, 'utf8')).toBe('previous APK');
        return 'Success';
      }
    }
    throw new Error(`Unexpected test command: ${command.join(' ')}`);
  };
  return { root, sdk, env, calls, settings, runner };
}

describe('APK command inputs and Android output', () => {
  test('rejects missing, unknown, and duplicate options; accepts paths with spaces', () => {
    expect(parseArgs(['--apk', 'a path/file.apk', '--serial', 'phone'], ['--apk', '--serial'], [])['--apk']).toBe('a path/file.apk');
    for (const args of [['--apk'], ['--apk', '--help'], ['--bad'], ['--apk', 'a', '--apk', 'b']]) {
      expect(() => parseArgs(args, ['--apk'], ['--help'])).toThrow();
    }
  });

  test('requires selection for multiple devices and rejects unauthorized/offline devices', () => {
    const devices = 'List of devices attached\nphone\tdevice model:Test\nemulator-5554\tdevice\n';
    expect(() => selectDevice(devices)).toThrow('Multiple');
    expect(selectDevice(devices, 'phone').serial).toBe('phone');
    expect(() => selectDevice(devices, 'missing')).toThrow('not found');
    expect(() => selectDevice('List of devices attached\n')).toThrow('No ADB');
    expect(() => selectDevice('phone\tunauthorized')).toThrow('authorization prompt');
    expect(() => selectDevice('phone\toffline')).toThrow('offline');
    expect(() => selectDevice('phone\tno permissions')).toThrow('USB permissions');
  });

  test('reads version codes, including major codes, and fails closed on missing certificates', () => {
    expect(parseApkInfo(badging(), signing()).versionCode).toBe(5n);
    expect(parseApkInfo(badging().trim() + " versionCodeMajor='1'\n", signing()).versionCode).toBe((1n << 32n) + 5n);
    expect(() => parseApkInfo(badging(), '')).toThrow('certificate');
    expect(() => parseApkInfo('', signing())).toThrow('package');
  });

  test('only accepts matching package/certificates and equal or greater versions', () => {
    const apk = parseApkInfo(badging(), signing());
    checkUpdate(apk, { ...apk, versionCode: 4n });
    checkUpdate(apk, apk);
    expect(() => checkUpdate(apk, { ...apk, packageName: 'other.app' })).toThrow('package');
    expect(() => checkUpdate(apk, { ...apk, certificates: [otherCert] })).toThrow('certificate mismatch');
    expect(() => checkUpdate(apk, { ...apk, versionCode: 6n })).toThrow('below installed');
  });
});

describe('private signing configuration', () => {
  test('reads Java properties escaping and continuation without trimming password endings', () => {
    expect(parseProperties('# comment\na= leading\\ value  \nb : line\\\n  continued\nunicode=\\u0061\npath=/a\\:b\n'))
      .toEqual({ a: 'leading value  ', b: 'linecontinued', unicode: 'a', path: '/a:b' });
  });

  test('loads private Gradle settings, permits environment overrides, rejects repository keys', async () => {
    const f = await fixture();
    await mkdir(f.env.GRADLE_USER_HOME!);
    await writeFile(path.join(f.env.GRADLE_USER_HOME!, 'gradle.properties'), 'MOVINGWEIGHT_KEY_ALIAS=from-file\n');
    delete f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_ALIAS;
    expect(loadSigning(f.env, f.root).MOVINGWEIGHT_KEY_ALIAS).toBe('from-file');
    f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_ALIAS = 'env-alias';
    expect(loadSigning(f.env, f.root).MOVINGWEIGHT_KEY_ALIAS).toBe('env-alias');
    await mkdir(path.join(f.root, 'android'));
    const nativeKey = path.join(f.root, 'android', 'key.jks');
    await writeFile(nativeKey, 'key');
    f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_FILE = nativeKey;
    expect(() => loadSigning(f.env, f.root)).toThrow('outside the repository');
    delete f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_FILE;
    expect(() => loadSigning(f.env, f.root)).toThrow('Missing signing');
  });

  test('local private configuration overrides shared Gradle settings; shell settings override both', async () => {
    const f = await fixture();
    const local = localSigningProperties(f.env);
    await mkdir(path.dirname(local), { recursive: true });
    await mkdir(f.env.GRADLE_USER_HOME!);
    await writeFile(path.join(f.env.GRADLE_USER_HOME!, 'gradle.properties'), 'MOVINGWEIGHT_KEY_ALIAS=shared\n');
    await writeFile(local, 'MOVINGWEIGHT_KEY_ALIAS=private\n');
    delete f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_ALIAS;
    expect(loadSigning(f.env, f.root).MOVINGWEIGHT_KEY_ALIAS).toBe('private');
    f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_KEY_ALIAS = 'shell';
    expect(loadSigning(f.env, f.root).MOVINGWEIGHT_KEY_ALIAS).toBe('shell');
  });

  test('rejects a repository keystore even through an external symlink', async () => {
    const f = await fixture();
    const key = path.join(f.root, 'root-keystore.jks');
    await writeFile(key, 'private key');
    const link = path.join(path.dirname(f.root), 'external-key.jks');
    await import('node:fs/promises').then(({ symlink }) => symlink(key, link));
    f.env.ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_FILE = link;
    expect(() => loadSigning(f.env, f.root)).toThrow('outside the repository');
  });

  test('keystore password travels through child environment, not arguments', async () => {
    const f = await fixture();
    expect(await signingCertificate(loadSigning(f.env, f.root), 'keytool', f.root, f.env, f.runner)).toBe(cert);
    expect(f.calls[0].command.join(' ')).not.toContain('private-store-password');
    expect(f.calls[0].env?.MOVINGWEIGHT_KEYTOOL_PASSWORD).toBe('private-store-password');
  });

  test('Gradle plugin is idempotent, opt-in, and preserves existing signing blocks', async () => {
    const result = Bun.spawnSync(['tar', '-xOzf', 'node_modules/expo/template.tgz', 'package/android/app/build.gradle']);
    expect(result.exitCode).toBe(0);
    const original = result.stdout.toString();
    const patched = applySigning(original);
    expect(patched).toStartWith(original.trimEnd());
    expect(patched).toContain("providers.gradleProperty('movingweight.localApk').orNull == 'true'");
    expect(patched).toContain('android.buildTypes.release.signingConfig = android.signingConfigs.movingweightRelease');
    expect(applySigning(patched)).toBe(patched);
    expect(() => applySigning('// movingweight-local-signing:start')).toThrow('Incomplete');
  });
});

describe('build workflow', () => {
  test('checks prerequisites without generating or publishing anything', async () => {
    const f = await fixture();
    await buildApk(['--check'], f.runner, f.root, f.env);
    expect(existsSync(path.join(f.root, 'android'))).toBe(false);
    expect(f.calls.some(({ command }) => command[0] === 'bunx')).toBe(false);
  });

  test('prebuilds from no native directory, publishes verified APK, and rebuilds', async () => {
    const f = await fixture();
    for (let i = 0; i < 2; i++) await buildApk([], f.runner, f.root, f.env);
    expect(readFileSync(path.join(f.root, 'builds', 'movingweight.apk'), 'utf8')).toBe('new APK');
    const gradle = f.calls.find(({ command }) => path.basename(command[0]) === 'gradlew')!;
    expect(gradle.command).toContain('-Pmovingweight.localApk=true');
    expect(gradle.command.join(' ')).not.toContain('private-store-password');
    expect(gradle.env?.ORG_GRADLE_PROJECT_MOVINGWEIGHT_STORE_PASSWORD).toBe('private-store-password');
    expect(existsSync(path.join(f.root, 'builds', '.apk-build.lock'))).toBe(false);
  });

  for (const failure of ['compile', 'certificate', 'identity', 'missing-output'] as const) {
    test(`preserves published APK and releases lock after ${failure} failure`, async () => {
      const f = await fixture();
      f.settings.failBuild = failure === 'compile';
      f.settings.buildCertificate = failure === 'certificate' ? otherCert : cert;
      if (failure === 'identity') f.settings.apkPackage = 'wrong.app';
      f.settings.noBuildOutput = failure === 'missing-output';
      if (failure === 'missing-output') {
        const output = path.join(f.root, 'android', 'app', 'build', 'outputs', 'apk', 'release');
        await mkdir(output, { recursive: true });
        await writeFile(path.join(output, 'app-release.apk'), 'stale output');
      }
      await expect(buildApk([], f.runner, f.root, f.env)).rejects.toThrow('preserved');
      expect(readFileSync(path.join(f.root, 'builds', 'movingweight.apk'), 'utf8')).toBe('previous APK');
      expect(existsSync(path.join(f.root, 'builds', '.apk-build.lock'))).toBe(false);
    });
  }

  test('reports missing SDK components and rejects an active build lock', async () => {
    const f = await fixture();
    await rm(path.join(f.sdk, 'ndk'), { recursive: true });
    await expect(buildApk([], f.runner, f.root, f.env)).rejects.toThrow('ndk;27.1.12297006');
    await mkdir(path.join(f.sdk, 'ndk', '27.1.12297006'), { recursive: true });
    await writeFile(path.join(f.root, 'builds', '.apk-build.lock'), '123');
    await expect(buildApk([], f.runner, f.root, f.env)).rejects.toThrow('already running');
  });

  test('newer SDK versions do not satisfy pinned native build requirements', async () => {
    const f = await fixture();
    for (const [group, required, newer] of [
      ['platforms', 'android-36', 'android-36.1'],
      ['ndk', '27.1.12297006', '30.0.16248370'],
      ['cmake', '3.22.1', '4.1.2'],
    ]) {
      await rm(path.join(f.sdk, group, required), { recursive: true });
      await mkdir(path.join(f.sdk, group, newer));
    }
    await expect(buildApk(['--check'], f.runner, f.root, f.env)).rejects.toThrow('installed alternatives: android-36.1');
    expect(f.calls.length).toBe(0);
    for (const [group, required] of [['platforms', 'android-36'], ['ndk', '27.1.12297006'], ['cmake', '3.22.1']]) {
      await mkdir(path.join(f.sdk, group, required));
    }
    await buildApk(['--check'], f.runner, f.root, f.env);
  });
});

describe('install workflow', () => {
  test('checks installed base APK and installs a verified snapshot with -r', async () => {
    const f = await fixture();
    await installApk([], f.runner, f.root, f.env);
    const install = f.calls.find(({ command }) => command.includes('install'))!.command;
    expect(install.slice(1, 5)).toEqual(['-s', 'phone', 'install', '-r']);
    expect(install.at(-1)).not.toBe(path.join(f.root, 'builds', 'movingweight.apk'));
    expect(existsSync(path.dirname(install.at(-1)!))).toBe(false);
    expect(f.calls.some(({ command }) => command.includes('pull'))).toBe(true);
    expect(f.calls.some(({ command }) => command.includes('uninstall') || command.includes('clear') || command.includes('-d'))).toBe(false);
  });

  test('check mode inspects the installed APK and cleans temporary copies without installing', async () => {
    const f = await fixture();
    await installApk(['--check'], f.runner, f.root, f.env);
    const pull = f.calls.find(({ command }) => command.includes('pull'))!.command;
    expect(f.calls.some(({ command }) => command.includes('install'))).toBe(false);
    expect(existsSync(path.dirname(pull.at(-1)!))).toBe(false);
    f.settings.installedCertificate = otherCert;
    await expect(installApk(['--check'], f.runner, f.root, f.env)).rejects.toThrow(`Installed APK SHA-256: ${otherCert}`);
    expect(f.calls.some(({ command }) => command.includes('install'))).toBe(false);
  });

  test('first installation does not try to pull a nonexistent app', async () => {
    const f = await fixture();
    f.settings.installed = false;
    await installApk(['--serial', 'phone', '--apk', path.join(f.root, 'builds', 'movingweight.apk')], f.runner, f.root, f.env);
    expect(f.calls.some(({ command }) => command.includes('pull'))).toBe(false);
    expect(f.calls.some(({ command }) => command.includes('install'))).toBe(true);
  });

  for (const failure of ['certificate', 'downgrade', 'package', 'unauthorized', 'package-query', 'pull'] as const) {
    test(`does not install on ${failure} failure`, async () => {
      const f = await fixture();
      if (failure === 'certificate') f.settings.installedCertificate = otherCert;
      if (failure === 'downgrade') f.settings.installedVersion = 6;
      if (failure === 'package') f.settings.apkPackage = 'wrong.app';
      if (failure === 'unauthorized') f.settings.devices = 'phone\tunauthorized\n';
      if (failure === 'package-query') f.settings.badPackages = true;
      if (failure === 'pull') f.settings.failPull = true;
      await expect(installApk([], f.runner, f.root, f.env)).rejects.toThrow();
      expect(f.calls.some(({ command }) => command.includes('install'))).toBe(false);
    });
  }

  test('surfaces ADB installation failure without destructive retries', async () => {
    const f = await fixture();
    f.settings.failInstall = true;
    await expect(installApk([], f.runner, f.root, f.env)).rejects.toThrow('Existing app data was not cleared');
    expect(f.calls.filter(({ command }) => command.includes('install')).length).toBe(1);
  });

  test('help runs without tools or credentials', async () => {
    const noCommands: Runner = async () => { throw new Error('Unexpected subprocess'); };
    await buildApk(['--help'], noCommands, '/missing', { NODE_ENV: 'test' });
    await installApk(['--help'], noCommands, '/missing', { NODE_ENV: 'test' });
  });
});
