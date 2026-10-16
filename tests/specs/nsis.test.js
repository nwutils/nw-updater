import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import NsisUpdater from "../../src/nsis.js";
import { updateInfoFileName } from "../../src/publish.js";

describe("NsisUpdater", function () {
    let tmpDir = "";
    let configPath = "";
    let temporaryDirectory = "";
    let argsPath = "";

    /*
     * Stands in for the downloaded `Setup.exe`: a script that records the
     * arguments it was started with, so `install()` can be checked without
     * Windows or NSIS.
     */
    let newInstaller = Buffer.alloc(0);
    let newInstallerSha512 = "";

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

    before(async function () {
        await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
        const address = /** @type {import("node:net").AddressInfo} */ (server.address());
        baseUrl = `http://127.0.0.1:${address.port}`;

        tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nwutils-updater-nsis-test-"));
        argsPath = path.join(tmpDir, "installer-args.json");
        newInstaller = Buffer.from([
            "#!/usr/bin/env node",
            `require("node:fs").writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));`,
            "",
        ].join("\n"));
        newInstallerSha512 = crypto.createHash("sha512").update(newInstaller).digest("base64");
    });

    beforeEach(async function () {
        routes = {
            [`/releases/${updateInfoFileName(process.arch, "win")}`]: [
                "version: \"1.2.0\"",
                "files:",
                "  - url: \"Demo-x64-Setup.exe\"",
                `    sha512: "${newInstallerSha512}"`,
                `    size: ${newInstaller.length}`,
                "path: \"Demo-x64-Setup.exe\"",
                `sha512: "${newInstallerSha512}"`,
                "releaseDate: \"2026-10-16T00:00:00.000Z\"",
                "",
            ].join("\n"),
            "/releases/Demo-x64-Setup.exe": newInstaller,
        };
        configPath = path.join(tmpDir, "app-update.yml");
        await fs.promises.writeFile(configPath, `provider: "generic"\nurl: "${baseUrl}/releases/"\n`);
        temporaryDirectory = path.join(tmpDir, "downloads");
        await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
        await fs.promises.rm(argsPath, { force: true });
        originalNw = /** @type {{nw?: unknown}} */ (globalThis).nw;
    });

    afterEach(function () {
        /** @type {{nw?: unknown}} */ (globalThis).nw = originalNw;
    });

    after(async function () {
        await new Promise((resolve) => server.close(() => resolve(undefined)));
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    });

    /**
     * @param {import("../../src/nsis.js").NsisUpdaterOptions} [options]
     * @returns {NsisUpdater}
     */
    function createUpdater(options) {
        return new NsisUpdater({
            currentVersion: "1.1.0",
            configPath,
            temporaryDirectory,
            ...options,
        });
    }

    /**
     * Replace `nw.App.quit` for the current test.
     * @returns {{quits: number}}
     */
    function stubQuit() {
        const calls = { quits: 0 };
        /** @type {{nw?: unknown}} */ (globalThis).nw = { App: { quit: () => { calls.quits++; } } };
        return calls;
    }

    it("uses latest.yml, like @nwutils/packager and electron-builder", function () {
        assert.strictEqual(updateInfoFileName("x64", "win"), "latest.yml");
        assert.strictEqual(updateInfoFileName("arm64", "win"), "latest-arm64.yml");
    });

    it("throws when app-update.yml is missing", async function () {
        await assert.rejects(
            createUpdater({ configPath: path.join(tmpDir, "nope.yml") }).checkForUpdates(),
            /Was the installer packaged with "publish" set\?/,
        );
    });

    it("throws when currentVersion is not a semantic version", async function () {
        await assert.rejects(
            createUpdater({ currentVersion: "latest" }).checkForUpdates(),
            /Expected "options.currentVersion" to be a valid semantic version/,
        );
    });

    it("finds a newer version", async function () {
        assert.deepStrictEqual(await createUpdater().checkForUpdates(), {
            updateAvailable: true,
            version: "1.2.0",
            url: `${baseUrl}/releases/Demo-x64-Setup.exe`,
            sha512: newInstallerSha512,
            size: newInstaller.length,
            releaseDate: "2026-10-16T00:00:00.000Z",
        });
    });

    it("reports no update for the same version", async function () {
        const update = await createUpdater({ currentVersion: "1.2.0" }).checkForUpdates();
        assert.strictEqual(update.updateAvailable, false);
    });

    it("downloads and verifies the installer, keeping its .exe extension", async function () {
        const updater = createUpdater();
        /** @type {import("../../src/nsis.js").DownloadProgress[]} */
        const progress = [];

        const filePath = await updater.downloadUpdate(await updater.checkForUpdates(), {
            onProgress: (p) => progress.push(p),
        });

        assert.strictEqual(filePath, path.join(temporaryDirectory, "1.2.0-Demo-x64-Setup.exe"));
        assert.deepStrictEqual(await fs.promises.readFile(filePath), newInstaller);
        assert.deepStrictEqual(progress.at(-1), { transferred: newInstaller.length, total: newInstaller.length });
    });

    it("rejects and removes an installer that doesn't match the published digest", async function () {
        const updater = createUpdater();
        const update = await updater.checkForUpdates();
        routes["/releases/Demo-x64-Setup.exe"] = Buffer.from("tampered installer");

        await assert.rejects(
            updater.downloadUpdate(update),
            /The installer downloaded from .* does not match the published size and SHA-512 digest/,
        );
        assert.deepStrictEqual(await fs.promises.readdir(temporaryDirectory), []);
    });

    it("throws when the installer to install doesn't exist", async function () {
        await assert.rejects(
            createUpdater().install(path.join(tmpDir, "nope.exe")),
            /Unable to find the installer/,
        );
    });

    it(
        "runs the downloaded installer with /S /UPDATE, then quits so it can update",
        { skip: process.platform === "win32" && "the stand-in installer is a Node.js script" },
        async function () {
            const updater = createUpdater();
            const filePath = await updater.downloadUpdate(await updater.checkForUpdates());

            await updater.install(filePath);

            /* The installer is detached, so wait for it to record its arguments. */
            for (let attempt = 0; attempt < 100 && !fs.existsSync(argsPath); attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            assert.deepStrictEqual(JSON.parse(await fs.promises.readFile(argsPath, "utf-8")), ["/S", "/UPDATE"]);

            const calls = stubQuit();
            assert.throws(() => updater.restart(["--flag"]), /can't pass arguments after "install\(\)"/);
            updater.restart();
            assert.strictEqual(calls.quits, 1);
        },
    );

    it("restarts the application itself when there is no pending update", function () {
        const calls = stubQuit();
        /* Outside NW.js, `process.execPath` is Node.js: start it with a harmless argument. */
        createUpdater().restart(["--version"]);
        assert.strictEqual(calls.quits, 1);
    });
});
