/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { logs } from '@opentelemetry/api-logs';
import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SessionAwareLoggerProvider } from '@opentelemetry/sdk-browser';
import type {
  LogRecordExporter,
  ReadableLogRecord,
} from '@opentelemetry/sdk-logs';
import {
  BatchLogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  createDefaultSessionIdGenerator,
  createLocalStorageSessionStore,
  createSessionManager,
} from '@opentelemetry/web-common';

export function initOtel(onLogExport: (record: ReadableLogRecord) => void) {
  const resource = resourceFromAttributes({
    'service.name': 'session-entity-demo',
  });

  const debugExporter = new DebugLogRecordExporter(onLogExport);

  const sessionManager = createSessionManager({
    sessionIdGenerator: createDefaultSessionIdGenerator(),
    sessionStore: createLocalStorageSessionStore(),
    inactivityTimeout: 15, // 15 seconds for demo
    maxDuration: 120, // 2 minutes max
  });

  // Create the session-aware logger provider.
  // This wraps a base LoggerProvider and manages entity-bound child providers.
  // When the session rotates, the child provider is swapped — instrumentations
  // holding Logger references don't need to know.
  const loggerProvider = new SessionAwareLoggerProvider(
    {
      resource,
      processors: [
        new SimpleLogRecordProcessor(debugExporter),
        new BatchLogRecordProcessor(new OTLPLogExporter()),
      ],
    },
    sessionManager,
  );

  logs.setGlobalLoggerProvider(loggerProvider);

  return { sessionManager, loggerProvider };
}

// --- Debug exporter that logs to the page ---
class DebugLogRecordExporter implements LogRecordExporter {
  private _onExport: (record: ReadableLogRecord) => void;

  constructor(onExport: (record: ReadableLogRecord) => void) {
    this._onExport = onExport;
  }

  export(
    records: ReadableLogRecord[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const record of records) {
      this._onExport(record);
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
