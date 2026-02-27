/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents an Entity as defined in the OTel Entity Provider OTEP.
 * An Entity has a type, identifying attributes (which uniquely identify
 * the instance), and optional descriptive attributes.
 */
export interface Entity {
  type: string;
  identifier: Record<string, string>;
  attributes?: Record<string, string | number | boolean>;
}
