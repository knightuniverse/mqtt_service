import { eachRight, isNil, last } from 'lodash';

import { assert } from './utils';

type FactoryFunc<T> = () => T;
type SyncScopeDisposeFunc = () => void;
type AsyncScopeDisposeFunc = () => Promise<void>;
type ScopeDisposeFunc = SyncScopeDisposeFunc | AsyncScopeDisposeFunc;

class GetItScope {
  private __name: string;
  private __dispose: ScopeDisposeFunc = () => void 0;
  private __registry = new Map<symbol, FactoryFunc<any>>();

  constructor(name: string, dispose: ScopeDisposeFunc = () => void 0) {
    this.__name = name;
    this.__dispose = dispose;
  }

  get name() {
    return this.__name;
  }

  dispose() {
    this.__dispose();
  }

  getFactoryFunc<T>(instanceType: symbol): FactoryFunc<T> {
    return this.__registry.get(instanceType) as FactoryFunc<T>;
  }

  isRegistered(instanceType: symbol): boolean {
    return this.__registry.has(instanceType);
  }

  registerFactory<T>(instanceType: symbol, factoryFunc: FactoryFunc<T>) {
    this.__registry.set(instanceType, factoryFunc);
  }

  registerSingleton<T>(instanceType: symbol, instance: T) {
    this.__registry.set(instanceType, function createSingleton() {
      return instance;
    });
  }

  unregister(instanceType: symbol) {
    this.__registry.delete(instanceType);
  }
}

const DefaultGetItScopeName = '__default__get_it__scope__';

interface IGetIt {
  readonly currentScopeName: string;

  get: <T>(instanceType: symbol) => T;
  pushScope: (name: string, dispose?: ScopeDisposeFunc) => void;
  popScope: () => void;
  isRegistered: (instanceType: symbol) => boolean;
  reset: () => void;
  registerFactory: <T>(instanceType: symbol, factoryFunc: FactoryFunc<T>) => void;
  registerSingleton: <T>(instanceType: symbol, instance: T) => void;
  unregister: (instanceType: symbol) => void;
}

/**
 * A simple Service Locator
 * Highly inspired by [get_it](https://pub.flutter-io.cn/packages/get_it)
 */
class GetIt implements IGetIt {
  private __scopes: GetItScope[] = [new GetItScope(DefaultGetItScopeName)];
  private get __currentScope(): GetItScope {
    return last(this.__scopes)!;
  }

  get scopeDepth(): number {
    return this.__scopes.length;
  }

  get currentScopeName(): string {
    return this.__currentScope.name;
  }

  get<T>(instanceType: symbol): T {
    let factory: FactoryFunc<T> | undefined = undefined;
    eachRight(this.__scopes, scope => {
      if (scope.isRegistered(instanceType) && isNil(factory)) {
        factory = scope.getFactoryFunc<T>(instanceType);
      }
    });

    assert(
      !isNil(factory),
      `Object/factory with type ${instanceType.description} is not registered inside GetIt.`,
    );

    return factory!() as T;
  }

  pushScope(name: string, dispose: ScopeDisposeFunc = () => void 0) {
    this.__scopes.push(new GetItScope(name, dispose));
  }

  popScope() {
    if (this.__scopes.length === 1) {
      return;
    }

    last(this.__scopes)?.dispose();

    this.__scopes.pop();
  }

  isRegistered(instanceType: symbol): boolean {
    let registered = false;
    eachRight(this.__scopes, scope => {
      if (scope.isRegistered(instanceType)) {
        registered = true;
      }
    });
    return registered;
  }

  // TODO 循环调用以前的scope对应的dispose方法
  reset() {
    this.__scopes = [new GetItScope(DefaultGetItScopeName)];
  }

  registerFactory<T>(instanceType: symbol, factoryFunc: FactoryFunc<T>) {
    assert(
      !this.__currentScope.isRegistered(instanceType),
      `Object/factory with type ${instanceType.description} is already registered inside GetIt.`,
    );

    this.__currentScope.registerFactory(instanceType, factoryFunc);
  }

  registerSingleton<T>(instanceType: symbol, instance: T) {
    assert(
      !this.__currentScope.isRegistered(instanceType),
      `Object/factory with type ${instanceType.description} is already registered inside GetIt.`,
    );

    this.__currentScope.registerSingleton(instanceType, instance);
  }

  unregister(instanceType: symbol) {
    eachRight(this.__scopes, scope => {
      if (scope.isRegistered(instanceType)) {
        scope.unregister(instanceType);
      }
    });
  }
}

const IocInstanceType = {
  API: Symbol.for('Core.Http.Api'),
  API2: Symbol.for('Core.Http.Api2'),
  CustomerConfig: Symbol.for('Core.Anon.CustomerConfig'),
  MqttService: Symbol.for('Core.Building.MqttService'),
  /** 当前登录的用户，也就是认证主体 */
  Subject: Symbol.for('Core.Anon.IMPWebUser'),
  SystemConfigs: Symbol.for('Core.Anon.SystemConfigs'),
  Toaster: Symbol.for('Core.Toaster'),
  WebStorageCache: Symbol.for('Core.Cache.WebStorageCache'),
};

export { GetIt, IocInstanceType };
export type { IGetIt, FactoryFunc, ScopeDisposeFunc };
