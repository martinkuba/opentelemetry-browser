/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Logger, LoggerOptions, LogRecord } from '@opentelemetry/api-logs';
import type { SessionAwareLoggerProvider } from './SessionAwareLoggerProvider.ts';

/**
 * A Logger proxy that dynamically delegates to the current session-bound Logger.
 *
 * Unlike ProxyLogger in the OTel API (which caches the delegate permanently),
 * this class resolves the delegate on every emit() call. This means that when
 * the session rotates and SessionAwareLoggerProvider swaps to a new child
 * provider, all existing SessionAwareLogger instances immediately route
 * telemetry through the new session's Logger — with no notification needed.
 */
export class SessionAwareLogger implements Logger {
  private _provider: SessionAwareLoggerProvider;
  private _name: string;
  private _version: string | undefined;
  private _options: LoggerOptions | undefined;

  constructor(
    provider: SessionAwareLoggerProvider,
    name: string,
    version?: string,
    options?: LoggerOptions,
  ) {
    this._provider = provider;
    this._name = name;
    this._version = version;
    this._options = options;
  }

  emit(logRecord: LogRecord): void {
    this._provider
      .getDelegateLogger(this._name, this._version, this._options)
      .emit(logRecord);
  }
}
