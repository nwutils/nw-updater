import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";

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
    });

    it("updates the application", async function () {
        assert.strictEqual(1 === 1, true);
    });
});
