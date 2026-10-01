const { withAppBuildGradle } = require('expo/config-plugins');

const start = '// movingweight-local-signing:start';
const end = '// movingweight-local-signing:end';

// Opt in only for the local APK command. EAS manages signing independently.
const signingBlock = `${start}
if (providers.gradleProperty('movingweight.localApk').orNull == 'true') {
    def requiredSigningProperty = { name ->
        // Explicit environment overrides win even though Gradle normally prefers property files.
        def value = System.getenv('ORG_GRADLE_PROJECT_' + name)
        if (value == null) value = providers.gradleProperty(name).orNull
        if (value == null || value.isEmpty()) {
            throw new GradleException("Missing local APK signing property: " + name)
        }
        return value
    }
    def localStore = new File(requiredSigningProperty('MOVINGWEIGHT_STORE_FILE'))
    if (!localStore.isAbsolute() || !localStore.isFile()) {
        throw new GradleException('MOVINGWEIGHT_STORE_FILE must point to an existing absolute keystore path')
    }
    android.signingConfigs.create('movingweightRelease') {
        storeFile localStore
        storePassword requiredSigningProperty('MOVINGWEIGHT_STORE_PASSWORD')
        keyAlias requiredSigningProperty('MOVINGWEIGHT_KEY_ALIAS')
        keyPassword requiredSigningProperty('MOVINGWEIGHT_KEY_PASSWORD')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.movingweightRelease
}
${end}`;

function applySigning(contents) {
    const first = contents.indexOf(start);
    if (first !== -1) {
        const last = contents.indexOf(end, first);
        if (last === -1) throw new Error('Incomplete MovingWeight signing block in app/build.gradle');
        contents = contents.slice(0, first) + contents.slice(last + end.length);
    }
    return `${contents.trimEnd()}\n\n${signingBlock}\n`;
}

module.exports = function withLocalApkSigning(config) {
    return withAppBuildGradle(config, (mod) => {
        if (mod.modResults.language !== 'groovy') {
            throw new Error('MovingWeight local signing requires a Groovy app/build.gradle');
        }
        mod.modResults.contents = applySigning(mod.modResults.contents);
        return mod;
    });
};
module.exports.applySigning = applySigning;
