import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { applyEnvText, loadEnv } from "../src/env.mjs";

describe("env vault", () => {
  it("applyEnvText does not overwrite an already-set key", () => {
    process.env.ORION_ENV_TEST_KEY = "from-process";
    applyEnvText("ORION_ENV_TEST_KEY=from-file\n");
    assert.equal(process.env.ORION_ENV_TEST_KEY, "from-process");
    delete process.env.ORION_ENV_TEST_KEY;
  });

  it("loadEnv reads the outside-repo vault first, then repo .env for leftovers", () => {
    delete process.env.ORION_ENV_VAULT_ONLY;
    delete process.env.ORION_ENV_REPO_ONLY;
    const dir = mkdtempSync(path.join(tmpdir(), "orion-env-"));
    const vault = path.join(dir, "buffer.env");
    writeFileSync(vault, "ORION_ENV_VAULT_ONLY=vault\nORION_ENV_REPO_ONLY=from-vault\n");
    writeFileSync(path.join(dir, ".env"), "ORION_ENV_REPO_ONLY=from-repo\n");
    loadEnv(dir, vault);
    assert.equal(process.env.ORION_ENV_VAULT_ONLY, "vault");
    assert.equal(process.env.ORION_ENV_REPO_ONLY, "from-vault");
    delete process.env.ORION_ENV_VAULT_ONLY;
    delete process.env.ORION_ENV_REPO_ONLY;
  });
});
