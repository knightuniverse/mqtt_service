import { each, isArray, isFunction, isNil, isString } from "lodash";
import type {
  CloseCallback,
  IClientPublishOptions,
  IClientSubscribeOptions,
  IConnackPacket,
  IDisconnectPacket,
  ISubscriptionGrant,
  Packet,
  PacketCallback,
} from "mqtt";

import type { Callable, ClientOptions, ITransport } from "./constants";
import {
  GUEST_CLIENT_ID,
  MqttEvent,
  MqttQoS,
  TOPIC,
  TOPIC_HEADER,
  TOPIC_VERSION,
  TransportEvent,
} from "./constants";

import type { WorkerMessage } from "./shared_worker_constants";
import {
  SharedWorkerMessage,
  WorkerAction,
  WorkerFeedback,
} from "./shared_worker_constants";

class SharedWorkerTransport implements ITransport {
  private __connected = false;
  private __connection: { brokerUrl: string; opts: ClientOptions };
  private __initialized = false;
  private __initializing = false;
  private __listeners: Map</** Event */ string, /** Listener */ Set<Callable>> =
    new Map();
  private __mqttTopics = new Set<string>();
  private __reconnecting = false;
  private __sharedWorker: SharedWorker;
  private __handleReceivedFeedback: (
    event: MessageEvent<WorkerMessage>
  ) => void = () => {
    return;
  };
  private __handleBeforeWindowUnload = () => {
    return;
  };
  static create(connection: {
    brokerUrl: string;
    opts: ClientOptions;
  }): ITransport {
    return new SharedWorkerTransport(connection);
  }

  constructor(connection: { brokerUrl: string; opts: ClientOptions }) {
    this.__connection = connection;
    this.__handleReceivedFeedback = ((event: MessageEvent<WorkerMessage>) => {
      const digest: Record<string, any> = {
        [WorkerFeedback.MqttConnect]: (args: { connack: IConnackPacket }) => {
          this.__connected = true;
          this.__reconnecting = false;
          this.dispatchEvent(MqttEvent.Connect, [args.connack]);
        },

        [WorkerFeedback.MqttReconnect]: () => {
          this.__connected = false;
          this.__reconnecting = true;
          this.dispatchEvent(MqttEvent.Reconnect, []);
        },

        [WorkerFeedback.MqttClose]: () => {
          this.__connected = false;
          this.__reconnecting = false;
          this.dispatchEvent(MqttEvent.Close, []);
        },

        [WorkerFeedback.MqttDisconnect]: (args: {
          packet: IDisconnectPacket;
        }) => {
          this.__connected = false;
          this.__reconnecting = false;
          this.dispatchEvent(MqttEvent.Disconnect, [args.packet]);
        },

        [WorkerFeedback.MqttOffline]: () => {
          this.__connected = false;
          this.__reconnecting = false;
          this.dispatchEvent(MqttEvent.Offline, []);
        },

        [WorkerFeedback.MqttError]: (args: { error: Error }) => {
          this.dispatchEvent(MqttEvent.Error, [args.error]);
          this.end();
          this.dispose();
        },

        [WorkerFeedback.MqttEnd]: () => {
          this.__connected = false;
          this.__reconnecting = false;
          this.dispatchEvent(MqttEvent.End, []);
        },

        [WorkerFeedback.MqttMessage]: (args: {
          topic: string;
          payload: Buffer;
          packet: Packet;
        }) => {
          this.dispatchEvent(MqttEvent.Message, [
            args.topic,
            args.payload,
            args.packet,
          ]);
        },

        [WorkerFeedback.MqttSubscribeReject]: (args: { error: Error }) => {
          this.dispatchEvent(TransportEvent.SubscribeReject, [args.error]);
        },

        [WorkerFeedback.MqttSubscribeResolve]: (args: {
          granted: ISubscriptionGrant[];
        }) => {
          this.dispatchEvent(TransportEvent.SubscribeResolve, [args.granted]);
        },
      };

      const feedback = event.data;
      const args = feedback.args;
      const type = feedback.type;
      const run = digest[type];
      if (run) {
        run(args);
      }
    }).bind(this);

    /** 用户直接关闭浏览器标签的时候触发 */
    this.__handleBeforeWindowUnload = (() => {
      this.__sharedWorker.port.postMessage(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerAction.BeforeBrowserTabUnload,
        })
      );
      this.__sharedWorker.port.removeEventListener(
        "message",
        this.__handleReceivedFeedback
      );
      this.__sharedWorker.port.close();
    }).bind(this);

    this.__sharedWorker = new SharedWorker(
      /* webpackChunkName: "transport-shared-worker" */ new URL(
        "./worker.ts",
        import.meta.url
      ),
      {
        name: `ClientID: ${connection.opts.clientId}`,
      }
    );
  }

  get brokerUrl() {
    return this.__connection.brokerUrl;
  }

  get clientId() {
    return this.__connection.opts.clientId;
  }

  get connected() {
    return this.__connected;
  }

  get isGuest() {
    return this.__connection.opts.clientId === GUEST_CLIENT_ID;
  }

  get opts() {
    return this.__connection.opts;
  }

  get reconnecting() {
    return this.__reconnecting;
  }

  get topics() {
    return Array.from(this.__mqttTopics.values());
  }

  addEventListener(event: MqttEvent | TransportEvent, callable: Callable) {
    const handlers = this.__listeners.get(event) || new Set();
    handlers.add(callable);
    this.__listeners.set(event, handlers);
  }

  connect() {
    if (this.__initialized || this.__initializing) {
      return;
    }

    this.__initializing = true;

    this.__sharedWorker.port.addEventListener(
      "message",
      this.__handleReceivedFeedback
    );
    this.__sharedWorker.port.start();
    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {
          brokerUrl: this.__connection.brokerUrl,
          opts: this.__connection.opts,
        },
        type: WorkerAction.MqttConnect,
      })
    );
    window.addEventListener("beforeunload", this.__handleBeforeWindowUnload);

    this.__initializing = false;
    this.__initialized = true;
  }

  dispose() {
    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {},
        type: WorkerAction.BeforeBrowserTabUnload,
      })
    );
    this.__sharedWorker.port.removeEventListener(
      "message",
      this.__handleReceivedFeedback
    );
    this.__sharedWorker.port.close();
    window.removeEventListener("beforeunload", this.__handleBeforeWindowUnload);

    this.__initialized = false;
    this.__initializing = false;
  }

  dispatchEvent(event: MqttEvent | TransportEvent, args: any[]) {
    const handlers = this.__listeners.get(event) || new Set();
    handlers.forEach((callable) => {
      callable.func.apply(callable.thisArg, args);
    });
  }

  /**
   * 关闭MQTT Client和Broker之间的链接
   * @remarks
   * 因为存在多个Browser Tab复用同一个SharedWorker的情况，因此调用了end方法后，Mqtt Client不一定立刻断开链接。
   * 具体关闭Mqtt Client的时间是，调用end方法的Browser Tab是最后一个链接到SharedWorker的Browser Tab。
   */
  end(force?: boolean, opts?: Object, cb?: CloseCallback) {
    if (isFunction(cb)) {
      cb();
    }

    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {
          force,
          opts,
        },
        type: WorkerAction.MqttEnd,
      })
    );
  }

  /**
   * 根据Mqtt Topic，获得关注的业务
   *
   * @param mqttTopic
   * @returns
   *
   * @example
   *
   * const topic = 'iot/v1/c/923aed8850694291b7cd4f76f47571bc/layout_device/status';
   * const subject = getSubject(topic); // layout_device/status
   */
  getSubject(
    /**
     * Mqtt topic，e.g iot/v1/c/923aed8850694291b7cd4f76f47571bc/layout_device/status
     */
    mqttTopic: string
  ): string | null {
    const reg = new RegExp(
      `${TOPIC_HEADER}\\/${TOPIC_VERSION}\\/c\\/${this.clientId}\\/(\\S+)`
    );
    const match = reg.exec(mqttTopic);
    return isNil(match) ? null : match[1];
  }

  getTopic(
    /**
     * 业务主题，e.g layout_device/status
     */
    subject: string
  ) {
    return `${TOPIC.CLIENT}/${this.clientId}/${subject}`;
  }

  publish(
    topic: string,
    message: string,
    opts: IClientPublishOptions = {
      dup: false,
      qos: MqttQoS.AtLeastOnce,
      retain: false,
    },
    callback?: PacketCallback
  ) {
    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {
          topic,
          message,
          opts,
          callback,
        },
        type: WorkerAction.MqttPublish,
      })
    );
  }

  reconnect() {
    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {},
        type: WorkerAction.MqttReconnect,
      })
    );
  }

  removeEventListener(event: MqttEvent | TransportEvent, callable?: Callable) {
    if (isNil(callable)) {
      this.__listeners.delete(event);
      return;
    }

    const handlers = this.__listeners.get(event) || new Set();
    if (handlers.has(callable)) {
      handlers.delete(callable);
      this.__listeners.set(event, handlers);
    }
  }

  subscribe(
    topic: string | string[],
    options: IClientSubscribeOptions = { qos: MqttQoS.AtLeastOnce }
  ) {
    if (isString(topic)) {
      this.__mqttTopics.add(topic);
    }

    if (isArray(topic)) {
      each(topic, (t) => {
        this.__mqttTopics.add(t);
      });
    }

    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {
          topic,
          options,
        },
        type: WorkerAction.MqttSubscribe,
      })
    );
  }

  unsubscribe(
    topic: string | string[],
    opts?: Object,
    callback?: PacketCallback
  ) {
    if (isString(topic)) {
      this.__mqttTopics.delete(topic);
    }

    if (isArray(topic)) {
      each(topic, (t) => {
        this.__mqttTopics.delete(t);
      });
    }

    this.__sharedWorker.port.postMessage(
      SharedWorkerMessage.create({
        args: {
          topic,
          opts,
          callback,
        },
        type: WorkerAction.MqttUnsubscribe,
      })
    );
  }
}

export { SharedWorkerTransport };
