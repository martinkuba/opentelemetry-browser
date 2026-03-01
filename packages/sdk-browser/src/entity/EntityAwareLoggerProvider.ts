/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  LoggerProvider as ILoggerProvider,
  Logger,
  LoggerOptions,
  LogRecord,
} from '@opentelemetry/api-logs';
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
 *
 * setEntity(entity) dynamically rebinds this provider to a new entity.
 * Loggers previously obtained via getLogger() automatically route through
 * the new entity-bound provider — no re-registration needed.
 */
export class EntityAwareLoggerProvider implements ILoggerProvider {
  private _baseResource: Resource;
  private _providerConfig: Omit<LoggerProviderConfig, 'resource'>;
  private _currentProvider: LoggerProvider;
  private _loggers: Map<string, ProxyLogger> = new Map();

  constructor(config: LoggerProviderConfig) {
    const { resource, ...restConfig } = config;
    this._baseResource =
      resource ??
      ({
        attributes: {},
        merge: (r: Resource | null) => r ?? this._baseResource,
        getRawAttributes: () => [],
      } as Resource);
    this._providerConfig = restConfig;

    // Initial provider with no entity bound
    this._currentProvider = new LoggerProvider(config);
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

  /**
   * Dynamically rebinds this provider to a new entity.
   *
   * All loggers previously obtained via getLogger() will immediately
   * route telemetry through the new entity-bound provider.
   */
  setEntity(entity: Entity): void {
    this._currentProvider = this.forEntity(entity);
  }

  getLogger(name: string, version?: string, options?: LoggerOptions): Logger {
    const key = `${name}@${version ?? ''}:${options?.schemaUrl ?? ''}`;
    let logger = this._loggers.get(key);
    if (!logger) {
      logger = new ProxyLogger(this, name, version, options);
      this._loggers.set(key, logger);
    }
    return logger;
  }

  /**
   * Called by ProxyLogger on every emit() to get the current delegate logger.
   * @internal
   */
  getDelegateLogger(
    name: string,
    version?: string,
    options?: LoggerOptions,
  ): Logger {
    return this._currentProvider.getLogger(name, version, options);
  }

  async forceFlush(): Promise<void> {
    return this._currentProvider.forceFlush();
  }

  async shutdown(): Promise<void> {
    return this._currentProvider.shutdown();
  }
}

/**
 * A Logger proxy that resolves its delegate on every emit() call.
 *
 * When the owning EntityAwareLoggerProvider rebinds to a new entity,
 * all ProxyLogger instances immediately route through the new provider
 * with no notification needed.
 */
class ProxyLogger implements Logger {
  private _provider: EntityAwareLoggerProvider;
  private _name: string;
  private _version: string | undefined;
  private _options: LoggerOptions | undefined;

  constructor(
    provider: EntityAwareLoggerProvider,
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
