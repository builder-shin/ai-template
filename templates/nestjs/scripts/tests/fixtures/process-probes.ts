import { createServer } from "node:net";
export function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
    throw error;
  }
}
export async function bindable(port: number): Promise<void> {
  const server = createServer();
  await new Promise<void>((yes, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", yes);
  });
  await new Promise<void>((yes, no) =>
    server.close((error) => {
      if (error) no(error);
      else yes();
    }),
  );
}
