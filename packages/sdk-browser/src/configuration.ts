/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {
  createDefaultSessionIdGenerator,
  createLocalStorageSessionStore,
  createSessionManager,
  createSessionSpanProcessor,
} from '@opentelemetry/web-common';
import { createSessionEntity } from './entity/createSessionEntity.ts';
import { EntityAwareLoggerProvider } from './entity/EntityAwareLoggerProvider.ts';
import type { BrowserSDKConfiguration } from './types.ts';

export function configureBrowserSDK(config: BrowserSDKConfiguration): {
  shutdown: () => Promise<void>;
} {
  const resource = resourceFromAttributes({
    'service.name': config.serviceName ?? 'unknown_service',
  });

  // --- Traces ---
  const spanProcessors = config.spanProcessors ?? [];
  if (spanProcessors.length === 0 && config.spanExporter) {
    spanProcessors.push(new BatchSpanProcessor(config.spanExporter));
  }

  // --- Logs ---
  const logRecordProcessors = config.logRecordProcessors ?? [];
  if (logRecordProcessors.length === 0 && config.logRecordExporter) {
    logRecordProcessors.push(
      new SimpleLogRecordProcessor(config.logRecordExporter),
    );
  }

  // --- Session tracking ---
  let sessionManager: ReturnType<typeof createSessionManager> | undefined;

  if (config.enableSessionTracking) {
    sessionManager = createSessionManager({
      sessionIdGenerator: createDefaultSessionIdGenerator(),
      sessionStore: createLocalStorageSessionStore(),
    });

    // Traces still use the processor approach for now (entity prototype is LoggerProvider only)
    spanProcessors.push(createSessionSpanProcessor(sessionManager));
  }

  // --- Providers ---
  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors,
  });
  trace.setGlobalTracerProvider(tracerProvider);

  // For logs: use EntityAwareLoggerProvider when session tracking is enabled.
  // This models the session as an Entity on the Resource (per the Entity Provider OTEP)
  // instead of injecting session.id as an attribute via a processor.
  let loggerProvider: LoggerProvider | EntityAwareLoggerProvider;
  if (sessionManager) {
    const entityLoggerProvider = new EntityAwareLoggerProvider({
      resource,
      processors: logRecordProcessors,
    });

    // Bind to the current session entity
    const sessionId = sessionManager.getSessionId();
    if (sessionId) {
      entityLoggerProvider.setEntity(createSessionEntity(sessionId));
    }

    // Rebind on session rotation
    sessionManager.addObserver({
      onSessionStarted(session) {
        entityLoggerProvider.setEntity(createSessionEntity(session.id));
      },
      onSessionEnded() {
        entityLoggerProvider.forceFlush();
      },
    });

    loggerProvider = entityLoggerProvider;
  } else {
    loggerProvider = new LoggerProvider({
      resource,
      processors: logRecordProcessors,
    });
  }
  logs.setGlobalLoggerProvider(loggerProvider);

  // --- Instrumentations ---
  let disableInstrumentations: (() => void) | undefined;
  if (config.instrumentations && config.instrumentations.length > 0) {
    disableInstrumentations = registerInstrumentations({
      instrumentations: config.instrumentations,
    });
  }

  // --- Shutdown ---
  return {
    shutdown: async () => {
      disableInstrumentations?.();
      sessionManager?.shutdown();
      await tracerProvider.shutdown();
      await loggerProvider.shutdown();
    },
  };
}
