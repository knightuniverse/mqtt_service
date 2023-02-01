import { useMemo } from 'react';

import type { ISubject } from '../service/anon';
import type { ICache } from './cache';
import type { ExtraConfig, IHttp } from './http';
import { IocInstanceType } from './ioc';
import type { MqttService } from './mqtt';
import type { IMSTDependence } from './types';

function api(
  config: {
    data: Record<string, unknown>;
    method: 'get' | 'delete' | 'patch' | 'post' | 'put';
    url: string;
  } & ExtraConfig,
) {
  const I = window.lds.I;
  const http = I.get<IHttp>(IocInstanceType.API);
  const { data: params, method, url, ...extraConfig } = config;
  return http[method](url, params, extraConfig);
}

function api2(
  config: {
    params: Record<string, unknown>;
    method: 'get' | 'delete' | 'patch' | 'post' | 'put';
    url: string;
  } & ExtraConfig,
) {
  const I = window.lds.I;
  const http = I.get<IHttp>(IocInstanceType.API2);
  const { params, method, url, ...extraConfig } = config;
  return http[method](url, params, extraConfig);
}

function useCache(): ICache {
  const I = window.lds.I;
  return I.get<ICatch>(IocInstanceType.WebStorageCache);
}

function useCurrentUser() {
  const I = window.lds.I;
  const user: ISubject = I.get<ISubject>(IocInstanceType.Subject);
  return user;
}

function useApi(): IHttp {
  const I = window.lds.I;
  return I.get<IHttp>(IocInstanceType.API);
}

function useApi2(): IHttp {
  const I = window.lds.I;
  return I.get<IHttp>(IocInstanceType.API2);
}

function useMqttService() {
  const I = window.lds.I;
  return I.get<MqttService>(IocInstanceType.MqttService);
}

function useMSTDependence(): IMSTDependence {
  const cache = useCache();
  const httpUsingApi = useApi();
  const httpUsingApi2 = useApi2();
  const dependence = useMemo(
    () => ({
      api: httpUsingApi,
      api2: httpUsingApi2,
      cache,
    }),
    [cache, httpUsingApi, httpUsingApi2],
  );

  return dependence;
}

/**
 * 注销MqttService，关闭Mqtt链接
 * @returns
 * @remarks
 * 调用时机是，用户主动登出
 * @see projects\platform\src\pages\personal\personalDetails\api\index.jsx#userLogout
 */
function quitMqttService() {
  const I = window.lds.I;
  const service = I.get<MqttService>(IocInstanceType.MqttService);
  if (service.isGuest) {
    return;
  }

  service.quit();
}

/**
 * 注销MqttService，关闭Mqtt链接
 * @returns
 * @remarks
 * 调用时机是，用户token过期，强制退出当前登录
 */
function forceQuitMqttService() {
  const I = window.lds.I;
  const service = I.get<MqttService>(IocInstanceType.MqttService);
  if (service.isGuest) {
    return;
  }

  service.forceQuit();
}

/**
 * 移除当前Browser Tab中MqttService实例的所有worker
 * @returns
 * @remarks
 * 调用时机是，用户点击IMP-WEB界面右上角，手动切换项目
 */
async function forceRemoveMqttServiceWorkers() {
  const I = window.lds.I;
  const service = I.get<MqttService>(IocInstanceType.MqttService);
  if (service.isGuest) {
    return;
  }

  await service.removeWorkers();
}

export {
  api,
  api2,
  forceQuitMqttService,
  forceRemoveMqttServiceWorkers,
  quitMqttService,
  useCache,
  useApi,
  useApi2,
  useCurrentUser,
  useMqttService,
  useMSTDependence,
};
