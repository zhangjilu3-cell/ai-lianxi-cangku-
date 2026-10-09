import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stages = Object.freeze(["test", "lint", "build"]);

function runNpmStage(stage) {
  const npmCli = process.env.npm_execpath ?? join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (!existsSync(npmCli)) return { status: 1, error: new Error("请使用 npm run verify 执行完整检查。") };
  return spawnSync(process.execPath, [npmCli, "run", stage], {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

export function verifyStages({ run = runNpmStage, log = console.log, reportError = console.error } = {}) {
  for (const stage of stages) {
    log(`正在检查：${stage}`);
    let result;
    try { result = run(stage); }
    catch (error) { reportError(`检查 ${stage} 无法启动：${error.message}`); return 1; }
    if (result.error || result.signal || result.status !== 0) {
      reportError(`检查 ${stage} 失败，已停止后续步骤。${result.error ? ` ${result.error.message}` : ""}`);
      return Number.isInteger(result.status) && result.status > 0 && result.status <= 255 ? result.status : 1;
    }
  }
  log("全部检查通过：测试、代码检查、构建。");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = verifyStages();
}
