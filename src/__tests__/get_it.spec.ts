import { GetIt } from '../ioc';
import type { IHttp } from '../http';

const I = new GetIt();

const MockHttp = {
  create: function (): IHttp {
    const http = {
      __id: Date.now(),
      get: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    };
    return http;
  },
};

const Types = {
  IHttp: Symbol.for('IHttp'),
};

describe('default scope', () => {
  beforeEach(() => {
    I.reset();
  });

  test('registerSingleton', () => {
    const http = MockHttp.create();
    I.registerSingleton<IHttp>(Types.IHttp, http);

    expect(I.isRegistered(Types.IHttp)).toBeTruthy();

    const instance = I.get<IHttp>(Types.IHttp);
    expect(instance).toBe(http);

    ['get', 'delete', 'patch', 'post', 'put'].forEach(method => {
      // @ts-ignore
      instance[method]('/');
      // @ts-ignore
      expect(http[method]).toBeCalledTimes(1);
    });
  });

  test('registerFactory', () => {
    I.registerFactory<IHttp>(Types.IHttp, () => MockHttp.create());

    expect(I.isRegistered(Types.IHttp)).toBeTruthy();

    const instance = I.get<IHttp>(Types.IHttp);
    expect(instance).not.toBeNull();
    expect(instance).not.toBeUndefined();

    ['get', 'delete', 'patch', 'post', 'put'].forEach(method => {
      // @ts-ignore
      instance[method]('/');
      // @ts-ignore
      expect(instance[method]).toBeCalledTimes(1);
    });

    expect(I.get<IHttp>(Types.IHttp)).not.toBe(I.get<IHttp>(Types.IHttp));
  });

  test('register same type more than once', () => {
    const http = MockHttp.create();
    I.registerSingleton<IHttp>(Types.IHttp, http);

    expect(() => {
      I.registerFactory<IHttp>(Types.IHttp, () => MockHttp.create());
    }).toThrow();

    expect(I.get<IHttp>(Types.IHttp)).toBe(http);
  });

  test('push scope', () => {
    expect(I.scopeDepth).toBe(1);

    I.pushScope('signedIn');

    expect(I.scopeDepth).toBe(2);

    const http = MockHttp.create();
    I.registerSingleton<IHttp>(Types.IHttp, http);
    expect(I.get<IHttp>(Types.IHttp)).toBe(http);

    I.pushScope('another scope');
    expect(I.scopeDepth).toBe(3);
    expect(I.get<IHttp>(Types.IHttp)).toBe(http);

    // expect(() => {
    //   I.registerFactory<IHttp>(Types.IHttp, () => MockHttp.create());
    // }).not.toThrow();

    expect(I.currentScopeName).toBe('another scope');

    I.registerFactory<IHttp>(Types.IHttp, () => MockHttp.create());
    const instance = I.get<IHttp>(Types.IHttp);
    expect(instance).not.toBe(http);
  });

  test('pop', () => {
    I.popScope();
    expect(I.scopeDepth).toBe(1);

    const beforeScopePop = jest.fn();
    I.pushScope('signedIn', beforeScopePop);
    expect(I.currentScopeName).toBe('signedIn');

    const http = MockHttp.create();
    I.registerSingleton<IHttp>(Types.IHttp, http);
    expect(I.get<IHttp>(Types.IHttp)).toBe(http);

    I.popScope();
    expect(beforeScopePop).toBeCalledTimes(1);
    expect(I.currentScopeName).toBe('__default__get_it__scope__');
    expect(() => {
      I.get<IHttp>(Types.IHttp);
    }).toThrow();
  });

  test('unregister', () => {
    const http = MockHttp.create();
    I.registerSingleton<IHttp>(Types.IHttp, http);
    expect(I.get<IHttp>(Types.IHttp)).toBe(http);

    I.unregister(Types.IHttp);
    expect(() => {
      I.get<IHttp>(Types.IHttp);
    }).toThrow();

    I.registerFactory<IHttp>(Types.IHttp, () => MockHttp.create());

    I.pushScope('signedIn');

    expect(I.get<IHttp>(Types.IHttp)).not.toBeNull();
    expect(I.get<IHttp>(Types.IHttp)).not.toBeUndefined();
  });
});
