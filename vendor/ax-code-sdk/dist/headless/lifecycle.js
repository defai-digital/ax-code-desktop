import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
const SIGKILL_GRACE_MS = 300;
const EXIT_WAIT_MS = 2_000;
const STARTUP_TIMEOUT_MS = 10_000;
const READY_LINE_PREFIX = "ax-code server listening on ";
export class HeadlessBackendStartupError extends Error {
    diagnostics;
    constructor(message, diagnostics, options) {
        super(message, options);
        this.name = "HeadlessBackendStartupError";
        this.diagnostics = diagnostics;
    }
}
export async function startHeadlessBackend(options = {}) {
    const hostname = options.hostname ?? "127.0.0.1";
    assertSdkHttpLoopbackBind(hostname, options.allowNetworkBind);
    const reservePort = options.reservePort ?? reserveLoopbackPort;
    const port = options.port && options.port > 0
        ? options.port
        : await reservePort(hostname).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to reserve loopback port for ax-code backend on ${hostname}: ${message}`, {
                cause: error,
            });
        });
    const timeout = options.timeout ?? STARTUP_TIMEOUT_MS;
    const fetchFn = options.fetch ?? fetch;
    const username = options.auth?.username ?? "ax-code";
    const password = options.auth?.password ?? randomBytes(24).toString("base64url");
    const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const headers = { Authorization: authHeader };
    const binary = options.binary?.trim() || "ax-code";
    const args = options.args ?? ["serve", `--hostname=${hostname}`, `--port=${port}`];
    const diagnostics = {
        launchedAt: new Date().toISOString(),
        binary,
        args: [...args],
        cwd: options.directory,
        hostname,
        port,
        authUsername: username,
        envKeys: Object.keys(options.env ?? {}).sort(),
    };
    const proc = spawn(binary, args, {
        cwd: options.directory,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        env: {
            ...process.env,
            ...options.env,
            AX_CODE_SERVER_PASSWORD: password,
            AX_CODE_SERVER_USERNAME: username,
            ...(options.directory ? { AX_CODE_PROJECT: options.directory } : {}),
            ...(options.config ? { AX_CODE_CONFIG_CONTENT: JSON.stringify(options.config) } : {}),
        },
    });
    const closed = new Promise((resolve) => {
        proc.once("exit", () => resolve());
        proc.once("error", () => resolve());
    });
    const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            failStartup(new Error(`ax-code backend did not become ready within ${timeout}ms\nCaptured output:\n${capturedOutput}`));
        }, timeout);
        let capturedOutput = "";
        let settled = false;
        let stdoutBuf = "";
        let stderrBuf = "";
        const onReadyUrl = (urlStr) => {
            diagnostics.readyUrl = urlStr;
            void waitForBackendHealth({
                url: urlStr,
                headers,
                fetch: fetchFn,
            }).then((health) => {
                diagnostics.health = health;
                succeed(urlStr);
            }, (error) => {
                const message = error instanceof Error ? error.message : String(error);
                diagnostics.health = {
                    ok: false,
                    status: 0,
                    error: message,
                };
                failStartup(error instanceof Error ? error : new Error(message));
            });
        };
        const succeed = (url) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(url);
        };
        const failStartup = (error) => {
            if (settled)
                return;
            settled = true;
            diagnostics.capturedOutput = capturedOutput + stdoutBuf;
            clearTimeout(timer);
            cleanup();
            const startupError = error instanceof HeadlessBackendStartupError
                ? error
                : new HeadlessBackendStartupError(error.message, diagnostics, { cause: error });
            void killProc(proc)
                .catch(() => undefined)
                .finally(() => reject(startupError));
        };
        const onAbort = () => {
            failStartup(new Error("startHeadlessBackend aborted"));
        };
        const cleanup = () => {
            options.signal?.removeEventListener("abort", onAbort);
            proc.stdout?.off("data", onStdout);
            proc.stderr?.off("data", onStderr);
            proc.off("error", onError);
            proc.off("exit", onExit);
        };
        const onStdout = (chunk) => {
            stdoutBuf += chunk.toString();
            const lines = stdoutBuf.split("\n");
            stdoutBuf = lines.pop() ?? "";
            for (const line of lines) {
                capturedOutput += line + "\n";
                options.onStdout?.(line);
                if (line.startsWith(READY_LINE_PREFIX)) {
                    const urlStr = line.slice(READY_LINE_PREFIX.length).trim();
                    onReadyUrl(urlStr);
                }
            }
        };
        const onStderr = (chunk) => {
            const text = chunk.toString();
            capturedOutput += text;
            stderrBuf += text;
            const lines = stderrBuf.split("\n");
            stderrBuf = lines.pop() ?? "";
            for (const line of lines) {
                if (line.trim())
                    options.onStderr?.(line);
            }
        };
        const onError = (err) => {
            failStartup(new Error(`ax-code backend failed to start: ${err.message}`));
        };
        const onExit = (code, signal) => {
            const reason = signal ? `signal ${signal}` : `code ${code}`;
            diagnostics.exit = { code, signal, beforeReady: !settled };
            failStartup(new Error(`ax-code backend exited before becoming ready (${reason})\nCaptured output:\n${capturedOutput}`));
        };
        options.signal?.addEventListener("abort", onAbort, { once: true });
        if (options.signal?.aborted) {
            failStartup(new Error("startHeadlessBackend aborted"));
            return;
        }
        proc.stdout?.on("data", onStdout);
        proc.stderr?.on("data", onStderr);
        proc.once("error", onError);
        proc.once("exit", onExit);
    });
    return {
        url,
        headers,
        diagnostics,
        closed,
        async close() {
            await killProc(proc);
        },
    };
}
async function reserveLoopbackPort(hostname) {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.unref();
        const cleanup = () => {
            server.off("error", onError);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        server.once("error", onError);
        server.listen(0, hostname, () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : undefined;
            server.close((error) => {
                cleanup();
                if (error) {
                    reject(error);
                    return;
                }
                if (!port) {
                    reject(new Error("Failed to reserve a loopback port for ax-code backend"));
                    return;
                }
                resolve(port);
            });
        });
    });
}
function assertSdkHttpLoopbackBind(hostname, allowNetworkBind) {
    if (allowNetworkBind || isLoopbackHostname(hostname))
        return;
    throw new Error("startHeadlessBackend only binds the HTTP API to loopback hostnames by default. " +
        `Refusing hostname ${hostname}. ` +
        "Use @ax-code/sdk/grpc for desktop native transports, or pass allowNetworkBind: true only for an explicitly secured server.");
}
function isLoopbackHostname(hostname) {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return normalized === "localhost" || normalized === "::1" || isIpv4Loopback(normalized);
}
function isIpv4Loopback(hostname) {
    const parts = hostname.split(".");
    if (parts.length !== 4)
        return false;
    const numbers = parts.map((part) => Number(part));
    return numbers.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && numbers[0] === 127;
}
async function waitForBackendHealth(input) {
    const response = await input.fetch(new URL("/global/health", input.url), {
        method: "GET",
        headers: input.headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
        ? await response.json().catch(() => undefined)
        : await response.text().catch(() => undefined);
    if (!response.ok) {
        const text = typeof body === "string" ? body : body === undefined ? "" : JSON.stringify(body);
        throw new Error(`ax-code backend health check failed (${response.status}): ${text || response.statusText}`);
    }
    return {
        ok: true,
        status: response.status,
        body,
    };
}
async function killProc(proc) {
    if (proc.exitCode !== null || proc.signalCode !== null)
        return;
    return new Promise((resolve) => {
        let done = false;
        let forceKill;
        let giveUp;
        const finish = () => {
            if (done)
                return;
            done = true;
            if (forceKill)
                clearTimeout(forceKill);
            if (giveUp)
                clearTimeout(giveUp);
            resolve();
        };
        proc.once("exit", finish);
        try {
            signalProcessTree(proc, "SIGTERM");
        }
        catch {
            finish();
            return;
        }
        forceKill = setTimeout(() => {
            try {
                signalProcessTree(proc, "SIGKILL");
            }
            catch { }
        }, SIGKILL_GRACE_MS);
        giveUp = setTimeout(finish, EXIT_WAIT_MS);
    });
}
function signalProcessTree(proc, signal) {
    if (process.platform === "win32" && proc.pid) {
        try {
            const args = ["/pid", String(proc.pid), "/T"];
            if (signal === "SIGKILL")
                args.push("/F");
            spawn("taskkill", args, { stdio: "ignore" });
            return;
        }
        catch { }
    }
    if (process.platform !== "win32" && proc.pid) {
        try {
            process.kill(-proc.pid, signal);
            return;
        }
        catch { }
    }
    proc.kill(signal);
}
