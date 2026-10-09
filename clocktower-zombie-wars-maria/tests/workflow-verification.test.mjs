import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { verifyStages } from "../scripts/verify.mjs";

function fixture(failAt, exitCode = 7) {
  const directory = mkdtempSync(join(tmpdir(), "game-verify-"));
  const trace = join(directory, "stages.txt"), script = join(directory, "fixture.mjs");
  writeFileSync(script, `import { appendFileSync } from 'node:fs';\nappendFileSync(process.argv[2], process.argv[3] + '\\n');\nif (process.argv[3] === process.argv[4]) process.exit(Number(process.argv[5]));\n`);
  const messages = [];
  try {
    const status = verifyStages({
      run: stage => spawnSync(process.execPath, [script, trace, stage, failAt ?? "", String(exitCode)]),
      log: message => messages.push(message), reportError: message => messages.push(message),
    });
    return { status, stages: readFileSync(trace, "utf8").trim().split("\n"), messages };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("verification stops after failed tests and preserves the failing exit code", () => {
  const result = fixture("test", 7);
  assert.equal(result.status, 7);
  assert.deepEqual(result.stages, ["test"]);
  assert.ok(!result.messages.some(message => message.includes("全部检查通过")));
});

test("verification stops after failed lint before building", () => {
  const result = fixture("lint", 9);
  assert.equal(result.status, 9);
  assert.deepEqual(result.stages, ["test", "lint"]);
});

test("verification only reports success after all three subprocesses pass", () => {
  const result = fixture(null);
  assert.equal(result.status, 0);
  assert.deepEqual(result.stages, ["test", "lint", "build"]);
  assert.ok(result.messages.at(-1).includes("全部检查通过"));
  assert.equal(fixture("build", 3).status, 3);
});

test("spawn failures, throws and termination signals cannot report success", () => {
  for (const failure of [{ status: null, error: new Error("spawn failed") }, { status: null, signal: "SIGTERM" }, { status: null }]) {
    const calls = [];
    assert.equal(verifyStages({ run: stage => { calls.push(stage); return failure; }, log() {}, reportError() {} }), 1);
    assert.deepEqual(calls, ["test"]);
  }
  assert.equal(verifyStages({ run() { throw new Error("broken runner"); }, log() {}, reportError() {} }), 1);
});
