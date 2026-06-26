import type { Chain, PublicClient, WalletClient } from "viem";
import type { HDAccount } from "viem/accounts";
import {
  emptyWorldState,
  type AccountState,
  type ContractState,
  type ExecutionStatus,
  type LocalnetInfo,
  type LogLevel,
  type NetworkConfig,
  type ScenarioState,
  type TokenBalance,
  type TxRecord,
  type WorldManifest,
  type WorldState,
} from "@blacksmith/shared";
import { AnvilProcess } from "../anvil/processManager.js";
import { assertAnvilInstalled } from "../anvil/preflight.js";
import { getChainStatus } from "../anvil/status.js";
import { revertSnapshot, takeSnapshot } from "../anvil/snapshot.js";
import { ANVIL_MNEMONIC } from "../config.js";
import { AppError } from "../utils/errors.js";
import { Mutex } from "../utils/mutex.js";
import { EventBus } from "./bus.js";

/** Redact anything resembling a private key from Anvil's stdout before logging. */
function redactSecrets(line: string): string {
  return line.replace(/0x[0-9a-fA-F]{64}/g, "0x⟨redacted⟩");
}
import {
  accountAtIndex,
  makeChain,
  makePublicClient,
  makeWalletClient,
} from "./clients.js";

interface ResolvedAccount {
  name: string;
  addressIndex: number;
  account: HDAccount;
  address: `0x${string}`;
}

interface ResolvedContract {
  id: string;
  kind: string;
  name: string;
  symbol: string;
  decimals: number;
  address: `0x${string}`;
  /** Account name that deployed (and owns) the contract. */
  deployer: string;
}

/**
 * The Runtime ties together the Anvil process, viem clients, the live world
 * state, and the event bus. It is the single mutable surface the executor and
 * routes operate on, and it broadcasts every state change to the UI.
 */
export class Runtime {
  readonly bus = new EventBus();
  private readonly mutex = new Mutex();

  private anvil: AnvilProcess | null = null;
  private chain: Chain | null = null;
  private publicClient: PublicClient | null = null;
  private mnemonic = ANVIL_MNEMONIC;
  private lastSnapshotId: string | null = null;
  private lastManifestJson: string | null = null;

  private state: WorldState = emptyWorldState();
  private readonly accounts = new Map<string, ResolvedAccount>();
  private readonly contracts = new Map<string, ResolvedContract>();
  private readonly walletCache = new Map<string, WalletClient>();

  // ── logging / state access ────────────────────────────────────────────────

  log(level: LogLevel, message: string, scope?: string): void {
    this.bus.log(level, message, scope);
  }

  /**
   * Serialize a runtime-mutating operation. The execute and localnet routes
   * run through this so concurrent requests can't both spawn/own Anvil.
   */
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(fn);
  }

  getState(): WorldState {
    // Hand out a clone so callers (reports, responses) can't mutate live state.
    return structuredClone(this.state);
  }

  /** Remember the most recently executed manifest (for modify/replay). */
  setLastManifest(manifest: WorldManifest): void {
    this.lastManifestJson = JSON.stringify(manifest);
  }

  getLastManifest(): WorldManifest | null {
    return this.lastManifestJson
      ? (JSON.parse(this.lastManifestJson) as WorldManifest)
      : null;
  }

  isRunning(): boolean {
    return this.anvil?.running ?? false;
  }

  get rpcUrl(): string | undefined {
    return this.anvil?.rpcUrl;
  }

  private commit(): void {
    this.bus.setState(this.state);
  }

  setExecution(status: ExecutionStatus, message?: string): void {
    this.state = { ...this.state, execution: status };
    this.bus.status(status, message);
    this.commit();
  }

  patchLocalnet(partial: Partial<LocalnetInfo>): void {
    this.state = {
      ...this.state,
      localnet: { ...this.state.localnet, ...partial },
    };
    this.commit();
  }

  // ── viem accessors ──────────────────────────────────────────────────────────

  getPublicClient(): PublicClient {
    if (!this.publicClient) throw new AppError("Localnet is not running", 409);
    return this.publicClient;
  }

  getChain(): Chain {
    if (!this.chain) throw new AppError("Localnet is not running", 409);
    return this.chain;
  }

  walletFor(name: string): WalletClient {
    const resolved = this.accounts.get(name);
    if (!resolved) throw new AppError(`Unknown account "${name}"`, 400);
    let client = this.walletCache.get(name);
    if (!client) {
      client = makeWalletClient(this.getChain(), this.rpcUrl!, resolved.account);
      this.walletCache.set(name, client);
    }
    return client;
  }

  // ── account / contract registry ──────────────────────────────────────────────

  registerAccount(name: string, addressIndex: number): ResolvedAccount {
    const account = accountAtIndex(this.mnemonic, addressIndex);
    const resolved: ResolvedAccount = {
      name,
      addressIndex,
      account,
      address: account.address,
    };
    this.accounts.set(name, resolved);
    return resolved;
  }

  getAccount(name: string): ResolvedAccount {
    const a = this.accounts.get(name);
    if (!a) throw new AppError(`Unknown account "${name}"`, 400);
    return a;
  }

  registerContract(c: ResolvedContract): void {
    this.contracts.set(c.id, c);
  }

  getContract(id: string): ResolvedContract {
    const c = this.contracts.get(id);
    if (!c) throw new AppError(`Unknown contract "${id}"`, 400);
    return c;
  }

  // ── world-state updaters (each emits) ────────────────────────────────────────

  upsertAccountState(entry: AccountState): void {
    const accounts = this.state.accounts.filter((a) => a.name !== entry.name);
    accounts.push(entry);
    this.state = { ...this.state, accounts };
    this.commit();
  }

  upsertContractState(entry: ContractState): void {
    const contracts = this.state.contracts.filter((c) => c.id !== entry.id);
    contracts.push(entry);
    this.state = { ...this.state, contracts };
    this.commit();
  }

  upsertTokenBalance(entry: TokenBalance): void {
    const tokenBalances = this.state.tokenBalances.filter(
      (t) => !(t.contractId === entry.contractId && t.account === entry.account),
    );
    tokenBalances.push(entry);
    this.state = { ...this.state, tokenBalances };
    this.commit();
  }

  addTransaction(tx: TxRecord): void {
    this.state = {
      ...this.state,
      transactions: [tx, ...this.state.transactions].slice(0, 100),
    };
    this.commit();
  }

  setScenario(scenario: ScenarioState | null): void {
    this.state = { ...this.state, scenario };
    this.commit();
  }

  // ── Anvil lifecycle ───────────────────────────────────────────────────────────

  async startLocalnet(network: NetworkConfig, sessionName?: string): Promise<void> {
    if (this.isRunning()) throw new AppError("Localnet is already running", 409);
    // Fail fast with an install hint rather than spawning a missing binary.
    await assertAnvilInstalled();
    this.resetWorldState();
    this.mnemonic = network.mnemonic ?? ANVIL_MNEMONIC;
    this.patchLocalnet({ status: "starting", forked: Boolean(network.forkUrl) });

    const anvil = new AnvilProcess({
      port: network.port,
      chainId: network.chainId,
      mnemonic: this.mnemonic,
      forkUrl: network.forkUrl,
    });

    try {
      await anvil.start((line, stream) =>
        this.log(stream === "err" ? "warning" : "debug", redactSecrets(line), "anvil"),
      );
    } catch (err) {
      this.patchLocalnet({ status: "error" });
      throw err;
    }

    this.anvil = anvil;
    this.chain = makeChain(network.chainId, anvil.rpcUrl);
    this.publicClient = makePublicClient(this.chain, anvil.rpcUrl);

    const status = await getChainStatus(this.publicClient);
    this.patchLocalnet({
      status: "running",
      chainId: status.chainId,
      rpcUrl: anvil.rpcUrl,
      blockNumber: status.blockNumber,
      forked: Boolean(network.forkUrl),
      ...(sessionName ? { sessionName } : {}),
    });
    this.log("success", `Anvil running at ${anvil.rpcUrl} (chainId ${status.chainId})`, "anvil");
  }

  async stopLocalnet(): Promise<void> {
    if (this.anvil) {
      await this.anvil.stop();
      this.log("info", "Anvil stopped", "anvil");
    }
    this.anvil = null;
    this.publicClient = null;
    this.chain = null;
    this.lastSnapshotId = null;
    this.walletCache.clear();
    this.patchLocalnet({ status: "stopped", blockNumber: undefined });
  }

  async refreshChainStatus(): Promise<void> {
    if (!this.publicClient || !this.isRunning()) return;
    const status = await getChainStatus(this.publicClient);
    this.patchLocalnet({ blockNumber: status.blockNumber, chainId: status.chainId });
  }

  async snapshot(): Promise<string> {
    const id = await takeSnapshot(this.getPublicClient());
    this.lastSnapshotId = id;
    this.log("info", `Snapshot taken (${id})`, "anvil");
    return id;
  }

  async revert(id?: string): Promise<boolean> {
    const target = id ?? this.lastSnapshotId;
    if (!target) throw new AppError("No snapshot available to revert to", 409);
    const ok = await revertSnapshot(this.getPublicClient(), target);
    this.log(ok ? "info" : "warning", `Revert to ${target} ${ok ? "ok" : "failed"}`, "anvil");
    await this.refreshChainStatus();
    return ok;
  }

  private resetWorldState(): void {
    this.accounts.clear();
    this.contracts.clear();
    this.walletCache.clear();
    this.bus.clearLogs();
    this.state = emptyWorldState();
    this.commit();
  }
}
