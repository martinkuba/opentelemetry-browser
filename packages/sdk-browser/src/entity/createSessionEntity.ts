/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Entity } from './Entity.ts';

export function createSessionEntity(sessionId: string): Entity {
  return {
    type: 'browser.session',
    identifier: { 'session.id': sessionId },
  };
}
