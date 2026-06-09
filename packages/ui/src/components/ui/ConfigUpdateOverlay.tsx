import React from "react";
import {
  getConfigUpdateSnapshot,
  subscribeConfigUpdate,
} from "@/lib/configUpdate";
import { AxCodeIcon } from "./AxCodeIcon";

export const ConfigUpdateOverlay: React.FC = () => {
  const [{ isUpdating, message }, setState] = React.useState(() => getConfigUpdateSnapshot());

  React.useEffect(() => {
    return subscribeConfigUpdate(setState);
  }, []);

  if (!isUpdating) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 px-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <AxCodeIcon width={80} height={80} />
        <div className="space-y-1.5">
          <div className="text-sm font-semibold text-foreground">AX Code is restarting</div>
          <div className="text-sm text-muted-foreground">{message}</div>
          <div className="text-xs text-muted-foreground/80">
            This can take a few minutes. AX Code Desktop will resume automatically.
          </div>
        </div>
      </div>
    </div>
  );
};
