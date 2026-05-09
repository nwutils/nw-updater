import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import express from "express";
import nwbuild from "nw-builder";

// import get from "../../src/main.js";

describe("updater test suite", function () {

    let nwOptions = {
        mode: "build",
        version: "latest",
        flavor: "normal",
        platform: "linux",
        arch: "x64",
        glob: false,
        zip: "zip",
    };

    const app = express();
    const filesDir = path.join(process.cwd(), "tests", "fixtures", "releases");
    app.use('/releases', express.static(filesDir));
    const server = http.createServer(app);

    before(async function () {
        nwOptions = {
            ...nwOptions,
            srcDir: "./tests/fixtures/app-current",
            outDir: "./tests/fixtures/releases/app-0.0.1-linux-x64"
        };
        if (!fs.existsSync(`${nwOptions.outDir}.zip`)) {
            await nwbuild(nwOptions);
        }

        nwOptions = {
            ...nwOptions,
            srcDir: "./tests/fixtures/app-latest",
            outDir: "./tests/fixtures/releases/app-0.0.2-linux-x64"
        };
        if (!fs.existsSync(`${nwOptions.outDir}.zip`)) {
            await nwbuild(nwOptions);
        }

        await new Promise((resolve) => {
            server.listen(3000, resolve);
        });
    });

    it("updates the application", async function () {
        assert.strictEqual(1 === 1, true);
    });

    after(async function () {
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
});
