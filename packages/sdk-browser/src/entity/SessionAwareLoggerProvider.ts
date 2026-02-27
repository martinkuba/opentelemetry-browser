/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LoggerProvider as ILoggerProvider,
  Logger,
  LoggerOptions,
} from '@opentelemetry/api-logs';
import type { Resource } from '@opentelemetry/resources';
import type { LoggerProviderConfig } from '@opentelemetry/sdk-logs';
import { LoggerProvider } from '@opentelemetry/sdk-logs';
import type {
  Session,
  SessionObserver,
  SessionProvider,
  SessionPublisher,
} from '@opentelemetry/web-common';
import { createSessionEntity } from './createSessionEntity.ts';
import { mergeEntityIntoResource } from './mergeEntityIntoResource.ts';
import { SessionAwareLogger } from './SessionAwareLogger.ts';

/**
 * A LoggerProvider that transparently routes telemetry through the current
 * session-bound child LoggerProvider.
 *
 * This solves the routing problem identified in the Entity Provider OTEP:
 * instrumentations grab a Logger once at init time and cache it. When a session
 * rotates, a new entity-bound provider is needed — but instrumentations don't
 * know about it. SessionAwareLoggerProvider acts as a stable global provider
 * while internally swapping the child provider on session rotation.
 *
 * The child providers share the same processor instances (and therefore the
 * same export pipeline), matching the behavior of forEntity() in the upstream
 * prototype.
 */
export class SessionAwareLoggerProvider
  implements ILoggerProvider, SessionObserver
{
  private _baseResource: Resource;
  private _config: Omit<LoggerProviderConfig, 'resource'>;
  private _currentProvider: LoggerProvider;
  private _loggers: Map<string, SessionAwareLogger> = new Map();

  constructor(
    config: LoggerProviderConfig,
    sessionManager: SessionProvider & SessionPublisher,
  ) {
    // Separate the resource from the rest of the config so we can create
    // new child providers with different resources but same processors.
    const { resource, ...restConfig } = config;
    this._baseResource =
      resource ??
      ({
        attributes: {},
        merge: (r: Resource | null) => r ?? this._baseResource,
        getRawAttributes: () => [],
      } as Resource);
    this._config = restConfig;

    // Create initial child provider with current session
    const sessionId = sessionManager.getSessionId();
    this._currentProvider = this._createProviderForSession(sessionId);

    sessionManager.addObserver(this);
  }

  getLogger(name: string, version?: string, options?: LoggerOptions): Logger {
    const key = `${name}@${version ?? ''}:${options?.schemaUrl ?? ''}`;
    let logger = this._loggers.get(key);
    if (!logger) {
      logger = new SessionAwareLogger(this, name, version, options);
      this._loggers.set(key, logger);
    }
    return logger;
  }

  /**
   * Called by SessionAwareLogger on every emit() to get the delegate
   * session-bound logger.
   */
  getDelegateLogger(
    name: string,
    version?: string,
    options?: LoggerOptions,
  ): Logger {
    return this._currentProvider.getLogger(name, version, options);
  }

  // --- SessionObserver ---

  onSessionStarted(newSession: Session): void {
    this._currentProvider = this._createProviderForSession(newSession.id);
  }

  onSessionEnded(_session: Session): void {
    // Force flush to ensure all telemetry from the ending session is exported
    this._currentProvider.forceFlush();
  }

  // --- Lifecycle ---

  async forceFlush(): Promise<void> {
    return this._currentProvider.forceFlush();
  }

  async shutdown(): Promise<void> {
    return this._currentProvider.shutdown();
  }

  // --- Internal ---

  private _createProviderForSession(sessionId: string | null): LoggerProvider {
    let resource = this._baseResource;
    if (sessionId) {
      const entity = createSessionEntity(sessionId);
      resource = mergeEntityIntoResource(this._baseResource, entity);
    }

    return new LoggerProvider({
      ...this._config,
      resource,
    });
  }
}
