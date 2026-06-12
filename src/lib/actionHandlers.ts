export type ActionHandler<Global, Actions, Payload> = (
  global: Global,
  actions: Actions,
  payload: Payload
) => Promise<void> | void;

export function createActionHandlerRegistry<
  Global,
  Actions,
  Payloads extends Record<string, unknown>
>() {
  const handlers: Partial<Record<keyof Payloads, unknown>> = {};

  function addActionHandler<T extends keyof Payloads>(
    action: T,
    handler: ActionHandler<Global, Actions, Payloads[T]>
  ) {
    handlers[action] = handler;
  }

  async function runAction<T extends keyof Payloads>(
    action: T,
    global: Global,
    actions: Actions,
    payload: Payloads[T]
  ) {
    const handler = handlers[action] as ActionHandler<Global, Actions, Payloads[T]> | undefined;
    if (!handler) {
      return;
    }
    await handler(global, actions, payload);
  }

  return {
    addActionHandler,
    runAction
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function runRequest<Result>(options: {
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setStatus?: (status: string | null) => void;
  fallbackError: string;
  successStatus?: string | null;
  isActive?: () => boolean;
  request: () => Promise<Result>;
  onSuccess: (result: Result) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}) {
  const {
    setBusy,
    setError,
    setStatus,
    fallbackError,
    successStatus,
    isActive,
    request,
    onSuccess,
    onError
  } = options;

  setBusy(true);
  setError(null);
  setStatus?.(null);

  try {
    const result = await request();
    if (isActive && !isActive()) {
      return;
    }
    await onSuccess(result);
    if (successStatus !== undefined) {
      setStatus?.(successStatus);
    }
  } catch (error) {
    if (isActive && !isActive()) {
      return;
    }
    await onError?.(error);
    setError(getErrorMessage(error, fallbackError));
  } finally {
    if (!isActive || isActive()) {
      setBusy(false);
    }
  }
}
