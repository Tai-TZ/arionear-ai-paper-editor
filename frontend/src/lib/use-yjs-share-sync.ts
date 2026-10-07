import { useEffect, useRef } from "react";
import * as Y from "yjs";

import { resolveWsBase } from "@/lib/api/ws-base";
import { getAccessToken } from "@/lib/auth-store";
import { useLatestRef } from "@/lib/use-latest-ref";

const LATEX_KEY = "latex";

export const SHARE_WS_SUBPROTOCOL = "edico-share";

/**
 * Live share sync is owner-only. Browsers cannot set headers on WebSockets, so the access token
 * travels as a subprotocol; the server answers with SHARE_WS_SUBPROTOCOL. No token, no socket.
 */
export function shareSocketProtocols(accessToken: string | null): string[] | null {
  if (!accessToken) return null;
  return [SHARE_WS_SUBPROTOCOL, `bearer.${accessToken}`];
}

type UseYjsShareSyncOptions = {
  token: string | null;
  enabled: boolean;
  latex: string;
  onRemoteLatex?: (latex: string) => void;
};

export function useYjsShareSync({ token, enabled, latex, onRemoteLatex }: UseYjsShareSyncOptions) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remoteLock = useRef(false);
  const localLock = useRef(false);
  const latexRef = useLatestRef(latex);

  useEffect(() => {
    const protocols = enabled && token ? shareSocketProtocols(getAccessToken()) : null;
    if (!enabled || !token || !protocols) {
      wsRef.current?.close();
      wsRef.current = null;
      ydocRef.current = null;
      ytextRef.current = null;
      return;
    }

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(LATEX_KEY);
    ydocRef.current = ydoc;
    ytextRef.current = ytext;

    const ws = new WebSocket(`${resolveWsBase()}/share/${token}`, protocols);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (event) => {
      remoteLock.current = true;
      Y.applyUpdate(ydoc, new Uint8Array(event.data as ArrayBuffer));
      remoteLock.current = false;
    };

    ytext.observe(() => {
      if (localLock.current || remoteLock.current) return;
      onRemoteLatex?.(ytext.toString());
    });

    ydoc.on("update", (update: Uint8Array) => {
      if (remoteLock.current) return;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(update);
      }
    });

    ws.onopen = () => {
      window.setTimeout(() => {
        const seed = latexRef.current;
        if (ytext.length > 0 || !seed.trim()) return;
        localLock.current = true;
        ydoc.transact(() => {
          ytext.insert(0, seed);
        });
        localLock.current = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(Y.encodeStateAsUpdate(ydoc));
        }
      }, 120);
    };

    return () => {
      ws.close();
      ydoc.destroy();
      wsRef.current = null;
      ydocRef.current = null;
      ytextRef.current = null;
    };
  }, [enabled, token, onRemoteLatex, latexRef]);

  useEffect(() => {
    const ytext = ytextRef.current;
    const ydoc = ydocRef.current;
    const ws = wsRef.current;
    if (!enabled || !token || !ytext || !ydoc || remoteLock.current) return;
    if (ytext.toString() === latex) return;

    localLock.current = true;
    ydoc.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, latex);
    });
    localLock.current = false;

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(Y.encodeStateAsUpdate(ydoc));
    }
  }, [latex, enabled, token]);
}

export function useYjsShareViewer({
  token,
  initialLatex,
  onLatex,
}: {
  token: string;
  initialLatex: string;
  onLatex: (latex: string) => void;
}) {
  useEffect(() => {
    // Anonymous viewers keep the snapshot from GET /share/{token}; only the owner can join live sync.
    const protocols = shareSocketProtocols(getAccessToken());
    if (!protocols) return;
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText(LATEX_KEY);
    const ws = new WebSocket(`${resolveWsBase()}/share/${token}`, protocols);
    ws.binaryType = "arraybuffer";
    let seeded = false;

    const pushRemote = () => {
      onLatex(ytext.toString());
    };

    ws.onmessage = (event) => {
      Y.applyUpdate(ydoc, new Uint8Array(event.data as ArrayBuffer));
      seeded = true;
      pushRemote();
    };

    ytext.observe(pushRemote);

    ws.onopen = () => {
      window.setTimeout(() => {
        if (seeded || !initialLatex.trim()) return;
        ydoc.transact(() => {
          ytext.insert(0, initialLatex);
        });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(Y.encodeStateAsUpdate(ydoc));
        }
      }, 120);
    };

    return () => {
      ws.close();
      ydoc.destroy();
    };
  }, [token, initialLatex, onLatex]);
}
