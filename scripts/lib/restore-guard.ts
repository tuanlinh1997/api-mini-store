const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

export interface RestoreRequest {
  targetDatabase: string;
  configuredDatabase: string;
  nodeEnvironment: string | undefined;
  isForced: boolean;
}

/** Throws when a restore is not allowed; every refusal explains how to override it. */
export function assertRestoreAllowed(request: RestoreRequest): void {
  if (!DATABASE_NAME_PATTERN.test(request.targetDatabase)) {
    throw new Error(
      `Invalid --target "${request.targetDatabase}": use letters, digits and underscores only`,
    );
  }
  if (request.nodeEnvironment === 'production' && !request.isForced) {
    throw new Error('Refusing to restore while NODE_ENV=production. Re-run with --force.');
  }
  if (request.targetDatabase === request.configuredDatabase && !request.isForced) {
    throw new Error(
      `Refusing to restore into "${request.targetDatabase}", the database named in DATABASE_URL. ` +
        'Restore into a scratch database first, or re-run with --force to overwrite it.',
    );
  }
}
