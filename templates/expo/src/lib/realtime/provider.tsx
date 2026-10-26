import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, endSession } from "../session";
import { startRealtime } from "./connection";
import { nativeAppState, nativeSocket, ticketRequest } from "./native";
export function RealtimeProvider() {
  const scope = useSession(),
    queryClient = useQueryClient();
  const { manager, api, oauth, config } = scope;
  useEffect(
    () =>
      startRealtime({
        session: manager,
        queryClient,
        appState: nativeAppState(),
        ticket: ticketRequest(api),
        socket: nativeSocket(config.realtimeUrl),
        onRevoked: async (generation) => {
          if (manager.generation() === generation) await endSession({ manager, oauth });
        },
      }),
    [manager, api, oauth, config.realtimeUrl, queryClient],
  );
  return null;
}
