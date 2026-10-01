import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { requireFile, type Runner } from './android-tools';

export const signingKeys = ['MOVINGWEIGHT_STORE_FILE', 'MOVINGWEIGHT_STORE_PASSWORD', 'MOVINGWEIGHT_KEY_ALIAS', 'MOVINGWEIGHT_KEY_PASSWORD'] as const;
export type Signing = Record<typeof signingKeys[number], string>;

export function localSigningProperties(env: NodeJS.ProcessEnv): string {
  const configHome = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME)
    ? env.XDG_CONFIG_HOME : path.join(homedir(), '.config');
  return path.join(configHome, 'movingweight', 'signing', 'gradle.properties');
}

// Java properties support escaped separators, Unicode, and continued lines.
export function parseProperties(contents: string): Record<string, string> {
  const properties: Record<string, string> = {};
  const unescape = (text: string) => text.replace(/\\u([a-f\d]{4})|\\(.)/gi, (_, hex: string | undefined, char: string) =>
    hex ? String.fromCharCode(parseInt(hex, 16)) : ({ t: '\t', r: '\r', n: '\n', f: '\f' }[char] ?? char));
  const lines = contents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimStart();
    if (!line || /^[#!]/.test(line)) continue;
    while ((line.match(/\\+$/)?.[0].length ?? 0) % 2 === 1 && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].trimStart();
    }
    let separator = 0;
    for (; separator < line.length; separator++) {
      if (line[separator] === '\\') separator++;
      else if (/[\s=:]/.test(line[separator])) break;
    }
    const key = unescape(line.slice(0, separator));
    const value = line.slice(separator).replace(/^\s*[=:]?\s*/, '');
    properties[key] = unescape(value);
  }
  return properties;
}

export function loadSigning(env: NodeJS.ProcessEnv, root: string): Signing {
  const propertiesFile = path.join(env.GRADLE_USER_HOME || path.join(homedir(), '.gradle'), 'gradle.properties');
  const localFile = localSigningProperties(env);
  const properties = {
    ...(existsSync(propertiesFile) ? parseProperties(readFileSync(propertiesFile, 'utf8')) : {}),
    ...(existsSync(localFile) ? parseProperties(readFileSync(localFile, 'utf8')) : {}),
  };
  const signing = Object.fromEntries(signingKeys.map((key) => [key, env[`ORG_GRADLE_PROJECT_${key}`] ?? properties[key]])) as Signing;
  const missing = signingKeys.filter((key) => !signing[key]);
  if (missing.length) throw new Error(`Missing signing settings: ${missing.join(', ')}.\nConfigure ${localFile} (or ${propertiesFile}); see README's APK signing setup.`);
  const keystore = signing.MOVINGWEIGHT_STORE_FILE;
  if (!path.isAbsolute(keystore)) throw new Error('MOVINGWEIGHT_STORE_FILE must be an absolute path outside the repository.');
  requireFile(keystore);
  const real = realpathSync(keystore);
  const repository = realpathSync(root);
  if (real === repository || real.startsWith(repository + path.sep)) {
    throw new Error(`Keep the signing keystore outside the repository. Move it to ${path.dirname(localFile)} and update MOVINGWEIGHT_STORE_FILE.`);
  }
  return signing;
}

export async function signingCertificate(signing: Signing, keytool: string, cwd: string, env: NodeJS.ProcessEnv, runner: Runner): Promise<string> {
  // The password is passed through the child environment, never through argv or logs.
  let output: string;
  try {
    output = await runner([keytool, '-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v',
      '-keystore', signing.MOVINGWEIGHT_STORE_FILE, '-alias', signing.MOVINGWEIGHT_KEY_ALIAS,
      '-storepass:env', 'MOVINGWEIGHT_KEYTOOL_PASSWORD'], {
      cwd, env: { ...env, MOVINGWEIGHT_KEYTOOL_PASSWORD: signing.MOVINGWEIGHT_STORE_PASSWORD },
    });
  } catch {
    throw new Error('Cannot read the signing key. Check the keystore file, alias, and store password in your private Gradle configuration.');
  }
  if (!output.includes('PrivateKeyEntry')) throw new Error('The selected keystore alias must contain a private signing key.');
  const digest = output.match(/SHA256:\s*((?:[a-f\d]{2}:){31}[a-f\d]{2})/i)?.[1];
  if (!digest) throw new Error('Cannot read the keystore SHA-256 certificate.');
  return digest.replaceAll(':', '').toLowerCase();
}
