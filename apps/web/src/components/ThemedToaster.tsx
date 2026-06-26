import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/** Sonner toaster wired to the active theme, styled to match the cockpit. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={(resolvedTheme as "light" | "dark") ?? "dark"}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-md !border !border-border !bg-card !text-card-foreground !text-sm",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
