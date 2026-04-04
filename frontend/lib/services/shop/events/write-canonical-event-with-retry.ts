import 'server-only';

type WriteCanonicalEventWithRetryArgs = {
  write: () => Promise<void>;
  onFinalFailure: (error: unknown) => void;
};

export async function writeCanonicalEventWithRetry(
  args: WriteCanonicalEventWithRetryArgs
): Promise<void> {
  try {
    await args.write();
    return;
  } catch {
    try {
      await args.write();
      return;
    } catch (error) {
      args.onFinalFailure(error);
    }
  }
}
