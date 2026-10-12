import { createConnection } from "node:net";
/** Small RESP client for the prototype infrastructure preflight and isolation commands. */
export async function valkey(url: string, command: "PING" | "FLUSHDB"): Promise<void> {
  const target = new URL(url),
    db = target.pathname.slice(1);
  if (command === "FLUSHDB" && db !== "15") throw new Error("Refusing FLUSHDB outside DB 15.");
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: target.hostname, port: Number(target.port || 6379) });
    let received = "";
    const encode = (parts: string[]) =>
      `*${String(parts.length)}\r\n${parts.map((part) => `$${String(Buffer.byteLength(part))}\r\n${part}\r\n`).join("")}`;
    socket.setTimeout(5000, () => {
      socket.destroy(new Error("Valkey connection timeout."));
    });
    socket.on("error", reject);
    socket.on("connect", () => socket.write(encode(["SELECT", db]) + encode([command])));
    socket.on("data", (data) => {
      received += data.toString();
      if (received.includes("-")) {
        socket.destroy(new Error("Valkey rejected command."));
        return;
      }
      if (received.split("\r\n").filter(Boolean).length === 2) {
        socket.end();
        resolve();
      }
    });
  });
}
