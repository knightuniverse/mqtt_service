import { each, isArray, isNil, isString } from "lodash";
import type {
  ClientSubscribeCallback,
  CloseCallback,
  IClientPublishOptions,
  IClientSubscribeOptions,
  IConnackPacket,
  IDisconnectPacket,
  MqttClient,
  PacketCallback,
} from "mqtt";
import mqtt from "mqtt";

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

/**
 * Transport Based on Mqtt
 * @remarks
 * Transport类的职责是通道，
 *   Transport只会用来收发消息，
 *   消息的准备、处理由上层应用通过事件机制来决定。
 * @see [Understanding MQTT Topics & Wildcards by Case](https://www.emqx.com/en/blog/advanced-features-of-mqtt-topics)
 * @see [Reason code](https://www.emqx.com/en/blog/mqtt5-new-features-reason-code-and-ack)
 */
class ClassicalTransport implements ITransport {
  private __connection: { brokerUrl: string; opts: ClientOptions };
  private __listeners: Map</** Event */ string, /** Listener */ Set<Callable>> =
    new Map();
  private __mqttClient: MqttClient | null = null;
  private __mqttTopics = new Set<string>();

  static create(connection: {
    brokerUrl: string;
    opts: ClientOptions;
  }): ITransport {
    return new ClassicalTransport(connection);
  }

  constructor(connection: { brokerUrl: string; opts: ClientOptions }) {
    this.__connection = connection;
  }

  get brokerUrl() {
    return this.__connection.brokerUrl;
  }

  get clientId() {
    return this.__connection.opts.clientId;
  }

  get connected() {
    if (isNil(this.__mqttClient)) {
      return false;
    }
    return this.__mqttClient.connected;
  }

  get isGuest() {
    return this.__connection.opts.clientId === GUEST_CLIENT_ID;
  }

  get opts() {
    return this.__connection.opts;
  }

  get reconnecting() {
    if (isNil(this.__mqttClient)) {
      return false;
    }
    return this.__mqttClient.reconnecting;
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
    if (!isNil(this.__mqttClient)) {
      return;
    }

    const { brokerUrl, opts } = this.__connection;

    // TODO Broker返回bad username or password，怎么处理？

    const client = mqtt.connect(brokerUrl, opts);
    client.on(MqttEvent.Connect, (connack: IConnackPacket) => {
      console.info("Transport connect");
      this.dispatchEvent(MqttEvent.Connect, [connack]);
    });
    client.on(MqttEvent.Reconnect, () => {
      console.info("Transport reconnect");
      this.dispatchEvent(MqttEvent.Reconnect, []);
    });
    client.on(MqttEvent.Close, () => {
      console.info("Transport close");
      this.dispatchEvent(MqttEvent.Close, []);
    });
    client.on(MqttEvent.Disconnect, (packet: IDisconnectPacket) => {
      console.warn("Transport disconnect");
      this.dispatchEvent(MqttEvent.Disconnect, [packet]);
    });
    client.on(MqttEvent.Offline, () => {
      console.warn("Transport offline");
      this.dispatchEvent(MqttEvent.Offline, []);
    });
    client.on(MqttEvent.Error, (error: Error) => {
      console.error("Transport error", error);
      this.dispatchEvent(MqttEvent.Error, [error]);
      this.end();
      this.dispose();
    });
    client.on(MqttEvent.End, () => {
      console.info("Transport end");
      this.dispatchEvent(MqttEvent.End, []);
    });
    client.on(MqttEvent.Message, (topic, message, packet) => {
      this.dispatchEvent(MqttEvent.Message, [topic, message, packet]);
    });
    this.__mqttClient = client;
  }

  dispose() {
    this.__listeners.clear();
  }

  dispatchEvent(event: MqttEvent | TransportEvent, args: any[]) {
    const handlers = this.__listeners.get(event) || new Set();
    handlers.forEach((callable) => {
      callable.func.apply(callable.thisArg, args);
    });
  }

  end(force?: boolean, opts?: Object, cb?: CloseCallback) {
    if (isNil(this.__mqttClient)) {
      return;
    }

    if (this.isGuest) {
      return;
    }

    this.__mqttClient.end(force, opts, cb);
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
    if (isNil(this.__mqttClient)) {
      return;
    }

    this.__mqttClient.publish(topic, message, opts, callback);
  }

  /**
   * Connect again using the same options as connect()
   * @returns
   */
  reconnect() {
    if (isNil(this.__mqttClient)) {
      return;
    }

    return this.__mqttClient.reconnect();
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

  /**
   * 订阅MQTT Topic
   * @param topic MQTT Topic
   * @param options MQTT配置
   * @returns
   */
  subscribe(
    topic: string | string[],
    options: IClientSubscribeOptions = { qos: MqttQoS.AtLeastOnce }
  ) {
    // TODO dispatchEvent when subscribe error/success
    return new Promise((resolve, reject) => {
      if (isNil(this.__mqttClient)) {
        return resolve([]);
      }

      if (isString(topic)) {
        this.__mqttTopics.add(topic);
      }

      if (isArray(topic)) {
        each(topic, (t) => {
          this.__mqttTopics.add(t);
        });
      }

      const callback: ClientSubscribeCallback = (error, granted) => {
        if (error) {
          this.dispatchEvent(TransportEvent.SubscribeReject, [error]);
          reject(error);
        } else {
          this.dispatchEvent(TransportEvent.SubscribeResolve, [granted]);
          resolve(granted);
        }
      };

      this.__mqttClient.subscribe(topic, options, callback);
    });
  }

  unsubscribe(
    topic: string | string[],
    opts?: Object,
    callback?: PacketCallback
  ) {
    if (isNil(this.__mqttClient)) {
      return;
    }

    if (isString(topic)) {
      this.__mqttTopics.delete(topic);
    }

    if (isArray(topic)) {
      each(topic, (t) => {
        this.__mqttTopics.delete(t);
      });
    }

    this.__mqttClient?.unsubscribe(topic, opts, callback);
  }
}

export { ClassicalTransport };
