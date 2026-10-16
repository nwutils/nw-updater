const crypto = await import('node:crypto');
const fs = await import('node:fs');
const process = await import('node:process');

import semver from './version.js';

/**
 * Contents of the `app-update.yml` file `@nwutils/packager` ships next to the
 * NW.js executable.
 * @typedef {{provider: 'github', owner: string, repo: string} | {provider: 'generic', url: string}} PublishConfig
 */

/**
 * @typedef {object} UpdateCheckResult
 * @property {boolean} updateAvailable - True if a newer version is published.
 * @property {string} [version] - Latest published version. Not known to the AppImage `'zsync'` method.
 * @property {string} [url] - URL the new package is downloaded from.
 * @property {string} [sha512] - Base64 encoded SHA-512 digest of the new package.
 * @property {number} [size] - Size of the new package in bytes.
 * @property {string} [releaseDate] - When the latest version was published.
 */

/**
 * @typedef {object} DownloadProgress
 * @property {number} transferred - Bytes downloaded so far.
 * @property {number | undefined} total - Total bytes, if known.
 */

/**
 * Parse a YAML scalar as written by `@nwutils/packager` or electron-builder.
 * @param {string} value
 * @returns {string | number | boolean}
 */
function parseYamlScalar(value) {
  if (value.startsWith('"')) {
    return JSON.parse(value);
  }
  if (value.startsWith('\'') && value.endsWith('\'') && value.length >= 2) {
    return value.slice(1, -1).replaceAll('\'\'', '\'');
  }
  if (value === 'true' || value === 'false') {
    return value === 'true';
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

/**
 * Parse the subset of YAML update info and `app-update.yml` files use: a map
 * of scalars, and lists of maps of scalars. This covers files written by
 * `@nwutils/packager` and electron-builder without pulling in a YAML library.
 * @param {string} contents
 * @returns {Record<string, string | number | boolean | Record<string, string | number | boolean>[]>}
 */
function parseYaml(contents) {
  /** @type {Record<string, string | number | boolean | Record<string, string | number | boolean>[]>} */
  const entries = {};
  /** @type {Record<string, string | number | boolean>[] | undefined} */
  let currentList;
  /** @type {Record<string, string | number | boolean> | undefined} */
  let currentItem;

  for (const rawLine of contents.split('\n')) {
    if (rawLine.trim() === '' || rawLine.trim().startsWith('#')) {
      continue;
    }

    const isListItem = /^\s+- /.test(rawLine);
    const isIndented = /^\s/.test(rawLine);
    const line = rawLine.trim().replace(/^- /, '');
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Unable to parse YAML line: ${rawLine}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (isIndented === false) {
      currentItem = undefined;
      if (value === '') {
        currentList = [];
        entries[key] = currentList;
      } else {
        currentList = undefined;
        entries[key] = parseYamlScalar(value);
      }
      continue;
    }

    if (currentList === undefined) {
      throw new Error(`Unable to parse YAML line: ${rawLine}`);
    }
    if (isListItem || currentItem === undefined) {
      currentItem = {};
      currentList.push(currentItem);
    }
    currentItem[key] = parseYamlScalar(value);
  }

  return entries;
}

/**
 * Name of the update info file for `arch` on `platform`, matching
 * `@nwutils/packager` and electron-builder: `x64` gets the bare
 * `latest-linux.yml` (Linux) or `latest.yml` (Windows), every other
 * architecture gets an `-<arch>` suffix.
 * @param {string} arch
 * @param {'linux' | 'win'} [platform='linux']
 * @returns {string}
 */
function updateInfoFileName(arch, platform = 'linux') {
  const base = platform === 'win' ? 'latest' : 'latest-linux';
  return arch === 'x64' ? `${base}.yml` : `${base}-${arch}.yml`;
}

/**
 * Base URL the latest release's files are downloaded from.
 * @param {PublishConfig} config
 * @returns {string} Always ends with a `/`, so relative file names resolve against it.
 */
function getReleaseBaseUrl(config) {
  if (config.provider === 'github') {
    /*
     * GitHub redirects this to the matching asset of the latest non draft,
     * non prerelease release - no API call (or token, or rate limit) needed.
     */
    return `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/releases/latest/download/`;
  }
  return `${config.url.replace(/\/+$/, '')}/`;
}

/**
 * Throw if `config` isn't a valid `PublishConfig`.
 * @param {Record<string, unknown>} config
 * @returns {asserts config is PublishConfig}
 */
function validatePublishConfig(config) {
  /** @type {string[]} */
  let requiredKeys;
  if (config.provider === 'github') {
    requiredKeys = ['owner', 'repo'];
  } else if (config.provider === 'generic') {
    requiredKeys = ['url'];
  } else {
    throw new Error(`Expected "provider" in app-update.yml to be "github" or "generic". Received: ${JSON.stringify(config.provider)}`);
  }
  for (const key of requiredKeys) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      throw new Error(`Expected "${key}" in app-update.yml to be a non-empty string for provider "${config.provider}".`);
    }
  }
}

/**
 * Read and validate `app-update.yml`.
 * @param {string} configPath
 * @param {string} packageName - What was packaged, for the error message, eg. `"the AppImage"`.
 * @returns {Promise<PublishConfig>}
 */
async function readPublishConfig(configPath, packageName) {
  let contents;
  try {
    contents = await fs.promises.readFile(configPath, 'utf-8');
  } catch (error) {
    throw new Error(`Unable to read ${configPath}. Was ${packageName} packaged with "publish" set?`, { cause: error });
  }
  const config = parseYaml(contents);
  validatePublishConfig(config);
  return config;
}

/**
 * Download the update info file `fileName` from where `app-update.yml` says
 * releases are published, and compare its version with `currentVersion`
 * using semantic versioning.
 * @param {object} options
 * @param {string | undefined} options.currentVersion - Version of the running application.
 * @param {string} options.configPath - Path to `app-update.yml`.
 * @param {string} options.fileName - Name of the update info file, see `updateInfoFileName`.
 * @param {string} options.packageName - What is updated, for error messages, eg. `"the AppImage"`.
 * @returns {Promise<UpdateCheckResult>}
 */
async function checkUpdateInfo({ currentVersion, configPath, fileName, packageName }) {
  if (!semver.valid(currentVersion)) {
    throw new Error(`Expected "options.currentVersion" to be a valid semantic version. Received: ${JSON.stringify(currentVersion)}`);
  }

  const baseUrl = getReleaseBaseUrl(await readPublishConfig(configPath, packageName));
  const updateInfoUrl = new URL(fileName, baseUrl).href;

  const response = await fetch(updateInfoUrl);
  if (!response.ok) {
    throw new Error(`Unable to download ${updateInfoUrl}: ${response.status} ${response.statusText}`);
  }
  const updateInfo = parseYaml(await response.text());

  const version = updateInfo.version;
  if (typeof version !== 'string' || !semver.valid(version)) {
    throw new Error(`Expected "version" in ${updateInfoUrl} to be a valid semantic version. Received: ${JSON.stringify(version)}`);
  }

  /** @type {Record<string, unknown>} */
  const file = Array.isArray(updateInfo.files) && updateInfo.files.length > 0
    ? updateInfo.files[0]
    : { url: updateInfo.path, sha512: updateInfo.sha512 };
  if (typeof file.url !== 'string' || typeof file.sha512 !== 'string') {
    throw new Error(`Expected ${updateInfoUrl} to list ${packageName}'s "url" and "sha512".`);
  }

  return {
    updateAvailable: semver.gt(version, /** @type {string} */ (currentVersion)),
    version,
    /* Relative to the update info file, ie. an asset of the same release. */
    url: new URL(file.url, baseUrl).href,
    sha512: file.sha512,
    size: typeof file.size === 'number' ? file.size : undefined,
    releaseDate: typeof updateInfo.releaseDate === 'string' ? updateInfo.releaseDate : undefined,
  };
}

/**
 * Download `update.url` to `destinationPath` and verify it against the
 * published size and SHA-512 digest. A download that doesn't match is
 * removed.
 * @param {object} options
 * @param {UpdateCheckResult} options.update - Result of `checkForUpdates()`.
 * @param {string} options.destinationPath - Where the download is written.
 * @param {string} options.packageName - What is downloaded, for error messages, eg. `"The AppImage"`.
 * @param {(progress: DownloadProgress) => void} [options.onProgress]
 * @returns {Promise<void>}
 */
async function downloadVerified({ update, destinationPath, packageName, onProgress }) {
  if (update.url === undefined || update.sha512 === undefined) {
    throw new Error('Expected the result of "checkForUpdates()" with a "url" and "sha512".');
  }

  const response = await fetch(update.url);
  if (!response.ok || response.body === null) {
    throw new Error(`Unable to download ${update.url}: ${response.status} ${response.statusText}`);
  }
  const contentLength = Number(response.headers.get('content-length'));
  const total = update.size ?? (contentLength > 0 ? contentLength : undefined);

  const hash = crypto.createHash('sha512');
  const fileHandle = await fs.promises.open(destinationPath, 'w', 0o755);
  let transferred = 0;
  try {
    for await (const chunk of /** @type {AsyncIterable<Uint8Array>} */ (/** @type {unknown} */ (response.body))) {
      hash.update(chunk);
      await fileHandle.write(chunk);
      transferred += chunk.byteLength;
      onProgress?.({ transferred, total });
    }
  } catch (error) {
    await fileHandle.close();
    await fs.promises.rm(destinationPath, { force: true });
    throw error;
  }
  await fileHandle.close();

  const digest = hash.digest('base64');
  if ((update.size !== undefined && transferred !== update.size) || digest !== update.sha512) {
    await fs.promises.rm(destinationPath, { force: true });
    throw new Error(`${packageName} downloaded from ${update.url} does not match the published size and SHA-512 digest.`);
  }
}

/**
 * Quit the running NW.js application, or the Node.js process outside NW.js.
 * @returns {void}
 */
function quitApp() {
  const nwApp = /** @type {{nw?: {App?: {quit?: () => void}}}} */ (globalThis).nw?.App;
  if (typeof nwApp?.quit === 'function') {
    nwApp.quit();
  } else {
    process.exit(0);
  }
}

export {
  checkUpdateInfo,
  downloadVerified,
  getReleaseBaseUrl,
  parseYaml,
  quitApp,
  readPublishConfig,
  updateInfoFileName,
  validatePublishConfig,
};
