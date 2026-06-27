import { execa, type ResultPromise } from "execa";
import { createPublicClient, http } from "viem";
import { ANVIL_CONNECT_HOST, ANVIL_HOST, ANVIL_READY_TIMEOUT_MS } from "../config.js";
import { AppError, errorMessage } from "../utils/errors.js";
import { locateAnvil } from "./locate.js";

export interface AnvilOptions {
  port: number;
  chainId: number;
  mnemonic: string;
  forkUrl?: string | null;
}

export type AnvilLogHandler = (line: string, stream: "out" | "err") => void;

/**
 * Owns a single Anvil child process: spawns it, waits for the RPC to come up,
 * streams its output, and stops it cleanly.
 */
export class AnvilProcess {
  private proc: ResultPromise | null = null;
  readonly options: AnvilOptions;

  constructor(options: AnvilOptions) {
    this.options = options;
  }

  get rpcUrl(): string {
    return `http://${ANVIL_CONNECT_HOST}:${this.options.port}`;
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  get running(): boolean {
    return this.proc != null && this.proc.exitCode == null;
  }

  /** Spawn Anvil and resolve once the RPC responds (or throw on timeout). */
  async start(onLog?: AnvilLogHandler): Promise<void> {
    if (this.running) throw new AppError("Anvil is already running", 409);

    const args = [
      "--host",
      ANVIL_HOST,
      "--port",
      String(this.options.port),
      "--chain-id",
      String(this.options.chainId),
      "--mnemonic",
      this.options.mnemonic,
    ];
    if (this.options.forkUrl) {
      args.push("--fork-url", this.options.forkUrl);
    }

    this.proc = execa(locateAnvil(), args, {
      stdout: "pipe",
      stderr: "pipe",
      reject: false,
      cleanup: true,
    });

    if (onLog) {
      this.pipe(this.proc.stdout, "out", onLog);
      this.pipe(this.proc.stderr, "err", onLog);
    }

    // Surface an early crash (e.g. anvil binary missing) as a clear error.
    this.proc.catch((err: unknown) => {
      onLog?.(`anvil process error: ${errorMessage(err)}`, "err");
    });

    await this.waitUntilReady();
  }

  /** Stop Anvil, waiting for it to exit. */
  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    if (proc.exitCode != null) return;
    proc.kill("SIGTERM");
    try {
      await Promise.race([
        proc,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } finally {
      if (proc.exitCode == null) proc.kill("SIGKILL");
    }
  }

  private pipe(
    stream: NodeJS.ReadableStream | null,
    kind: "out" | "err",
    onLog: AnvilLogHandler,
  ): void {
    if (!stream) return;
    let buffer = "";
    stream.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) onLog(trimmed, kind);
      }
    });
  }

  private async waitUntilReady(): Promise<void> {
    const client = createPublicClient({ transport: http(this.rpcUrl) });
    const deadline = Date.now() + ANVIL_READY_TIMEOUT_MS;
    let lastError = "";
    while (Date.now() < deadline) {
      if (this.proc && this.proc.exitCode != null) {
        throw new AppError(
          `Anvil exited during startup (code ${this.proc.exitCode})`,
          500,
        );
      }
      try {
        await client.getBlockNumber();
        return;
      } catch (err) {
        lastError = errorMessage(err);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    await this.stop();
    throw new AppError(
      `Anvil did not become ready within ${ANVIL_READY_TIMEOUT_MS}ms`,
      504,
      lastError ? [lastError] : undefined,
    );
  }
}
