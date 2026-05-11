/**
 * Registers before App loads so uncaught JS errors are also printed to the Metro / Expo terminal.
 */
declare const ErrorUtils: {
  getGlobalHandler(): ((error: Error, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: Error, isFatal?: boolean) => void): void;
};

if (__DEV__) {
  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error(`[${isFatal ? 'Fatal' : 'Runtime'}]`, error?.message, '\n', error?.stack ?? error);
    prev?.(error, isFatal);
  });
}
