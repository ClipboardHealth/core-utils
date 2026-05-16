/**
 * Build-time secrets we shuttle into setup phases only. The launched agent
 * process must not inherit these values.
 */
export const BUILD_SECRET_NAMES = ["NPM_TOKEN", "BUF_TOKEN"] as const;
