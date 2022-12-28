interface ICache {
  readonly size: number;
  getItem: <T = unknown>(key: string) => Promise<T | null>;
  setItem: <T = unknown>(key: string, value: T) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  clear: () => Promise<void>;
}

interface ICacheItem<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly createdAt: number;
}

class WebStorageCache implements ICache {
  private bucket = '';
  private items = new Map<string, ICacheItem<any>>();
  private storage = window.localStorage;

  private restore() {
    const data = this.storage.getItem(this.bucket);
    this.items = new Map(data !== null ? JSON.parse(data) : []);
  }

  private persist() {
    setTimeout(() => {
      this.storage.setItem(this.bucket, JSON.stringify(Array.from(this.items.entries())));
    }, 5000);
  }

  static createLocalStorageCache(bucket: string = '__imp_web_cache__') {
    return new WebStorageCache(bucket, window.localStorage);
  }

  static createSessionStorageCache(bucket: string = '__imp_web_cache__') {
    return new WebStorageCache(bucket, window.sessionStorage);
  }

  constructor(bucket: string, storage: Storage = window.localStorage) {
    this.bucket = bucket;
    this.storage = storage;
    this.restore();
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
    this.persist();

    return Promise.resolve();
  }

  async removeItem(key: string) {
    this.items.delete(key);
    this.persist();

    return Promise.resolve();
  }

  async clear() {
    this.items.clear();
    this.storage.clear();

    return Promise.resolve();
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
}

export { MemoryCache, WebStorageCache };

export type { ICache, ICacheItem };
