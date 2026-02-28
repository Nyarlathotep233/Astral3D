import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const now = new Date();
const runId = now.toISOString().replace(/[:.]/g, "-");
const resultRoot = path.join(repoRoot, "tests", "regression", "results", runId);

const cases = [
  {
    id: "S0-create-project-success",
    name: "Create project should succeed",
    script: path.resolve(
      repoRoot,
      "..",
      "astral-service",
      "tools",
      "playwright",
      "create-project-local-chrome.js"
    ),
    resultFile: "create-project-local-chrome-result.json",
    assert(result) {
      const failures = [];
      const addStatus = result?.addApi?.status;
      const addSuccess =
        addStatus === 200 &&
        (result?.addApi?.body?.success === true ||
          result?.addApi?.body?.code === 200 ||
          result?.addApi?.body?.status === 200 ||
          Boolean(result?.addApi?.body?.result));

      if (!result?.pageLoaded) failures.push("pageLoaded=false");
      if (!result?.createDialogOpened) failures.push("createDialogOpened=false");
      if (!addSuccess) failures.push(`addApi not successful (status=${addStatus ?? "unknown"})`);
      if (!result?.cardVisibleAfterReload) failures.push("cardVisibleAfterReload=false");
      if (Array.isArray(result?.errors) && result.errors.length > 0) {
        failures.push(`errors=${result.errors.join(" | ")}`);
      }

      return {
        pass: failures.length === 0,
        failures,
      };
    },
  },
  {
    id: "S0-complex-edit-save-success",
    name: "Complex scene edit and save should succeed",
    script: path.resolve(
      repoRoot,
      "..",
      "astral-service",
      "tools",
      "playwright",
      "complex-scene-edit-local-chrome.js"
    ),
    resultFile: "complex-scene-edit-local-chrome-result.json",
    assert(result) {
      const failures = [];
      const updateStatus = result?.updateApi?.status;

      if (!result?.pageLoaded) failures.push("pageLoaded=false");
      if (!result?.editorOpened) failures.push("editorOpened=false");
      if (!result?.sceneEditSucceeded) failures.push("sceneEditSucceeded=false");
      if (!result?.saveClicked) failures.push("saveClicked=false");
      if (!result?.saveDialogVisible) failures.push("saveDialogVisible=false");
      if (!result?.saveConfirmed) failures.push("saveConfirmed=false");
      if (!result?.saveApiSuccess) {
        failures.push(`saveApiSuccess=false (updateApi.status=${updateStatus ?? "unknown"})`);
      }
      if (Array.isArray(result?.errors) && result.errors.length > 0) {
        failures.push(`errors=${result.errors.join(" | ")}`);
      }

      return {
        pass: failures.length === 0,
        failures,
      };
    },
  },
];

function getCliArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const caseArgIndex = argv.indexOf("--case");
  const caseId = caseArgIndex >= 0 ? argv[caseArgIndex + 1] : undefined;
  return { dryRun, caseId };
}

function filterCases(caseId) {
  if (!caseId) return cases;
  return cases.filter((c) => c.id === caseId);
}

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

function runNodeScript(scriptPath, env, cwd) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], { env, cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function runCase(testCase) {
  const caseOutputDir = path.join(resultRoot, testCase.id);
  await ensureDir(caseOutputDir);
  const scriptDir = path.dirname(testCase.script);
  const rootNodeModules = path.join(repoRoot, "node_modules");
  const mergedNodePath = [rootNodeModules, process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter);

  const env = {
    ...process.env,
    PW_OUTPUT_DIR: caseOutputDir,
    NODE_PATH: mergedNodePath,
  };

  const startedAt = new Date().toISOString();
  if (!fs.existsSync(testCase.script)) {
    return {
      id: testCase.id,
      name: testCase.name,
      pass: false,
      startedAt,
      endedAt: new Date().toISOString(),
      resultPath: "",
      failures: [`script not found: ${testCase.script}`],
    };
  }

  const proc = await runNodeScript(testCase.script, env, scriptDir);
  const endedAt = new Date().toISOString();

  const resultPath = path.join(caseOutputDir, testCase.resultFile);
  const hasResultFile = fs.existsSync(resultPath);

  if (!hasResultFile) {
    const failures = [
      `result file not found: ${resultPath}`,
      `process exit code: ${proc.code}`,
      `stderr: ${proc.stderr || "<empty>"}`,
      `stdout: ${proc.stdout || "<empty>"}`,
    ];

    if (proc.stderr?.includes("Cannot find module 'playwright'")) {
      failures.push(
        "playwright module is missing. Install it in this workspace (or script-parent workspace) and run `npx playwright install chromium`."
      );
    }

    return {
      id: testCase.id,
      name: testCase.name,
      pass: false,
      startedAt,
      endedAt,
      resultPath,
      failures,
    };
  }

  let resultJson;
  try {
    const raw = await fs.promises.readFile(resultPath, "utf-8");
    resultJson = JSON.parse(raw);
  } catch (error) {
    return {
      id: testCase.id,
      name: testCase.name,
      pass: false,
      startedAt,
      endedAt,
      resultPath,
      failures: [`failed to parse result JSON: ${String(error)}`],
    };
  }

  const assertion = testCase.assert(resultJson);
  const pass = proc.code === 0 && assertion.pass;
  const failures = [];
  if (proc.code !== 0) failures.push(`process exit code: ${proc.code}`);
  failures.push(...assertion.failures);

  return {
    id: testCase.id,
    name: testCase.name,
    pass,
    startedAt,
    endedAt,
    resultPath,
    failures,
    metadata: {
      exitCode: proc.code,
      stderr: proc.stderr,
    },
  };
}

async function main() {
  const { dryRun, caseId } = getCliArgs();
  const selected = filterCases(caseId);

  if (selected.length === 0) {
    console.error(`No matching case found for --case ${caseId}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          repoRoot,
          selectedCases: selected.map((c) => ({
            id: c.id,
            name: c.name,
            script: c.script,
            resultFile: c.resultFile,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  await ensureDir(resultRoot);

  const caseResults = [];
  for (const c of selected) {
    // Keep execution serial to avoid browser/resource conflicts on shared environments.
    const r = await runCase(c);
    caseResults.push(r);
  }

  const passCount = caseResults.filter((r) => r.pass).length;
  const failCount = caseResults.length - passCount;
  const summary = {
    runAt: new Date().toISOString(),
    resultRoot,
    total: caseResults.length,
    passCount,
    failCount,
    cases: caseResults,
  };

  const summaryPath = path.join(resultRoot, "summary.json");
  await fs.promises.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(JSON.stringify(summary, null, 2));

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
