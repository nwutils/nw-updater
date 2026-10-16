import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import MacUpdater, { findAppBundle } from "../../src/mac.js";
import { updateInfoFileName } from "../../src/publish.js";

/*
 * Stand-ins for the MacOS tools `MacUpdater` runs, so this suite runs on any
 * host. The "zip" is a JSON map of file paths to contents, which the stand-in
 * `ditto -x -k` writes out. The stand-in `codesign` treats an app with a
 * `Contents/_TeamIdentifier` file as signed by that team, and one with a
 * `Contents/_invalid` file as having a broken signature.
 */
const fakeDitto = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const [mode, format, zipPath, destination] = process.argv.slice(2);
if (mode !== "-x" || format !== "-k") process.exit(2);
for (const [file, contents] of Object.entries(JSON.parse(fs.readFileSync(zipPath, "utf-8")))) {
  fs.mkdirSync(path.dirname(path.join(destination, file)), { recursive: true });
  fs.writeFileSync(path.join(destination, file), contents);
}
`;
const fakeCodesign = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const app = args.at(-1);
if (args[0] === "-dv") {
  const teamFile = path.join(app, "Contents", "_TeamIdentifier");
  if (!fs.existsSync(teamFile)) {
    process.stderr.write(app + ": code object is not signed at all\\n");
    process.exit(1);
  }
  process.stderr.write("Identifier=com.example.demo\\nTeamIdentifier=" + fs.readFileSync(teamFile, "utf-8") + "\\n");
} else if (args[0] === "--verify") {
  if (fs.existsSync(path.join(app, "Contents", "_invalid"))) {
    process.stderr.write(app + ": invalid signature\\n");
    process.exit(1);
  }
}
`;
const fakeOpen = `#!/usr/bin/env node
require("node:fs").writeFileSync(process.env.FAKE_OPEN_ARGS, JSON.stringify(process.argv.slice(2)));
`;

describe(
    "MacUpdater",
    /* The stand-in tools are Node.js scripts started through their shebang. */
    { skip: process.platform === "win32" },
    function () {
        let tmpDir = "";
        let appsDir = "";
        let appPath = "";
        let configPath = "";
        let temporaryDirectory = "";
        let openArgsPath = "";
        /** @type {{dittoPath: string, codesignPath: string, openPath: string}} */
        let tools;

        /** @type {Record<string, string>} */
        let newAppFiles = {};
        let newZip = Buffer.alloc(0);
        let newZipSha512 = "";

        /** @type {Record<string, string | Buffer>} */
        let routes = {};
        const server = http.createServer((req, res) => {
            const body = routes[/** @type {string} */ (req.url)];
            if (body === undefined) {
                res.writeHead(404).end();
                return;
            }
            res.writeHead(200, { "Content-Length": Buffer.byteLength(body) }).end(body);
        });
        let baseUrl = "";

        /** @type {unknown} */
        let originalNw;

        /**
         * Publish a new release whose app contains `files`.
         * @param {Record<string, string>} files - Paths relative to the zip's root.
         * @returns {void}
         */
        function publishRelease(files) {
            newAppFiles = files;
            newZip = Buffer.from(JSON.stringify(files));
            newZipSha512 = crypto.createHash("sha512").update(newZip).digest("base64");
            routes = {
                [`/releases/${updateInfoFileName(process.arch, "osx")}`]: [
                    "version: \"1.2.0\"",
                    "files:",
                    "  - url: \"Demo-arm64-mac.zip\"",
                    `    sha512: "${newZipSha512}"`,
                    `    size: ${newZip.length}`,
                    "path: \"Demo-arm64-mac.zip\"",
                    `sha512: "${newZipSha512}"`,
                    "releaseDate: \"2026-10-17T00:00:00.000Z\"",
                    "",
                ].join("\n"),
                "/releases/Demo-arm64-mac.zip": newZip,
            };
        }

        before(async function () {
            await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
            const address = /** @type {import("node:net").AddressInfo} */ (server.address());
            baseUrl = `http://127.0.0.1:${address.port}`;

            tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nwutils-updater-mac-test-"));
            const binDir = path.join(tmpDir, "bin");
            await fs.promises.mkdir(binDir);
            tools = {
                dittoPath: path.join(binDir, "ditto"),
                codesignPath: path.join(binDir, "codesign"),
                openPath: path.join(binDir, "open"),
            };
            await fs.promises.writeFile(tools.dittoPath, fakeDitto, { mode: 0o755 });
            await fs.promises.writeFile(tools.codesignPath, fakeCodesign, { mode: 0o755 });
            await fs.promises.writeFile(tools.openPath, fakeOpen, { mode: 0o755 });
            openArgsPath = path.join(tmpDir, "open-args.json");
            process.env.FAKE_OPEN_ARGS = openArgsPath;
        });

        beforeEach(async function () {
            appsDir = path.join(tmpDir, `Applications-${crypto.randomUUID()}`);
            appPath = path.join(appsDir, "Demo.app");
            await fs.promises.mkdir(path.join(appPath, "Contents", "Resources"), { recursive: true });
            await fs.promises.writeFile(path.join(appPath, "Contents", "Info.plist"), "old");
            configPath = path.join(appPath, "Contents", "Resources", "app-update.yml");
            await fs.promises.writeFile(configPath, `provider: "generic"\nurl: "${baseUrl}/releases/"\n`);
            temporaryDirectory = path.join(tmpDir, "downloads");
            await fs.promises.rm(openArgsPath, { force: true });
            publishRelease({ "Demo.app/Contents/Info.plist": "new" });
            originalNw = /** @type {{nw?: unknown}} */ (globalThis).nw;
        });

        afterEach(function () {
            /** @type {{nw?: unknown}} */ (globalThis).nw = originalNw;
        });

        after(async function () {
            delete process.env.FAKE_OPEN_ARGS;
            await new Promise((resolve) => server.close(() => resolve(undefined)));
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        });

        /**
         * @param {import("../../src/mac.js").MacUpdaterOptions} [options]
         * @returns {MacUpdater}
         */
        function createUpdater(options) {
            return new MacUpdater({
                currentVersion: "1.1.0",
                appPath,
                temporaryDirectory,
                ...tools,
                ...options,
            });
        }

        /**
         * @param {MacUpdater} updater
         * @returns {Promise<string>}
         */
        async function download(updater) {
            return updater.downloadUpdate(await updater.checkForUpdates());
        }

        it("finds the outermost app bundle, also from NW.js' helper apps", function () {
            assert.strictEqual(
                findAppBundle("/Applications/Demo.app/Contents/Frameworks/nwjs Framework.framework/Helpers/nwjs Helper (Renderer).app/Contents/MacOS/nwjs Helper (Renderer)"),
                "/Applications/Demo.app",
            );
            assert.strictEqual(findAppBundle("/usr/local/bin/node"), undefined);
        });

        it("uses latest-mac.yml, like @nwutils/packager and electron-builder", function () {
            assert.strictEqual(updateInfoFileName("x64", "osx"), "latest-mac.yml");
            assert.strictEqual(updateInfoFileName("arm64", "osx"), "latest-mac-arm64.yml");
        });

        it("reads app-update.yml from the app's Contents/Resources", async function () {
            const update = await createUpdater().checkForUpdates();
            assert.strictEqual(update.updateAvailable, true);
        });

        it("throws when not running from an app bundle", async function () {
            await assert.rejects(
                async () => createUpdater({ appPath: "" }).install("update.zip"),
                /not running from a MacOS app bundle/,
            );
        });

        it("throws when app-update.yml is missing", async function () {
            await assert.rejects(
                createUpdater({ configPath: path.join(tmpDir, "nope.yml") }).checkForUpdates(),
                /Was the app packaged with "publish" set\?/,
            );
        });

        it("finds a newer version", async function () {
            assert.deepStrictEqual(await createUpdater().checkForUpdates(), {
                updateAvailable: true,
                version: "1.2.0",
                url: `${baseUrl}/releases/Demo-arm64-mac.zip`,
                sha512: newZipSha512,
                size: newZip.length,
                releaseDate: "2026-10-17T00:00:00.000Z",
            });
        });

        it("reports no update for the same version", async function () {
            const update = await createUpdater({ currentVersion: "1.2.0" }).checkForUpdates();
            assert.strictEqual(update.updateAvailable, false);
        });

        it("downloads and verifies the update", async function () {
            const filePath = await download(createUpdater());

            assert.strictEqual(filePath, path.join(temporaryDirectory, "1.2.0-Demo-arm64-mac.zip"));
            assert.deepStrictEqual(await fs.promises.readFile(filePath), newZip);
        });

        it("rejects and removes an update that doesn't match the published digest", async function () {
            const updater = createUpdater();
            const update = await updater.checkForUpdates();
            routes["/releases/Demo-arm64-mac.zip"] = Buffer.from(JSON.stringify({ "Demo.app/evil": "x" }));

            await assert.rejects(
                updater.downloadUpdate(update),
                /The app downloaded from .* does not match the published size and SHA-512 digest/,
            );
            assert.strictEqual(fs.existsSync(path.join(temporaryDirectory, "1.2.0-Demo-arm64-mac.zip")), false);
        });

        it("swaps in the new app and cleans up", async function () {
            const updater = createUpdater();
            const filePath = await download(updater);

            await updater.install(filePath);

            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "new");
            assert.deepStrictEqual(await fs.promises.readdir(appsDir), ["Demo.app"], "staging and old bundles should be removed");
            assert.strictEqual(fs.existsSync(filePath), false, "downloaded zip should be removed");
        });

        it("keeps the app's own name when the update's bundle is named differently", async function () {
            publishRelease({ "Demo Renamed.app/Contents/Info.plist": "new" });
            const updater = createUpdater();

            await updater.install(await download(updater));

            assert.deepStrictEqual(await fs.promises.readdir(appsDir), ["Demo.app"]);
            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "new");
        });

        it("installs an update signed by the same team as the running app", async function () {
            await fs.promises.writeFile(path.join(appPath, "Contents", "_TeamIdentifier"), "TEAMID");
            publishRelease({
                "Demo.app/Contents/Info.plist": "new",
                "Demo.app/Contents/_TeamIdentifier": "TEAMID",
            });
            const updater = createUpdater();

            await updater.install(await download(updater));

            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "new");
        });

        it("refuses an update signed by a different team, leaving the app as it was", async function () {
            await fs.promises.writeFile(path.join(appPath, "Contents", "_TeamIdentifier"), "TEAMID");
            publishRelease({
                "Demo.app/Contents/Info.plist": "evil",
                "Demo.app/Contents/_TeamIdentifier": "OTHERTEAM",
            });
            const updater = createUpdater();

            await assert.rejects(
                updater.install(await download(updater)),
                /signed by "OTHERTEAM", not by "TEAMID"/,
            );
            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "old");
            assert.deepStrictEqual(await fs.promises.readdir(appsDir), ["Demo.app"]);
        });

        it("refuses an unsigned update when the running app is signed", async function () {
            await fs.promises.writeFile(path.join(appPath, "Contents", "_TeamIdentifier"), "TEAMID");
            const updater = createUpdater();

            await assert.rejects(
                updater.install(await download(updater)),
                /signed by undefined, not by "TEAMID"/,
            );
            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "old");
        });

        it("refuses an update with an invalid signature", async function () {
            await fs.promises.writeFile(path.join(appPath, "Contents", "_TeamIdentifier"), "TEAMID");
            publishRelease({
                "Demo.app/Contents/Info.plist": "evil",
                "Demo.app/Contents/_TeamIdentifier": "TEAMID",
                "Demo.app/Contents/_invalid": "",
            });
            const updater = createUpdater();

            await assert.rejects(
                updater.install(await download(updater)),
                /code signature is not valid/,
            );
            assert.strictEqual(await fs.promises.readFile(path.join(appPath, "Contents", "Info.plist"), "utf-8"), "old");
        });

        it("restarts with open -n and quits", async function () {
            let quits = 0;
            /** @type {{nw?: unknown}} */ (globalThis).nw = { App: { quit: () => { quits++; } } };

            createUpdater().restart(["--flag"]);

            for (let attempt = 0; attempt < 100 && !fs.existsSync(openArgsPath); attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(openArgsPath, "utf-8")), ["-n", appPath, "--args", "--flag"]);
            assert.strictEqual(quits, 1);
        });
    },
);
