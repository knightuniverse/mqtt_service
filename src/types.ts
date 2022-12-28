import type { ICache } from './cache';
import type { IHttp } from './http';

interface IMSTDependence {
  api: IHttp;
  api2: IHttp;
  cache: ICache;
}

export type { IMSTDependence };
