import java.io.File;
import java.util.List;
import maestro.cli.db.KeyValueStore;

/** Runs against the classpath actually used by the Windows native test process. */
class StoreProbe {
  public static void main(String[] args) {
    File unusedUserDatabase = new File(args[0]);
    if (unusedUserDatabase.exists()) throw new AssertionError("Probe path must be absent.");
    KeyValueStore store = new KeyValueStore(unusedUserDatabase);
    store.set("first", "native=value-한글");
    store.set("second", "another value");
    if (!"native=value-한글".equals(store.get("first"))) throw new AssertionError("Native store changed UTF-8 bytes.");
    if (!store.keys().equals(List.of("first", "second"))) throw new AssertionError("Native store lost records.");
    store.delete("first");
    if (store.get("first") != null || !"another value".equals(store.get("second"))) throw new AssertionError("Native store delete changed another record.");
    store.delete("second");
    if (unusedUserDatabase.exists()) throw new AssertionError("Native test touched a user database path.");
    System.out.println("Native Maestro state verified.");
  }
}
