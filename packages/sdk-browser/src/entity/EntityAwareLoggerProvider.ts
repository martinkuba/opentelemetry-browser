/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Resource } from '@opentelemetry/resources';
import type { LoggerProviderConfig } from '@opentelemetry/sdk-logs';
import { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { Entity } from './Entity.ts';
import { mergeEntityIntoResource } from './mergeEntityIntoResource.ts';

/**
 * A LoggerProvider that supports the proposed forEntity() API from the
 * Entity Provider OTEP.
 *
 * forEntity(entity) returns a new LoggerProvider whose Resource includes
 * the entity's identifying and descriptive attributes. The returned provider
 * shares the same processor configuration (and therefore the same export
 * pipeline) as the base provider.
 */
export class EntityAwareLoggerProvider extends LoggerProvider {
  private _baseResource: Resource;
  private _providerConfig: Omit<LoggerProviderConfig, 'resource'>;

  constructor(config: LoggerProviderConfig) {
    super(config);

    const { resource, ...restConfig } = config;
    this._baseResource =
      resource ??
      ({
        attributes: {},
        merge: (r: Resource | null) => r ?? this._baseResource,
        getRawAttributes: () => [],
      } as Resource);
    this._providerConfig = restConfig;
  }

  /**
   * Returns a new LoggerProvider bound to the given entity.
   *
   * The returned provider's Resource is the base resource merged with the
   * entity's attributes. It shares the same processors and export pipeline
   * as this provider.
   */
  forEntity(entity: Entity): LoggerProvider {
    const resource = mergeEntityIntoResource(this._baseResource, entity);
    return new LoggerProvider({
      ...this._providerConfig,
      resource,
    });
  }
}
