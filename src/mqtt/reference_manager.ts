import type { IMSTDependence } from "@platform/core/infra";
import { DRAFT_ID } from "@platform/core/infra";

import type { Business } from "./business";
import { CK_WATCHED_BUSINESS_PREFIX } from "./constants";

type Reference = {
  /**
   * 引用数量
   */
  reference: number;
  /**
   * 版本，我们通过版本来解决不同Browser Tab之间的冲突
   */
  version: number;
};

type ReferenceStore = Record</* Follow ID */ string, Reference>;

/**
 * 用于管理业务主题的引用次数，如果一个业务的引用次数为0，调用API通知服务端不要推送相关业务的消息
 *
 * @remarks
 *
 * 当前MQTT的设计当中，支持两种模式，分别是：
 *
 * - Classical
 * - SharedWorker
 *
 * 但是不论时哪一种情况下，都会有这么一个场景：
 *
 * Browser
 *   |-BrowserTab
 *     |-Frame(aka projects\platform\src\components\Layout\frame\frame.tsx)
 *       |-Page A
 *         |-Component AA
 *         |-Component BB
 *         |-Component CC
 *
 * BrowserTab持有全局单例的MqttService实例，每个Component AA则会由MqttService分配自己专享的MqttServiceWorker。
 *
 * AA和BB都关注了同一个subject的Business，他们的bid可能相同或者不同。
 *
 * **bid相同**
 *
 * 如果AA从UI上移除，此时与AA组件绑定的MqttServiceWorker调用unwatch方法，通知API取消关注业务反馈，并且通知MqttService回收和AA组件绑定的MqttServiceWorker。
 * 此时由于API不再推送相关业务的消息，BB组件就会受到影响。
 *
 * **bid不同**
 *
 * 这个时候Broker推送的消息，AA和BB都会接收到，因为无法根据bid进行区分是不是属于自己的消息。
 *
 * 我们必须决定什么样的时机，可以调用API，通知服务端不必再推送相关的消息。这个时机，就是当subject|bid构成的business对象引用数量为0的时候。
 *
 * BusinessReferenceManager就是干这个工作的。
 */
class BusinessReferenceManager {
  private __env: IMSTDependence;
  private __id = DRAFT_ID;
  private __store: ReferenceStore = {};
  static create(
    sn: {
      id?: string;
    },
    env: IMSTDependence
  ) {
    return new BusinessReferenceManager(sn, env);
  }
  constructor(
    sn: {
      id?: string;
    },
    env: IMSTDependence
  ) {
    const id = sn.id || DRAFT_ID;
    this.__env = env;
    this.__id = id;
  }
  get id() {
    return this.__id;
  }

  private __getCacheKey(followId: string) {
    return `${CK_WATCHED_BUSINESS_PREFIX}${followId}`;
  }
  async collect(f: Business) {
    const { cache } = this.__env;

    const cacheKey = this.__getCacheKey(f.id);
    const cachedItem = await cache.getItem<Reference>(cacheKey);
    const theirs = cachedItem || {
      reference: 0,
      version: 0,
    };
    const ours = this.__store[f.id] || {
      reference: 0,
      version: 0,
    };
    const eventually = ours.version >= theirs.version ? ours : theirs;

    console.info(
      `${new Date().toLocaleString("zh-CN", {
        hour12: false,
      })} BusinessReferenceManager#collect: ours\n${JSON.stringify(
        ours
      )}\ntheirs${JSON.stringify(theirs)}`
    );

    eventually.reference = eventually.reference + 1;
    eventually.version = eventually.version + 1;

    await cache.setItem(cacheKey, eventually);

    this.__store[f.id] = eventually;

    return eventually.reference;
  }
  getReference(f: Business) {
    const ref = this.__store[f.id] || {
      reference: 0,
      version: 0,
    };
    return ref.reference;
  }
  async release(f: Business) {
    const { cache } = this.__env;
    const cacheKey = this.__getCacheKey(f.id);
    const cachedItem = await cache.getItem<Reference>(cacheKey);
    const theirs = cachedItem || {
      reference: 0,
      version: 0,
    };
    const ours = this.__store[f.id] || {
      reference: 0,
      version: 0,
    };
    const eventually = ours.version >= theirs.version ? ours : theirs;

    eventually.reference = Math.max(eventually.reference - 1, 0);
    eventually.version = eventually.version + 1;

    if (eventually.reference === 0) {
      await cache.removeItem(cacheKey);
    } else {
      await cache.setItem(cacheKey, eventually);
    }

    this.__store[f.id] = eventually;

    return eventually.reference;
  }
  async empty() {
    // TODO
  }
}

export { BusinessReferenceManager };
