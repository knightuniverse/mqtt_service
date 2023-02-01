/**
 * 缓存项配置
 * @remarks
 * 有些缓存项我们希望是只读的，并且不可删除，这时候我们可以通过缓存项进行配置
 * @example
 * each(
 *   [
 *     CK_ACCESS_TOKEN,
 *     CK_MQTT_HOST,
 *     CK_MQTT_HOST_PROTOCOL,
 *     CK_MQTT_PASSWORD,
 *     CK_SESSION_STORE
 *   ],
 *   k => {
 *     cache4MqttService.defineCacheItem(k, {
 *       configurable: false, // 禁止更改缓存配置
 *       deletable: false, // 不可删除
 *       writable: false, // 不可修改
 *     });
 *   },
 * );
 */
type CacheItemDescriptor = {
  /**
   * 是否只是多次修改当前缓存项配置
   * @default false
   */
  configurable: boolean;
  /**
   * 是否允许删除缓存项
   * @default true
   */
  deletable: boolean;
  /**
   * 是否允许更新缓存项目
   * @default true
   */
  writable: boolean;
};

interface ICache {
  readonly size: number;
  getItem: <T = unknown>(key: string) => Promise<T | null>;
  setItem: <T = unknown>(
    key: string,
    value: T,
    descriptor?: Partial<CacheItemDescriptor>,
  ) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  defineCacheItem: (key: string, nextDescriptor: Partial<CacheItemDescriptor>) => void;
}

interface ICacheItem<T = unknown> {
  readonly key: string;
  readonly value: T;
  /** 创建时间 */
  readonly createdAt: number;
  // TODO 也许我们应该考虑一个updatedAt时间戳，这样我们可以更好的实现缓存项过期方面的控制策略
}

const DEFAULT_DESCRIPTOR: CacheItemDescriptor = {
  configurable: false,
  deletable: true,
  writable: true,
};

/**
 * 使用Storage实现的Key-Value Cache，可以使用window.localStorage或者window.sessionStorage
 *
 * @example
 *
 * 一个完整的localStorage存储（token是旧的storage写入，上古代码）：
 *
 * | Key                    | Value       |
 * | ---------------------- | ----------- |
 * | _LDS_mqttPassword      | {"createdAt":1674868795170,"key":"_LDS_mqttPassword","value":"f4eafcf"}       |
 * | _LDS_mqttUuid          | {"createdAt":1674868795170,"key":"_LDS_mqttUuid","value":"71e3d71cef9e40379d596858e926fc32"} |
 * | token                  | ey |
 */
class WebStorageCache implements ICache {
  /**
   * 缓存项的前缀
   */
  private __cacheKeyPrefix = '_LDS_';
  private __isMyCacheKey = new RegExp('^_LDS_(\\S+)$', 'g');
  private __descriptors = new Map<string, CacheItemDescriptor>([]);
  private __items = new Map<string, ICacheItem<any>>();
  private __storage = window.localStorage;
  private __updates = new Set<string>([]);
  private __removes = new Set<string>([]);
  private __keys(storage: Storage) {
    const keys = new Set<string>([]);
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null && k !== undefined && k.length > 0) {
        keys.add(k);
      }
    }
    return Array.from(keys.values());
  }
  /**
   * 从磁盘中载入所有缓存项
   */
  private restore() {
    const items = new Map<string, ICacheItem<any>>();
    this.__keys(this.__storage).forEach(key => {
      if (this.__isMyCacheKey.test(key)) {
        const json = this.__storage.getItem(key);

        console.info(
          `${new Date().toLocaleString('zh-CN', {
            hour12: false,
          })} WebStorageCache#restore/json, json: ${json}`,
        );
        if (json) {
          try {
            items.set(key, JSON.parse(json));
          } catch (error) {
            console.error(
              `${new Date().toLocaleString('zh-CN', {
                hour12: false,
              })} WebStorageCache#restore: ${error}`,
            );
          }
        }
      }
    });
    this.__items = items;

    console.info(
      `${new Date().toLocaleString('zh-CN', {
        hour12: false,
      })} WebStorageCache#restore/items, items: ${JSON.stringify(
        Array.from(this.__items.values()),
      )}`,
    );
  }
  /**
   * 向磁盘写入缓存项更新，只更新/删除必要的缓存项
   * @remarks
   * 我们在构造函数中，重新绑定了这个函数
   */
  private __persist() {
    this.__removes.forEach(k => {
      this.__storage.removeItem(k);
    });
    this.__removes.clear();

    this.__updates.forEach(k => {
      this.__storage.setItem(k, JSON.stringify(this.__items.get(k)!));
    });
    this.__updates.clear();
    return;
  }
  private static __local: ICache | null = null;
  static localStorage() {
    if (WebStorageCache.__local) {
      return WebStorageCache.__local;
    }
    WebStorageCache.__local = new WebStorageCache(window.localStorage);
    return WebStorageCache.__local;
  }

  private static __session: ICache | null = null;
  static sessionStorage() {
    if (WebStorageCache.__session) {
      return WebStorageCache.__session;
    }
    WebStorageCache.__session = new WebStorageCache(window.sessionStorage);
    return WebStorageCache.__session;
  }
  constructor(storage: Storage = window.localStorage, cacheKeyPrefix = '_LDS_') {
    this.__cacheKeyPrefix = cacheKeyPrefix;
    this.__isMyCacheKey = new RegExp(`^${cacheKeyPrefix}(\\S+)$`, 'g');
    this.__storage = storage;
    this.restore();
  }
  get size() {
    return this.__items.size;
  }
  private __getCacheItemDescriptor(key: string) {
    return this.__descriptors.get(key) || DEFAULT_DESCRIPTOR;
  }
  async getItem<T = unknown>(k: string) {
    const key = this.__prependPrefix(k);
    const memCachedItem = this.__items.get(key);

    console.info(
      `${new Date().toLocaleString('zh-CN', {
        hour12: false,
      })} WebStorageCache: memCachedItem, key: ${key}\nvalue: ${
        memCachedItem ? JSON.stringify(memCachedItem) : 'null'
      }`,
    );
    if (memCachedItem) {
      return Promise.resolve(memCachedItem.value as T);
    }

    try {
      const json = this.__storage.getItem(key);
      if (json) {
        const storageCachedItem = JSON.parse(json);

        console.info(
          `${new Date().toLocaleString('zh-CN', {
            hour12: false,
          })} WebStorageCache: storageCachedItem, key: ${key}\nvalue: ${
            storageCachedItem ? JSON.stringify(storageCachedItem) : 'null'
          }`,
        );

        this.__items.set(key, storageCachedItem);
        return Promise.resolve(storageCachedItem.value as T);
      }
    } catch (error) {}

    return Promise.resolve(null);
  }
  private __prependPrefix(key: string) {
    return `${this.__cacheKeyPrefix}${key}`;
  }
  async setItem<T = unknown>(
    k: string,
    value: T,
    nextDescriptor: Partial<CacheItemDescriptor> = DEFAULT_DESCRIPTOR,
  ) {
    const key = this.__prependPrefix(k);

    this.defineCacheItem(key, nextDescriptor);

    const currentDescriptor = this.__getCacheItemDescriptor(key);
    if (currentDescriptor.writable) {
      this.__items.set(key, {
        createdAt: Date.now(),
        key,
        value,
      });
      this.__updates.add(key);
      this.__persist();
    }

    return Promise.resolve();
  }

  async removeItem(k: string) {
    const key = this.__prependPrefix(k);

    const currentDescriptor = this.__getCacheItemDescriptor(key);
    if (currentDescriptor.deletable) {
      this.__items.delete(key);
      this.__removes.add(key);
      this.__persist();
    }

    return Promise.resolve();
  }

  async clear() {
    const keys = new Set<string>([]);
    this.__items.forEach((v, k) => {
      const currentDescriptor = this.__getCacheItemDescriptor(k);
      if (currentDescriptor.deletable) {
        keys.add(k);
      }
    });
    keys.forEach(k => {
      this.__items.delete(k);
      this.__storage.removeItem(k);
    });
    return Promise.resolve();
  }
  defineCacheItem(k: string, nextDescriptor: Partial<CacheItemDescriptor>) {
    const key = this.__prependPrefix(k);
    const currentDescriptor = this.__descriptors.get(key);
    const { configurable = false, deletable = true, writable = true } = nextDescriptor;

    // 如果当前没有Descriptor，新增Descriptor
    if (!currentDescriptor) {
      this.__descriptors.set(key, {
        configurable,
        deletable,
        writable,
      });
      return;
    }

    // 如果当前已经有响应的Descriptor，尝试更新现有的Descriptor
    if (currentDescriptor.configurable) {
      this.__descriptors.set(key, {
        configurable,
        deletable,
        writable,
      });
    }
  }
}

class MemoryCache implements ICache {
  private items = new Map<string, ICacheItem<any>>();
  static create() {
    return new MemoryCache();
  }
  get size() {
    return this.items.size;
  }
  async getItem<T = unknown>(key: string) {
    const item = this.items.get(key);
    if (item) {
      return Promise.resolve(item.value as T);
    }
    return Promise.resolve(null);
  }

  async setItem<T = unknown>(key: string, value: T) {
    this.items.set(key, {
      createdAt: Date.now(),
      key,
      value,
    });
    return Promise.resolve();
  }

  async removeItem(key: string) {
    this.items.delete(key);
    return Promise.resolve();
  }

  async clear() {
    this.items.clear();
    return Promise.resolve();
  }
  defineCacheItem() {
    return;
  }
}

export { MemoryCache, WebStorageCache };
export type { ICache, ICacheItem };
