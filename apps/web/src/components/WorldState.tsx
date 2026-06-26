import { useState } from "react";
import { Boxes, Coins, Eye, EyeOff, Users } from "lucide-react";
import { isAddress } from "@nightsmith/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { useAppStore } from "@/state/useAppStore";
import { truncateHex } from "@/lib/utils";

function SubHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-2 text-xs text-muted-foreground">{children}</p>;
}

function Addr({ value }: { value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-xs" title={value}>
        {truncateHex(value)}
      </span>
      <CopyButton value={value} label="Copy address" />
    </span>
  );
}

/** Reveal/copy an account's (public Anvil test) private key. */
function KeyReveal({ value }: { value?: string }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <span className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide private key" : "Show private key"}
        title="Anvil public test key — safe to import into a wallet"
        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </button>
      {show && (
        <span className="font-mono text-[0.625rem] text-muted-foreground" title={value}>
          {truncateHex(value, 6, 4)}
        </span>
      )}
      <CopyButton value={value} label="Copy private key" />
    </span>
  );
}

export function WorldState() {
  const { accounts, contracts, tokenBalances } = useAppStore((s) => s.world);

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader>
        <CardTitle>
          <Boxes className="size-3.5 text-muted-foreground" />
          World state
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 space-y-3 overflow-y-auto scrollbar-thin">
        <section className="space-y-1">
          <SubHeading icon={<Users className="size-3" />}>Accounts</SubHeading>
          {accounts.length === 0 ? (
            <Empty>No accounts yet — run a plan to create them.</Empty>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.name} className="border-t">
                    <td className="py-1 pr-2 font-medium">{a.name}</td>
                    <td className="py-1 pr-2">
                      <Addr value={a.address} />
                    </td>
                    <td className="py-1 pr-2 font-mono text-xs text-muted-foreground">
                      {a.ethBalance} ETH
                    </td>
                    <td className="py-1 text-right">
                      <KeyReveal value={a.privateKey} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-1">
          <SubHeading icon={<Boxes className="size-3" />}>Contracts</SubHeading>
          {contracts.length === 0 ? (
            <Empty>No contracts deployed.</Empty>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-1 pr-2 font-medium">{c.symbol}</td>
                    <td className="py-1 pr-2 text-xs text-muted-foreground">{c.name}</td>
                    <td className="py-1">
                      <Addr value={c.address} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="space-y-1">
          <SubHeading icon={<Coins className="size-3" />}>Token balances</SubHeading>
          {tokenBalances.length === 0 ? (
            <Empty>No token balances.</Empty>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {tokenBalances.map((t) => (
                  <tr key={`${t.contractId}-${t.account}`} className="border-t">
                    <td className="py-1 pr-2 font-medium">
                      {isAddress(t.account) ? <Addr value={t.account} /> : t.account}
                    </td>
                    <td className="py-1 text-right font-mono text-xs">
                      {t.balance} {t.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
