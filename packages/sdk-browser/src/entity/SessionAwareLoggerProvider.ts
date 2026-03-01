/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LoggerProvider as ILoggerProvider,
  Logger,
  LoggerOptions,
} from '@opentelemetry/api-logs';
import type { LoggerProviderConfig } from '@opentelemetry/sdk-logs';
import { LoggerProvider } from '@opentelemetry/sdk-logs';
import type {
  Session,
  SessionObserver,
  SessionProvider,
  SessionPublisher,
} from '@opentelemetry/web-common';
import { createSessionEntity } from './createSessionEntity.ts';
import { EntityAwareLoggerProvider } from './EntityAwareLoggerProvider.ts';
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
 * Internally it uses EntityAwareLoggerProvider.forEntity() to obtain
 * entity-bound child providers that share the same export pipeline.
 */
export class SessionAwareLoggerProvider
  implements ILoggerProvider, SessionObserver
{
  private _baseProvider: EntityAwareLoggerProvider;
  private _currentProvider: LoggerProvider;
  private _loggers: Map<string, SessionAwareLogger> = new Map();

  constructor(
    config: LoggerProviderConfig,
    sessionManager: SessionProvider & SessionPublisher,
  ) {
    this._baseProvider = new EntityAwareLoggerProvider(config);

    // Create initial child provider with current session
    const sessionId = sessionManager.getSessionId();
    if (sessionId) {
      const entity = createSessionEntity(sessionId);
      this._currentProvider = this._baseProvider.forEntity(entity);
    } else {
      this._currentProvider = this._baseProvider;
    }

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
    const entity = createSessionEntity(newSession.id);
    this._currentProvider = this._baseProvider.forEntity(entity);
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
}
