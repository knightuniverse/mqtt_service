import { each, isNil } from "lodash";

import type { IMSTDependence } from "@platform/core/infra";
import { DRAFT_ID, PREFIX_HASH } from "@platform/core/infra";

import type { Callable } from "./constants";
import {
  GUEST_CLIENT_ID,
  KnownMqttEvents,
  MqttEvent,
  MqttQoS,
  TOPIC,
} from "./constants";
import type { ClientOptions, Transport } from "./transport";
import { MqttTransport } from "./transport";
import { formatDate, getSeq } from "./utils";
import {
  DRAFT_MQTT_SERVICE_WORKER_ID,
  MqttServiceWorker,
  uniqueWorkerId,
} from "./worker";

const dummyTransport = MqttTransport.create({
  brokerUrl: "",
  opts: {
    clientId: GUEST_CLIENT_ID,
    password: "",
  },
});

const dummyWorker = {
  id: DRAFT_MQTT_SERVICE_WORKER_ID,
  transport: dummyTransport,
};

function getWindowPathPrefix(isTrimLine = false) {
  // platform 平台基座应用，不加前缀
  const prefix = window.PATH_PREFIX === "platform" ? "" : window.PATH_PREFIX;
  const pathPrefix = prefix && `/${prefix}`;
  return isTrimLine ? prefix : pathPrefix;
}

/**
 * MqttService状态
 *
 * @remarks
 *
 * 状态转换如下
 *
 * **MqttService.init()**
 *
 * __MqttServiceState.Created
 *   -> __MqttServiceState.Initializing
 *     -> __MqttServiceState.Running
 *
 * **MqttService.suspend()**
 *
 * __MqttServiceState.Running
 *   -> __MqttServiceState.Suspending
 *     -> __MqttServiceState.Suspended
 *
 * **MqttService.resume()**
 *
 * __MqttServiceState.Suspended
 *   -> __MqttServiceState.Resuming
 *     -> __MqttServiceState.Running
 *
 * **MqttService.exit()**
 *
 * __MqttServiceState.Running
 *   -> __MqttServiceState.Stopping
 *     -> __MqttServiceState.Created
 *
 * **MqttService.kill()**
 *
 * __MqttServiceState.Running
 *   -> __MqttServiceState.Stopping
 *     -> __MqttServiceState.Created
 */
enum MqttServiceState {
  Created,
  Initializing,
  Resuming,
  Suspending,
  Stopping,
  Suspended,
  Running,
}

/**
 * MqttService，单例模式，负责Mqtt组件的初始化，包含一个全局共享的Transport，
 *
 * @example
 *
 * import { MqttService } from '@platform/core/infra';
 *
 * const mqttService = MqttService.create(
 *   {},
 *   {
 *     cache,
 *     api,
 *     api2,
 *   },
 * );
 * I.registerSingleton<MqttService>(IocInstanceType.MqttService, mqttService);
 *
 * @example
 *
 * import { MqttEvent, useMqttService } from "@platform/core/infra";
 *
 * async function _createWorker() {
 *   const mqttService = useMqttService();
 *   const transport = await mqttService.createTransport();
 *   const worker = mqttService.createWorker(transport);
 *
 *   const listeners = new Map([
 *     [
 *       MqttEvent.Connect,
 *       new Set([
 *         {
 *           thisArg: worker,
 *           func: (...args) => {
 *             // worker && transport is ready
 *
 *             // mqtt topic u would like to subscribe, but please remember, we have to append some prefix at the head of your topic
 *             const yourTopic = transport.getTopic("#");
 *
 *             // could call transport.subscribe so you could receive mqtt message from mqtt broker
 *             transport.subscribe(yourTopic);
 *           },
 *         },
 *       ]),
 *     ],
 *   ]);
 *
 *   listeners.forEach((callable, event) => {
 *     callable.forEach((c) => {
 *       worker.addEventListener(event, c);
 *     });
 *   });
 *
 *   worker.transport.connect();
 *
 *   return worker;
 * }
 *
 * @example
 *
 * import { useEffect, useRef } from "react";
 * import { isEmpty, isEqual } from "lodash";
 *
 * import type { MqttAbility } from "@platform/components/with_mqtt_service";
 * import {
 *   transformTopic,
 *   withMqttService,
 * } from "@platform/components/with_mqtt_service";
 * import { IMP_WEB_SUBJECT } from "@platform/core/infra";
 *
 * type _YourPageProps = MqttAbility & {
 *   // your props here
 * };
 *
 * // please remember message is different from subject to subject
 * type TMqttMessage = {
 *   alarmState: number;
 *   deviceId: string;
 *   properties: Record<string, any>;
 *   spaceFilterCode: string;
 *   status: string;
 *   topic: string;
 * };
 *
 * const yourSubject = IMP_WEB_SUBJECT.LAYOUT_DEVICE_STATUS;
 *
 * function _YourPage(props: _YourPageProps) {
 *   const {
 *     isMqttInited = false,
 *     mqttJSON,
 *     notifySubOrUnSubToEndApi = () => void 0,
 *   } = props;
 *
 *   const mqttRef = useRef<TMqttMessage>();
 *
 *   useEffect(() => {
 *     if (!notifySubOrUnSubToEndApi || !isMqttInited) {
 *       return;
 *     }
 *
 *     notifySubOrUnSubToEndApi(true, {
 *       topic: yourSubject,
 *       bid: "", // your bid here
 *     });
 *   }, [notifySubOrUnSubToEndApi, isMqttInited]);
 *
 *   useEffect(() => {
 *     const reduxStateName = transformTopic(yourSubject);
 *     const { payload } = (mqttJSON || {})[reduxStateName] || {};
 *
 *     if (isEmpty(payload)) {
 *       return;
 *     }
 *
 *     if (isEqual(payload, mqttRef.current)) {
 *       return;
 *     }
 *
 *     mqttRef.current = payload;
 *
 *     console.log("🚀 layout - mqtt推送", payload);
 *   }, [mqttJSON]);
 *
 *   return <div>your react ui component here</div>;
 * }
 *
 * const YourPage = withMqttService({
 *   topics: [
 *     // for example
 *     yourSubject,
 *   ],
 *   isConnectMqtt: false,
 * })(_YourPage);
 *
 * export default YourPage;
 *
 * @remarks
 *
 * 1. 初始化
 *   - 在t800.tsx进行初始化，分别在 未登录/登录 的情况下注入实例
 *
 * 2. 调用killMqttService退出
 *   - projects\platform\src\utils\index.ts#logoutEffect， 用户主动注销登录
 *   - projects\platform\src\utils\api.js#code === 600057， 用户token过期
 *   - projects\platform\src\t800.tsx#code === 600057， 用户token过期
 */
class MqttService {
  private __builtInListeners = new Map<
    /** Event */ MqttEvent,
    /** Listener */ Set<Callable>
  >();
  private __extraListeners = new Map<
    /** Event */ MqttEvent,
    /** Listener */ Set<Callable>
  >();
  private __listeners = new Map<
    /** Event */ MqttEvent,
    /** Listener */ Set<Callable>
  >();
  private __sharedTransport = dummyTransport as Transport;
  private __env: IMSTDependence;
  private __workers = new Set<MqttServiceWorker>();
  private __state = MqttServiceState.Created;

  private __id = DRAFT_ID;

  static create(
    sn: {
      id?: string;
    },
    env: IMSTDependence
  ) {
    return new MqttService(sn, env);
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

    this.__builtInListeners.set(
      MqttEvent.Connect,
      new Set([
        {
          thisArg: this,
          func: () => {
            /**
             * 订阅调用{@link fetClientId} 获得的clientId下的所有话题
             *
             * @returns
             * @see [Understanding MQTT Topics & Wildcards by Case](https://www.emqx.com/en/blog/advanced-features-of-mqtt-topics)
             */
            const subscribeAllMqttTopics4ThisClientId = async () => {
              try {
                if (this.isGuest) {
                  return;
                }

                const transport = this.__sharedTransport;
                /**
                 * @see [Understanding MQTT Topics & Wildcards by Case](https://www.emqx.com/en/blog/advanced-features-of-mqtt-topics)
                 *
                 * **Do wildcard subscriptions degrade performance?**
                 *
                 * When routing messages to wildcard subscriptions,
                 *   the broker may require more resources than non-wildcard topics.
                 *   It is a wise choice if the wildcard subscription can be avoided.
                 *
                 * This very much depends on how the data schema is modeled for the MQTT message payload.
                 *
                 * For example,
                 *   if a publisher publishes to device-id/stream1/foo and device-id/stream1/bar and the subscriber needs to subscribe to both,
                 *   then it may subscribe device-id/stream1/#.
                 *   A better alternative is perhaps to push the foo and bar part of the namespace down to the payload,
                 *   so it publishes to only one topic device-id/stream1,
                 *   and the subscriber just subscribes to this one topic.
                 */
                await transport.subscribe(transport.getTopic("#"));
              } catch (error) {
                console.error("MqttService boot error", error);
              } finally {
                this.__state = MqttServiceState.Running;
              }
            };

            subscribeAllMqttTopics4ThisClientId();
          },
        },
      ])
    );

    // TODO 此处不仅仅包含了Socket（TCP/IP网络层的那个Socket）的错误，也有Mqtt packet解析错误等异常
    // TODO 接下来我们需要做的是，处理各种情况下的error，保持mqtt连接能正常工作
    // TODO 断开过长时间，API会把mqtt topic关闭，这时候需要重新fetchClientId，重新subscribe
    // this.__builtInListeners.set(
    //   MqttEvent.Error,
    //   new Set([
    //     {
    //       thisArg: this,
    //       func: (...args) => {
    //         const [error] = args;

    //         const routines = {
    //           [MqttError.ECONNREFUSED]: (e: any) => {
    //             console.error('MqttService error', e);
    //           },
    //           [MqttError.EADDRINUSE]: (e: any) => {
    //             console.error('MqttService error', e);
    //           },
    //           [MqttError.ECONNRESET]: (e: any) => {
    //             console.error('MqttService error', e);
    //           },
    //           [MqttError.ENOTFOUND]: (e: any) => {
    //             console.error('MqttService error', e);
    //           },
    //           [MqttError.ETIMEDOUT]: (e: any) => {
    //             console.error('MqttService error', e);
    //           },
    //         };
    //         // error.code可能是null 或者 undefined
    //         const routine = routines[error.code];
    //         if (!isFunction(routine)) {
    //           console.error('MqttService error', error);
    //           return;
    //         }

    //         routine(error);
    //       },
    //     },
    //   ]),
    // );
  }

  get dummyWorker() {
    return new MqttServiceWorker(dummyWorker, this.__env);
  }

  get isGuest() {
    return this.__id === DRAFT_ID;
  }

  get isReady() {
    return this.__state === MqttServiceState.Running;
  }

  get state() {
    return this.__state;
  }

  addEventListener(event: MqttEvent, callable: Callable) {
    const handlers = this.__extraListeners.get(event) || new Set();
    handlers.add(callable);
    this.__extraListeners.set(event, handlers);
  }

  createTransport() {
    if (this.isGuest) {
      return Promise.resolve(dummyTransport);
    }

    return new Promise<Transport>(async (resolve, reject) => {
      const { cache } = this.__env;

      const clientId = await this.fetClientId();
      const mqttPassword = await cache.getItem<string>("mqttPassword");
      const token = await cache.getItem<string>("token");

      if (isNil(token)) {
        return reject(new Error("Guest is forbidden"));
      }

      if (isNil(mqttPassword)) {
        return reject(new Error("Mqtt password is required"));
      }

      const brokerUrl = await this.getBrokerUrl();
      const opts = this.getClientOptions({
        clientId,
        password: mqttPassword,
        token,
      });

      resolve(
        MqttTransport.create({
          brokerUrl,
          opts,
        })
      );
    });
  }

  createWorker(transport?: Transport) {
    if (this.isGuest) {
      return new MqttServiceWorker(dummyWorker, this.__env);
    }

    const worker = !isNil(transport)
      ? MqttServiceWorker.create(
          {
            id: uniqueWorkerId(),
            transport: transport,
          },
          this.__env
        )
      : MqttServiceWorker.create(
          {
            id: uniqueWorkerId(),
            transport: this.__sharedTransport,
          },
          this.__env
        );

    this.__workers.add(worker);

    return worker;
  }

  /**
   * 结束MqttService
   *
   * @remarks
   *
   * 遍历调用MqttService持有的worker的unwatch方法，通知API取消关注相关的业务，注销所有事件处理程序
   */
  async exit() {
    if (this.__state < MqttServiceState.Running) {
      return;
    }

    this.__state = MqttServiceState.Stopping;

    // dispose all workers
    await Promise.all(
      Array.from(this.__workers.values()).map((worker) => worker.exit())
    );

    this.__workers.forEach((w) => {
      if (w.transport !== this.__sharedTransport) {
        w.transport.end(true);
      }
    });
    this.__workers.clear();
    this.__listeners.forEach((cs, e) => {
      cs.forEach((c) => {
        this.__sharedTransport.removeEventListener(e, c);
      });
    });
    this.__builtInListeners.clear();
    this.__extraListeners.clear();
    this.__sharedTransport.end(true);

    this.__state = MqttServiceState.Created;
  }

  /**
   * 获取clientId，这是Mqtt连接必须的参数
   *
   * @remarks
   *
   * Client ID由API生成，之所以这么设计师因为，有不少系统通知，是由API生成，并且推送到MQTT Broker。如果没有对应的Client ID，API无法把对应的消息推送给客户端。
   */
  async fetClientId() {
    const { api, cache } = this.__env;

    const uuid = await cache.getItem<string>("mqttUuid");
    const mqttPwd = await cache.getItem<string>("mqttPassword");
    const type = !getWindowPathPrefix() ? "base-page" : "sub-page";
    const { data } = await api.get<string>(
      "/v2/client/getClientId",
      {
        uuid,
        mqttPwd,
        type,
      },
      {
        apiChange: PREFIX_HASH.building,
        isCatch: false,
      }
    );

    return data;
  }

  /**
   * 获取Mqtt Broker地址
   *
   * @returns Mqtt Broker地址，例如：wss://testimpmqtt.lexikos.com:8443/mqtt
   */
  async getBrokerUrl() {
    const { cache } = this.__env;
    const host = await cache.getItem<string>("mqttHost");
    const protocol = await cache.getItem<string>("mqttHostProtocol");
    return `${protocol}://${host}/mqtt`;
  }

  /**
   *
   * 创建MqttClient配置
   * @param customized
   * @returns
   */
  getClientOptions(customized: {
    /** ClientId */
    clientId: string;
    /** Mqtt Password */
    password: string;
    token: string;
  }) {
    const { clientId, password, token } = customized;

    const options: ClientOptions = {
      wsOptions: {}, // 只适用于WebSocket连接配置
      keepalive: 60, // 心跳间隔，秒
      reschedulePings: true, // 发送包后重新安排ping消息
      clientId,
      protocolId: "MQTT",
      protocolVersion: 4, // MQTT 3.1.1 版本
      clean: true, // 注意：只能是true，设置为false，以便在脱机时接收QoS 1和2消息，Broker服务器不支持false，否则提示错误 Error: Connection refused: Server unavailable
      reconnectPeriod: 5000, // 重连间隔, 毫秒
      connectTimeout: 6000, // 连接超时，毫秒
      username: clientId,
      password,
      // incomingStore ？？？
      // outgoingStore ？？？
      // queueQoSZero: true, // 如果连接断开，QoS为0的消息xxx？？？
      // customHandleAcks // MQTT 5.0
      // properties // MQTT 5.0
      // authPacket ？？？
      // transformWsUrl: (url, options, client) => url, // 只适用于ws/wss，可用于实现重新连接时可能已过期的签名url
      // resubscribe: true, // 如果连接断开并重新连接，订阅的主题将自动再次订阅

      // TODO 这边好像有点问题
      // 遗言，重连后会发送
      will: {
        topic: `${TOPIC.BROADCAST}/${clientId}/user/disconnect`,
        qos: MqttQoS.AtLeastOnce,
        // retain: 1, // 保留标志
        // properties MQTT 5.0
        // 注意：只能传string
        payload: JSON.stringify({
          service: "user",
          method: "disconnect",
          seq: getSeq(),
          srcAddr: `0.${clientId}`,
          clientId,
          payload: {
            timestamp: formatDate(new Date()),
            uniqueMsgId: 0,
            token: token.split(".")[2], // 遗言给api用
          },
        }),
      },
    };

    return options;
  }

  /**
   * 初始化MqttService，创建共享的{@link Transport}
   * @returns
   */
  async init() {
    if (this.isGuest) {
      return;
    }
    if (this.__state !== MqttServiceState.Created) {
      return;
    }
    console.log("MqttService init");

    this.__state = MqttServiceState.Initializing;

    const sharedTransport = await this.createTransport();
    this.__sharedTransport = sharedTransport;

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
      this.__sharedTransport.addEventListener(evt, callable);
    });
    this.__sharedTransport.connect();
  }

  /**
   * 强制结束，注销所有{@link MqttServiceWorker}，以及{@link MqttServiceWorker}关联的事件处理程序，断开所有Mqtt连接
   *
   * @remarks
   *
   * kill方法并不会调用MqttServiceWorker#unwatch方法通知API取消关注IMP-Web的业务
   */
  kill() {
    if (this.__state < MqttServiceState.Running) {
      return;
    }
    console.log("MqttService kill");

    this.__state = MqttServiceState.Stopping;
    this.__workers.forEach((w) => {
      if (w.transport === this.__sharedTransport) {
        return each(KnownMqttEvents, (evt) => w.removeEventListener(evt));
      }

      w.transport.end(false, {}, () => {
        each(KnownMqttEvents, (evt) => w.removeEventListener(evt));
      });
    });
    this.__workers.clear();
    this.__sharedTransport.end(false, {}, () => {
      each(KnownMqttEvents, (evt) => this.removeEventListener(evt));

      this.__state = MqttServiceState.Created;
    });
  }

  /**
   * 恢复运行，重连所有Mqtt连接
   */
  resume() {
    if (this.__state < MqttServiceState.Suspended) {
      return;
    }
    if (this.__state === MqttServiceState.Running) {
      return;
    }
    console.log("MqttService resume");

    this.__state = MqttServiceState.Resuming;
    this.__workers.forEach((w) => {
      if (w.transport === this.__sharedTransport) {
        return;
      }
      w.transport.reconnect();
    });
    this.__sharedTransport.reconnect();
    this.__state = MqttServiceState.Running;
  }

  removeEventListener(event: MqttEvent, callable?: Callable) {
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

  async removeWorker(worker: MqttServiceWorker) {
    await worker.exit();
    this.__workers.delete(worker);
  }

  /**
   * 挂起，暂时中断Mqtt连接
   */
  suspend() {
    if (this.__state <= MqttServiceState.Suspended) {
      return;
    }
    console.log("MqttService suspend");

    this.__state = MqttServiceState.Suspending;
    this.__workers.forEach((w) => {
      if (w.transport === this.__sharedTransport) {
        return;
      }

      w.transport.end();
    });
    this.__sharedTransport.end();
    this.__state = MqttServiceState.Suspended;
  }
}

export { MqttService, MqttServiceState };
