import { each, isNil, uniqueId } from "lodash";
import type { Packet } from "mqtt";

import type { IMSTDependence } from "@platform/core/infra";
import { PREFIX_HASH } from "@platform/core/infra";

import type { Business } from "./business";
import type {
  Callable,
  IMqttServiceWorker,
  ITransport,
  MqttPayload,
  TransportEvent,
} from "./constants";
import { KnownMqttEvents, MqttEvent, TOPIC } from "./constants";
import type { BusinessReferenceManager } from "./reference_manager";

type PBusiness = {
  /**
   * 业务id
   */
  bid: number | string;
  clientId: string;
  topic: string;
};

/**
 * 生成{@link MqttServiceWorker}实例的唯一ID
 *
 * @param prefix ID前缀，默认值：MqttServiceWorker_
 * @returns
 */
function uniqueWorkerId(prefix = "MqttServiceWorker_") {
  return uniqueId(prefix);
}

/**
 * MqttServiceWorker默认ID
 * @private
 */
const DRAFT_MQTT_SERVICE_WORKER_ID = "69b153e9-241d-4467-bb20-f048f29843db";

/**
 * MqttServiceWorker，负责Mqtt消息的发送，以及在接收到Mqtt消息后，消息的处理
 *
 * @remarks
 *
 * 在实际应用场景中，每个React组件都会由{@link MqttService}分配一个MqttServiceWorker实例。
 *   MqttServiceWorker实例之间可以共享由{@link MqttService}提供的共享的{@link ITransport}，
 *   也可以实例化另外一个独享的{@link ITransport}实例，并在构建实例的时候作为参数传给MqttServiceWorker。
 */
class MqttServiceWorker implements IMqttServiceWorker {
  private __id = DRAFT_MQTT_SERVICE_WORKER_ID;
  private __env: IMSTDependence;
  private __follows = new Map<string, Business>();
  private __followApiAwareness = new Map<string, boolean>();
  private __followMessageDigest = new Map<
    /* Follow ID */ string,
    /* Follow Message Digest */ (
      topic: string,
      payload: Buffer,
      packet: Packet
    ) => void
  >();
  private __followMessages = new Map<
    /* Follow ID */ string,
    /* Follow Message */ MqttPayload
  >();
  private __builtInListeners = new Map<
    /** Event */ MqttEvent | TransportEvent,
    /** Listener */ Set<Callable>
  >();
  private __extraListeners = new Map<
    /** Event */ MqttEvent | TransportEvent,
    /** Listener */ Set<Callable>
  >();
  private __listeners = new Map<
    /** Event */ MqttEvent | TransportEvent,
    /** Listener */ Set<Callable>
  >();
  private __businessReferenceManager: BusinessReferenceManager;
  private __transport: ITransport;

  static create(
    sn: {
      id: string;
      referenceManager: BusinessReferenceManager;
      transport: ITransport;
    },
    env: IMSTDependence
  ) {
    return new MqttServiceWorker(sn, env);
  }
  constructor(
    sn: {
      id: string;
      referenceManager: BusinessReferenceManager;
      transport: ITransport;
    },
    env: IMSTDependence
  ) {
    const { id, referenceManager, transport } = sn;

    this.__env = env;
    this.__id = id;
    this.__businessReferenceManager = referenceManager;
    this.__transport = transport;

    this.__builtInListeners.set(
      MqttEvent.Message,
      new Set([
        {
          thisArg: this,
          func: (...args) => {
            const [topic, payload, packet] = args as [string, Buffer, Packet];
            this.__followMessageDigest.forEach((digest, followId) => {
              const f = this.__follows.get(followId);
              /**
               * isMyMessage有一个严重的潜在缺陷，就是它只根据subject进行判断。这个问题是老问题了，项目跑了好几年，都没发现这个BUG，只是凑巧暂时没有出现BUG相关的场景。
               *
               * !!ATTENTION!!
               *
               * 我通过BusinessReferenceManager解决了这个问题。
               *
               * !!ATTENTION!!
               *
               * 有这么一种场景：
               *
               * Page A:
               *   Component AA
               *   Component BB
               *   Component CC
               *
               * 其中，AA和BB都关注了同一个subject的Business，他们的bid可能相同或者不同。
               *
               * **bid相同**
               *
               * 如果AA从UI上移除，此时与AA组件绑定的MqttServiceWorker会调用unwatch方法，通知API取消关注业务反馈，并且通知MqttService回收和AA组件绑定的MqttServiceWorker。
               * 此时由于API不再推送相关业务的消息，BB组件就会受到影响。
               *
               * **bid不同**
               *
               * 这个时候Broker推送的消息，AA和BB都会接收到，因为无法根据bid进行区分是不是属于自己的消息。
               */
              const isMyMessage =
                !isNil(f) && this.__transport.getTopic(f.subject) === topic;
              if (!isMyMessage) {
                return;
              }

              digest(topic, payload, packet);
            });
          },
        },
      ])
    );

    each(KnownMqttEvents, (evt) => {
      const callable: Callable = {
        thisArg: this,
        func: (...args) => {
          (this.__builtInListeners.get(evt) || new Set()).forEach((c) => {
            c.func.apply(c.thisArg, args);
          });

          (this.__extraListeners.get(evt) || new Set()).forEach((c) => {
            c.func.apply(c.thisArg, args);
          });
        },
      };
      this.__listeners.set(evt, new Set([callable]));
      this.__transport.addEventListener(evt, callable);
    });
  }

  get connected() {
    if (isNil(this.__transport)) {
      return false;
    }
    return this.__transport.connected;
  }

  get follows() {
    return Array.from(this.__follows.values());
  }

  get id() {
    return this.__id;
  }

  get isGuest() {
    return this.__id === DRAFT_MQTT_SERVICE_WORKER_ID;
  }

  get messages() {
    return this.__followMessages;
  }

  get reconnecting() {
    if (isNil(this.__transport)) {
      return false;
    }
    return this.__transport.reconnecting;
  }

  get transport() {
    return this.__transport;
  }

  /**
   * 发起订阅通知
   */
  private async __letApiKnowIAmInterested(data: PBusiness) {
    const { api } = this.__env;
    await api.post<boolean>("/v2/client/notify/sub", data, {
      apiChange: PREFIX_HASH.building,
      isCatch: false,
    });
  }

  /**
   * 取消订阅通知
   */
  private async __letApiKnowIAmNotInterested(data: PBusiness) {
    const { api } = this.__env;
    await api.post<boolean>("/v2/client/notify/unsub", data, {
      apiChange: PREFIX_HASH.building,
      isCatch: false,
    });
  }

  addEventListener(event: MqttEvent | TransportEvent, callable: Callable) {
    const handlers = this.__extraListeners.get(event) || new Set();
    handlers.add(callable);
    this.__extraListeners.set(event, handlers);
  }

  async forceQuit() {
    await Promise.all(
      Array.from(this.__follows.values()).map((f) =>
        this.__businessReferenceManager.release(f)
      )
    );

    this.__follows.clear();
    this.__followMessageDigest.clear();
    this.__listeners.forEach((cs, e) => {
      cs.forEach((c) => {
        this.__transport.removeEventListener(e, c);
      });
    });
    this.__builtInListeners.clear();
    this.__extraListeners.clear();
  }

  /**
   * 退出Worker
   *
   * @remarks
   *
   * 调用{@link __letApiKnowIAmNotInterested}通知API取消关注IMP业务，注销所有事件处理程序
   */
  async quit() {
    await Promise.all(
      Array.from(this.__follows.values()).map((f) => this.unwatch(f))
    );

    this.__follows.clear();
    this.__followMessageDigest.clear();
    this.__listeners.forEach((cs, e) => {
      cs.forEach((c) => {
        this.__transport.removeEventListener(e, c);
      });
    });
    this.__builtInListeners.clear();
    this.__extraListeners.clear();
  }

  getBusiness(id: string) {
    return this.__follows.get(id);
  }

  isWatching(f: Business) {
    return this.__follows.has(f.id);
  }

  /**
   * 发起订阅通知
   */
  async letApiKnowIAmInterested(f: Business) {
    if (this.isGuest) {
      return;
    }

    const { bid, subject } = f;
    if (isNil(bid)) {
      return;
    }
    await this.__letApiKnowIAmInterested({
      bid: bid,
      topic: [TOPIC.CLIENT, "uuid", subject].join("/"),
      clientId: this.__transport.clientId,
    });
  }

  /**
   * 取消订阅通知
   */
  async letApiKnowIAmNotInterested(f: Business) {
    if (this.isGuest) {
      return;
    }

    const { bid, subject } = f;
    if (isNil(bid)) {
      return;
    }
    await this.__letApiKnowIAmNotInterested({
      bid: bid,
      topic: [TOPIC.CLIENT, "uuid", subject].join("/"),
      clientId: this.__transport.clientId,
    });
  }

  removeEventListener(event: MqttEvent | TransportEvent, callable?: Callable) {
    if (isNil(callable)) {
      this.__extraListeners.delete(event);
      return;
    }

    const handlers = this.__extraListeners.get(event) || new Set();
    if (handlers.has(callable)) {
      handlers.delete(callable);
      this.__extraListeners.set(event, handlers);
    }
  }

  // TODO 发送消息，目前暂时没有相关场景
  send() {}

  /**
   * 取消关注IMP-WEB业务
   *
   * @param business IMP-WEB业务
   */
  async unwatch(f: Business) {
    if (this.isGuest) {
      return;
    }

    if (!this.__follows.has(f.id)) {
      return;
    }

    const bid = f.bid;
    const subject = f.subject;
    const needsToLetApiKnowIAMNotInterested = !isNil(bid);

    if (needsToLetApiKnowIAMNotInterested) {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} MqttServiceWorker/__businessReferenceManager: release business: ${
          f.id
        }`
      );

      const ref = await this.__businessReferenceManager.release(f);
      if (ref === 0) {
        await this.__letApiKnowIAmNotInterested({
          topic: [TOPIC.CLIENT, "uuid", subject].join("/"),
          clientId: this.__transport.clientId,
          bid,
        });
        this.__followApiAwareness.set(f.id, false);
      }
    }

    this.__follows.delete(f.id);
    this.__followMessages.delete(f.id);
    this.__followMessageDigest.delete(f.id);
  }

  /**
   * 关注IMP-WEB业务
   *
   * @param business IMP-WEB业务
   */
  async watch(f: Business) {
    if (this.isGuest) {
      return;
    }

    const subject = f.subject;
    const bid = f.bid;
    const isWatching = this.__follows.has(f.id);
    const isApiAware = this.__followApiAwareness.get(f.id) === true;
    const needsToLetApiKnowIAMInterested = !isNil(bid);

    if (isWatching && !needsToLetApiKnowIAMInterested) {
      return;
    }

    if (isWatching && needsToLetApiKnowIAMInterested && isApiAware) {
      return;
    }

    if (needsToLetApiKnowIAMInterested) {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} MqttServiceWorker/__businessReferenceManager: collect business: ${
          f.id
        }`
      );

      const ref = await this.__businessReferenceManager.collect(f);
      /**
       * 确保只有第一次watch同样的主题的时候，才会去调用API推送相关的消息
       */
      if (ref === 1 && !isApiAware) {
        await this.__letApiKnowIAmInterested({
          bid: bid,
          topic: [TOPIC.CLIENT, "uuid", subject].join("/"),
          clientId: this.__transport.clientId,
        });
      }
    }

    this.__follows.set(f.id, f);
    this.__followMessageDigest.set(
      f.id,
      (topic: string, payload: Buffer, packet: Packet) => {
        const text = new TextDecoder().decode(payload);
        const message = JSON.parse(text) as MqttPayload;

        console.info(
          `${new Date().toLocaleString("zh-CN", {
            hour12: false,
          })} MqttServiceWorker: receive message \n  ${text}`
        );

        this.__followMessages.set(f.id, message);
      }
    );
  }
}

export { DRAFT_MQTT_SERVICE_WORKER_ID, MqttServiceWorker, uniqueWorkerId };
