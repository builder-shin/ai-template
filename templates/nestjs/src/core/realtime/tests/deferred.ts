export function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
} {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    resolve(value) {
      if (!resolve) throw new Error("Promise가 초기화되지 않았다");
      resolve(value);
    },
    reject(error) {
      if (!reject) throw new Error("Promise가 초기화되지 않았다");
      reject(error);
    },
  };
}
