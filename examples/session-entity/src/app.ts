/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { logs } from '@opentelemetry/api-logs';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { Session, SessionObserver } from '@opentelemetry/web-common';
import { initOtel } from './otel-config.ts';

// --- Initialize OTel ---
const { sessionManager } = initOtel((record) => {
  appendLog(formatLogRecord(record));
});

// Observe session changes for UI updates
const uiObserver: SessionObserver = {
  onSessionStarted(newSession: Session, previousSession?: Session) {
    updateSessionDisplay(newSession.id);
    if (previousSession) {
      appendLog(
        `<span class="log-rotation">--- SESSION ROTATED ---</span>\n` +
          `old: ${previousSession.id}\n` +
          `new: ${newSession.id}`,
      );
    }
  },
  onSessionEnded(_session: Session) {
    // handled in onSessionStarted
  },
};
sessionManager.addObserver(uiObserver);

// Start the session manager (loads persisted session or creates new one)
sessionManager.start().then(() => {
  const sessionId = sessionManager.getSessionId();
  if (sessionId) {
    updateSessionDisplay(sessionId);
  }
  appendLog(
    'SDK initialized. Session tracking active via Entity Provider pattern.',
  );
});

// --- Simulate an instrumentation that grabs a logger once ---
// This is the key test: the logger is obtained ONCE and reused.
// After session rotation, it should still emit logs with the NEW session.id
// on the Resource, because EntityAwareLoggerProvider delegates dynamically.
const logger = logs
  .getLoggerProvider()
  .getLogger('demo-instrumentation', '1.0.0');
let logCounter = 0;

document.getElementById('btn-emit-log')?.addEventListener('click', () => {
  logCounter++;
  logger.emit({
    body: `User action #${logCounter}`,
  });
});

document.getElementById('btn-force-rotate')?.addEventListener('click', () => {
  // Force rotation by clearing storage and restarting.
  // The session manager doesn't expose a public "rotate" method,
  // so we simulate it by shutting down and restarting.
  sessionManager.shutdown();
  localStorage.removeItem('opentelemetry-session');
  sessionManager.start();
});

document.getElementById('btn-clear-log')?.addEventListener('click', () => {
  logEl.innerHTML = '';
});

// --- UI helpers ---
const logEl = document.getElementById('log') as HTMLElement;
const sessionIdEl = document.getElementById('session-id') as HTMLElement;

function appendLog(html: string) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = html;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateSessionDisplay(sessionId: string) {
  sessionIdEl.textContent = sessionId;
}

function formatLogRecord(record: ReadableLogRecord): string {
  const sessionId = record.resource.attributes['session.id'] ?? '(none)';
  const serviceName = record.resource.attributes['service.name'] ?? '(unknown)';

  return (
    `<span class="log-body">body:</span> ${record.body}\n` +
    `<span class="log-resource">service.name:</span> ${serviceName}\n` +
    `<span class="log-session">session.id (on Resource):</span> ${sessionId}`
  );
}
