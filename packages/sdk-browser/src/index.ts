/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export { configureBrowserSDK } from './configuration.ts';
export { createSessionEntity } from './entity/createSessionEntity.ts';
export type { Entity } from './entity/Entity.ts';
export { EntityAwareLoggerProvider } from './entity/EntityAwareLoggerProvider.ts';
export { mergeEntityIntoResource } from './entity/mergeEntityIntoResource.ts';
export type { BrowserSDKConfiguration } from './types.ts';
