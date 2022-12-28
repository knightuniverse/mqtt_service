import type { ICache } from '../cache';
import type { ExtraConfig, IHttp } from '../http';
import type { IMSTDependence } from '../types';

const MockCache = {
  create: function (entries: [string, any][] = []): jest.Mocked<ICache> {
    const storage = new Map(entries);
    const cache: jest.Mocked<ICache> = {
      get size() {
        return storage.size;
      },
      clear: jest.fn(() => {
        storage.clear();
        return Promise.resolve();
      }),
      getItem: jest.fn((key: string) => {
        return Promise.resolve(storage.get(key));
      }),
      setItem: jest.fn(<T = any>(key: string, value: T) => {
        storage.set(key, value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key: string) => {
        storage.delete(key);
        return Promise.resolve();
      }),
    };
    return cache;
  },
};

const MockHttp = {
  create: function (): jest.Mocked<IHttp> {
    const http: jest.Mocked<IHttp> = {
      get: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    };
    return http;
  },
};

function api(
  config: {
    params: Record<string, unknown>;
    method: 'get' | 'delete' | 'patch' | 'post' | 'put';
    url: string;
  } & ExtraConfig,
) {
  const http = MockHttp.create();
  const { params, method, url, ...extraConfig } = config;
  return http[method](url, params, extraConfig);
}

function api2(
  config: {
    params: Record<string, unknown>;
    method: 'get' | 'delete' | 'patch' | 'post' | 'put';
    url: string;
  } & ExtraConfig,
) {
  const http = MockHttp.create();
  const { params, method, url, ...extraConfig } = config;
  return http[method](url, params, extraConfig);
}

function useCache(): jest.Mocked<ICache> {
  return MockCache.create();
}

function useApi(): jest.Mocked<IHttp> {
  return MockHttp.create();
}

function useApi2(): jest.Mocked<IHttp> {
  return MockHttp.create();
}

function useMSTDependence(): jest.Mocked<IMSTDependence> {
  const cache = MockCache.create();
  const http = MockHttp.create();
  const httpUsingApi2 = MockHttp.create();

  return {
    api: http,
    api2: httpUsingApi2,
    cache,
  };
}

export { api, api2, useCache, useApi, useApi2, useMSTDependence };
