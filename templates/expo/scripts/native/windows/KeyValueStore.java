package maestro.cli.db;

import java.io.File;
import java.io.RandomAccessFile;
import java.io.UncheckedIOException;
import java.io.IOException;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;

/**
 * Windows adapter for the pinned Maestro 2.11.0 KeyValueStore ABI.
 * Upstream locks a data file then opens another handle to read/write it. Windows
 * mandatory locks reject that second handle. Use the locked handle for all I/O.
 * State belongs to this native run; never read/write the user's Maestro database.
 */
public final class KeyValueStore {
  private static final ConcurrentHashMap<Path, ReentrantLock> LOCKS = new ConcurrentHashMap<>();
  private final Path file;

  public KeyValueStore(File upstreamFile) {
    String state = System.getProperty("aitpl.maestro.stateDir");
    if (state == null || state.isEmpty()) throw new IllegalStateException("Owned Maestro state is required.");
    try {
      Path root = Path.of(state).toAbsolutePath().normalize();
      Files.createDirectories(root);
      byte[] hash = MessageDigest.getInstance("SHA-256").digest(upstreamFile.getAbsolutePath().getBytes(StandardCharsets.UTF_8));
      file = root.resolve(HexFormat.of().formatHex(hash) + ".db");
    } catch (Exception error) {
      throw new IllegalStateException("Owned Maestro state could not be prepared.", error);
    }
  }

  public String get(String key) { return access(db -> db.get(key), false); }
  public void set(String key, String value) { access(db -> { db.put(key, value); return null; }, true); }
  public void delete(String key) { access(db -> { db.remove(key); return null; }, true); }
  public List<String> keys() { return access(db -> new ArrayList<>(db.keySet()), false); }

  private <T> T access(Function<Map<String, String>, T> action, boolean write) {
    ReentrantLock processLock = LOCKS.computeIfAbsent(file, ignored -> new ReentrantLock());
    processLock.lock();
    try (RandomAccessFile handle = new RandomAccessFile(file.toFile(), "rw");
         FileLock fileLock = handle.getChannel().lock()) {
      if (!fileLock.isValid()) throw new IOException("Native state lock unavailable.");
      long length = handle.length();
      if (length > 16 * 1024 * 1024) throw new IOException("Native state exceeds its bounded size.");
      byte[] bytes = new byte[(int) length];
      handle.readFully(bytes);
      Map<String, String> db = new LinkedHashMap<>();
      for (String line : new String(bytes, StandardCharsets.UTF_8).split("\\r?\\n")) {
        int split = line.indexOf('=');
        if (split >= 0) db.put(line.substring(0, split), line.substring(split + 1));
      }
      T result = action.apply(db);
      if (write) {
        StringBuilder contents = new StringBuilder();
        for (Map.Entry<String, String> entry : db.entrySet()) {
          if (contents.length() > 0) contents.append('\n');
          contents.append(entry.getKey()).append('=').append(entry.getValue());
        }
        handle.setLength(0);
        handle.seek(0);
        handle.write(contents.toString().getBytes(StandardCharsets.UTF_8));
        handle.getFD().sync();
      }
      return result;
    } catch (IOException error) {
      throw new UncheckedIOException("Owned Maestro state I/O failed.", error);
    } finally {
      processLock.unlock();
    }
  }
}
