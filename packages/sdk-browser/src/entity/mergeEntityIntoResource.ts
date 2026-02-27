/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Resource } from '@opentelemetry/resources';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { Entity } from './Entity.ts';

/**
 * Creates a new Resource by merging an Entity's attributes into a base Resource.
 *
 * Entity identifier attributes are always included. Entity descriptive attributes
 * are included but do not override existing resource attributes.
 *
 * This replicates the behavior of Resource.addEntity() from the upstream
 * entity provider prototype (opentelemetry-js PR #6357).
 */
export function mergeEntityIntoResource(
  baseResource: Resource,
  entity: Entity,
): Resource {
  const entityAttributes: Record<string, string | number | boolean> = {
    ...entity.identifier,
  };

  if (entity.attributes) {
    for (const [key, value] of Object.entries(entity.attributes)) {
      // Descriptive attributes don't override existing values
      if (!(key in entityAttributes)) {
        entityAttributes[key] = value;
      }
    }
  }

  const entityResource = resourceFromAttributes(entityAttributes);

  // Entity resource merges into base — entity identifier attrs take precedence
  return baseResource.merge(entityResource);
}
