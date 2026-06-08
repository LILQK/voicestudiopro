import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const processes = [];
let shuttingDown = false;

const run = (name, command, args, options = {}) => {
  let child;
  try {
    child = spawn(command, args, {
      stdio: "inherit",
      shell: options.shell ?? false,
      windowsHide: false,
    });
  } catch (error) {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
    return null;
  }

  processes.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
      return;
    }
    if (signal) {
      console.error(`[${name}] exited with signal ${signal}`);
      shutdown(1);
    }
  });

  return child;
};

const shutdown = (code = 0) => {
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  setTimeout(() => process.exit(code), 150);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("backend", isWindows ? "python" : "python3", ["-m", "app.backend.main"]);
run("web", isWindows ? "npm" : "npm", ["run", "dev:web"], { shell: isWindows });
