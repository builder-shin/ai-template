import { endSession } from "./actions";
test("logout cancels pending OAuth even when secure-store clearing fails", async () => {
  const cancel = jest.fn().mockRejectedValue(new Error("unavailable"));
  const signOut = jest.fn().mockResolvedValue(undefined);
  await expect(endSession({ oauth: { cancel }, manager: { signOut } })).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledTimes(1);
});
