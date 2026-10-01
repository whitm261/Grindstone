# Android build and development guide

[← Back to MovingWeight](../README.md)

## Build and Install an APK

These commands build a standalone Android app locally and install it over USB. The APK includes its JavaScript and assets, so it runs without Expo Go or a Metro server.

```bash
bun run apk
bun run apk:install
```

The build writes `builds/movingweight.apk` and prints its size and build time. It only replaces that file after verifying the package, version code, and signing certificate. A failed build leaves the previous APK available. Email configuration is not required.

### Install the tools once

You need Bun, Node.js **20.19.4 or newer**, and **JDK 17** (including `javac` and `keytool`). Select JDK 17 with `JAVA_HOME`; newer Java versions can cause problems with this project's Android toolchain. See the [React Native environment guide](https://reactnative.dev/docs/0.81/set-up-your-environment).

Install [Android Studio](https://developer.android.com/studio), open **SDK Manager**, enable **Show Package Details**, and install:

| Component | Required version |
| --- | --- |
| Android SDK Platform | Android 16 / API 36 |
| Android SDK Build-Tools | 36.0.0 |
| Android SDK Platform-Tools | Current stable; includes ADB |
| Android SDK Command-line Tools | Latest |
| NDK (Side by side) | 27.1.12297006 |
| CMake | 3.22.1 |

Accept the SDK licenses during installation. Select the exact versions in the table: SDK Platform **36** is separate from **36.1**, and the latest NDK/CMake versions do not satisfy this project's pinned requirements. Keep **Show Package Details** enabled to select older versions; they can coexist with newer ones. The prerequisite check reports the SDK directory and any installed alternatives when a required version is missing. An emulator and a global Gradle installation are unnecessary: the project uses its generated Gradle wrapper. SDK command-line tools can also manage these packages without the Android Studio GUI. See [SDK package management](https://developer.android.com/tools/sdkmanager).

Set these in your shell configuration, adjusting the JDK and SDK paths to your installation:

```bash
# Example JDK path for a Temurin 17 installation on Fedora:
export JAVA_HOME=/usr/lib/jvm/temurin-17-jdk
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$HOME/.bun/bin:$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Open a new shell, then install the locked project dependencies:

```bash
bun install --frozen-lockfile
```

The first build needs internet to download Gradle and native dependencies. Subsequent builds reuse Gradle caches.

### Reuse your existing APK's signing key

To update an installed app while retaining its data, use the **same keystore and alias that signed that APK**. Check the actual installed certificate rather than assuming how the app was built. If the APK was signed with EAS credentials, download that key using the steps below. These steps are done once; routine local builds do not use an Expo account. See [Expo's credential download instructions](https://docs.expo.dev/guides/local-app-production/).

A former local build may use the generated `android/app/debug.keystore`. If its public certificate exactly matches the installed APK, secure a copy outside the repository and explicitly configure that key for personal updates. This is a deliberate reuse of the installed signing identity; the build never automatically switches keys or falls back to debug signing. Preserve any EAS key and its settings separately.

```bash
umask 077
bunx --no-env-file eas login
bunx --no-env-file eas credentials --platform android
```

Choose the profile that produced the installed APK, then **credentials.json → Download credentials from EAS to credentials.json**. Reuse an existing key; do not generate or rotate it. Store the keystore, credential notes, and backup ZIP outside the repository, in `~/.config/movingweight/signing/`. Keep a private backup. The build rejects a keystore stored anywhere inside the repository, including through a symlink. Keystores, EAS backup ZIPs, and credential notes are also ignored by Git as a second layer of protection.

Create that directory with mode `700` (only your user can access it), and store each file with mode `600` (only your user can read or write it). Add the following entries to `~/.config/movingweight/signing/gradle.properties`. If `XDG_CONFIG_HOME` is set to an absolute path, use its `movingweight/signing/` directory instead. Replace the placeholders with the downloaded `android.keystore` values:

```properties
MOVINGWEIGHT_STORE_FILE=/absolute/path/to/.config/movingweight/signing/release.jks
MOVINGWEIGHT_STORE_PASSWORD=YOUR_KEYSTORE_PASSWORD
MOVINGWEIGHT_KEY_ALIAS=YOUR_KEY_ALIAS
MOVINGWEIGHT_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

Use a full absolute keystore path, not `~` or `$HOME`. Map `keystore.password` to the store password, `keystore.keyAlias` to the alias, and `keystore.keyPassword` to the key password. This is Java properties syntax: escape literal backslashes as `\\` and leading spaces as `\ `. Never copy passwords into app configuration or generated native files. Existing private `~/.gradle/gradle.properties` settings (or `GRADLE_USER_HOME`) remain supported; the app-specific private file takes precedence. `ORG_GRADLE_PROJECT_<setting-name>` shell environment variables override both files. If you already export the keystore path in `.bashrc`, update it after moving the key. Passwords do not need to be in `.bashrc` when the private file is configured.

Validate the setup without building:

```bash
bun run apk --check
```

### Connect your phone and update the app

Enable **Developer options → USB debugging**, connect a data-capable USB cable, unlock the phone, and accept its authorization prompt. Verify the connection:

```bash
adb devices -l
```

Your phone should appear as `device`. For `unauthorized`, accept the phone's prompt. For `offline`, reconnect it. For `no permissions`, configure Linux USB/udev access for your phone; follow the [Android hardware-device setup guide](https://developer.android.com/studio/run/device).

Build and install independently:

```bash
bun run apk
bun run apk:install
```

The installer checks the new APK against the installed base APK before running `adb install -r`. It requires the same package and signing certificate and an equal or higher Android version code. It never uninstalls the app, clears its data, enables downgrades, or launches it. A signing mismatch reports both public SHA-256 certificate fingerprints so you can identify the matching key. Run `bun run apk:install --check` to verify compatibility without installing. Open MovingWeight yourself after installation and confirm your workouts, drafts, and settings are present.

EAS uses remote version codes, whereas the local build reads `expo.android.versionCode` in `app.json`. If your installed app has a higher value, the installer reports it: set the local value to at least that number and rebuild. Increment it for subsequent releases. The display version (`expo.version`) is separate. A signing mismatch means you need the key used for the installed APK; do not uninstall to work around it.

If several phones/emulators are attached, choose one explicitly. You can also install a previously saved APK:

```bash
bun run apk:install --serial PHONE_SERIAL
bun run apk:install --apk /path/to/saved.apk --serial PHONE_SERIAL
```

`ANDROID_SERIAL` is also supported. A relative `--apk` path is resolved from your current directory; the default APK path is always resolved from the project. Both commands support `--help`.

## Develop locally

After installing the tools and dependencies above, run the app on a connected Android device or emulator:

```bash
bun run android
```

For subsequent JavaScript development, start the Expo development server:

```bash
bun run start
```

The development server is separate from the standalone APK workflow above. A standalone APK includes its bundle and runs without that server.

## Verify changes

```bash
bun run typecheck
bun test
```

See [AGENTS.md](../AGENTS.md) for the project architecture, contribution rules, and Android device checks.
