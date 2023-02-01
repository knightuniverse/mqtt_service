import { each, filter, isArray, isNil, isString } from "lodash";
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

import type { ClientOptions } from "./constants";
import { MqttEvent, MqttQoS } from "./constants";
import type { WorkerMessage } from "./shared_worker_constants";
import {
  SharedWorkerMessage,
  WorkerAction,
  WorkerFeedback,
} from "./shared_worker_constants";

/**
 * 初始化SharedWorker
 *
 * @see [Debugging Web Workers](https://lihautan.com/Debugging%20web%20workers/)
 *
 * @remarks
 *
 * 在Chrome打开以下链接进行调试：
 *
 * chrome://inspect/#workers
 *
 * @remarks
 *
 * 在我的设计中，
 *   一个Browser tab只有一个MqttService对象实例，
 *   MqttService会创建一个共享的SharedWorkerTransport，SharedWorkerTransport则会创建一个SharedWorker
 *
 * 依赖关系如下所示：
 *
 * BrowserTab -> MqttService -> SharedWorkerTransport -> SharedWorker
 *
 * 整个体系的逻辑结构如下：
 *
 *         |- BrowserTab -> MqttService -> SharedWorkerTransport -|
 * Browser |- BrowserTab -> MqttService -> SharedWorkerTransport -|-> SharedWorker
 *         |- BrowserTab -> MqttService -> SharedWorkerTransport -|
 *
 * 消息流如下：
 *
 *         |- BrowserTab <- MqttService <- SharedWorkerTransport <-|
 * Browser |- BrowserTab <- MqttService <- SharedWorkerTransport <-|-- SharedWorker（broadcast, sometimes unicast）
 *         |- BrowserTab <- MqttService <- SharedWorkerTransport <-|
 *
 * @param g
 */
function bootSharedWorker(g: SharedWorkerGlobalScope) {
  const ports = new Set<MessagePort>([]);

  const broadcast = (message: WorkerMessage) => {
    console.info(
      `${new Date().toLocaleString("zh-CN", {
        hour12: false,
      })} SharedWorker: broadcast feedback to ${
        ports.size
      } ports\n${JSON.stringify(message)}`
    );

    ports.forEach((port) => {
      port.postMessage(message);
    });
  };

  const unicast = (message: WorkerMessage, port: MessagePort) => {
    console.info(
      `${new Date().toLocaleString("zh-CN", {
        hour12: false,
      })} SharedWorker: unicast feedback to ${
        ports.size
      } ports\n  ${JSON.stringify(message)}`
    );
    port.postMessage(message);
  };

  const addActivatedPort = (port: MessagePort) => {
    ports.add(port);
  };

  const emptyPorts = () => {
    ports.clear();
  };

  const removeDeactivatedPort = (port: MessagePort) => {
    ports.delete(port);
  };

  let isMqttClientSettled = false;
  let isSettingUpMqttClient = false;
  let mqttClient: MqttClient | null = null;
  const subscribedTopics = new Set<string>([]);

  /**
   * 添加MQTT主题
   * @param ts
   */
  const addSubscribedTopics = (ts: string[]) => {
    each(ts, (t) => {
      subscribedTopics.add(t);
    });
  };

  /**
   * 删除MQTT主题
   * @param ts
   */
  const removeSubscribedTopics = (ts: string[]) => {
    each(ts, (t) => {
      subscribedTopics.delete(t);
    });
  };

  /**
   * 筛选出已订阅的主题
   * @param topic
   * @returns
   */
  const filterSubscribedTopics = (topic: string | string[]) => {
    let ts: string[] = [];
    if (isArray(topic)) {
      ts = filter(topic, (t) => subscribedTopics.has(t));
    }

    if (isString(topic) && subscribedTopics.has(topic)) {
      ts = [topic];
    }
    return ts;
  };

  /**
   * 筛选出未订阅的主题
   * @param topic
   * @returns
   */
  const filterUnsubscribedTopics = (topic: string | string[]) => {
    let ts: string[] = [];
    if (isArray(topic)) {
      ts = filter(topic, (t) => !subscribedTopics.has(t));
    }

    if (isString(topic) && !subscribedTopics.has(topic)) {
      ts = [topic];
    }
    return ts;
  };

  const constructMqttClient = (brokerUrl: string, opts: ClientOptions) => {
    const client = mqtt.connect(brokerUrl, opts);

    client.on(MqttEvent.Connect, (connack: IConnackPacket) => {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Connect`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {
            connack,
          },
          type: WorkerFeedback.MqttConnect,
        })
      );
    });
    client.on(MqttEvent.Reconnect, () => {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Reconnect`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerFeedback.MqttReconnect,
        })
      );
    });
    client.on(MqttEvent.Close, () => {
      console.warn(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Close`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerFeedback.MqttClose,
        })
      );
    });
    client.on(MqttEvent.Disconnect, (packet: IDisconnectPacket) => {
      console.warn(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Disconnect`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {
            packet,
          },
          type: WorkerFeedback.MqttDisconnect,
        })
      );
    });
    client.on(MqttEvent.Offline, () => {
      console.warn(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Offline`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerFeedback.MqttOffline,
        })
      );
    });
    client.on(MqttEvent.Error, (error: Error) => {
      console.error(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: ${error}`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerFeedback.MqttError,
        })
      );
    });
    client.on(MqttEvent.End, () => {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: End`
      );

      /**
       * 一旦Mqtt Client成功关闭了与Broker之间的连接，SharedWorker会广播WorkerFeedback.MqttEnd消息给所有的Browser Tabs。
       *
       * Browser Tabs需要根据情况进一步处理，有几种场景：
       *
       * 1. 用户主动登出（MqttService#quit）
       * 2. 用户token过期，强制登出（MqttService#forceQuit）
       *
       * 这些时候，需要主动跳转到Sign in页面
       */
      broadcast(
        SharedWorkerMessage.create({
          args: {},
          type: WorkerFeedback.MqttEnd,
        })
      );

      emptyPorts();

      isSettingUpMqttClient = false;
      isMqttClientSettled = false;
    });
    client.on(MqttEvent.Message, (topic, payload, packet) => {
      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker/MqttClient: Message\n  ${topic}\n  ${new TextDecoder().decode(
          payload
        )}`
      );

      broadcast(
        SharedWorkerMessage.create({
          args: {
            topic,
            payload,
            packet,
          },
          type: WorkerFeedback.MqttMessage,
        })
      );
    });
    return client;
  };

  /**
   * SharedWorkerTransport发送给SharedWorker的指令处理程序
   */
  const command: Record<string, any> = {
    /**
     * 初始化Mqtt客户端，连接Mqtt Broker
     *
     * @remarks
     *
     * 这里有一个值得注意的地方，就是并发问题。
     *
     * 在当前的设计当中，React层面有一个React组件叫做withMqttService（aka projects\platform\src\components\with_mqtt_service\index.tsx）。
     *
     * 当我们打开IMP-WEB其中一个页面，可能同时有2个以上的React UI组件，调用了withMqttService注入Mqtt的相关能力。这时候他们可能会同时发起WorkerAction.MqttConnect请求。
     *
     * 此处我使用了双重判断来解决并发的问题。
     *
     * @param args
     * @param port
     * @returns
     */
    [WorkerAction.MqttConnect]: (
      args: { brokerUrl: string; opts: ClientOptions },
      port: MessagePort
    ) => {
      if (isSettingUpMqttClient) {
        console.info(
          `${new Date().toLocaleString("zh-CN", {
            hour12: false,
          })} SharedWorker: is setting up mqtt client`
        );

        return;
      }

      if (isMqttClientSettled) {
        console.info(
          `${new Date().toLocaleString("zh-CN", {
            hour12: false,
          })} SharedWorker: mqtt client is settled`
        );

        unicast(
          SharedWorkerMessage.create({
            args: {
              connack: {
                cmd: "connack",
                returnCode: 0,
                reasonCode: 0,
                sessionPresent: false,
              },
            },
            type: WorkerFeedback.MqttConnect,
          }),
          port
        );

        return;
      }

      isSettingUpMqttClient = true;

      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker: call mqtt.connect to create a mqtt client`
      );

      const { brokerUrl, opts } = args;
      // FIXME Broker返回bad username or password，怎么处理？
      mqttClient = constructMqttClient(brokerUrl, opts);

      isSettingUpMqttClient = false;
      isMqttClientSettled = true;
    },

    /**
     * 关闭Mqtt Client连接
     *
     * @param args
     * @param port
     * @returns
     *
     * @remarks
     *
     * 以下场景会触发WorkerAction.MqttEnd事件：
     *
     * 1. 用户主动登出（MqttService#quit）
     * 2. 用户token过期，强制登出（MqttService#forceQuit）
     *
     * 一旦成功关闭连接，Mqtt Client会触发end事件，此时SharedWorker会广播WorkerFeedback.MqttEnd消息
     */
    [WorkerAction.MqttEnd]: (
      args: { force?: boolean; opts?: Object; cb?: CloseCallback },
      port: MessagePort
    ) => {
      if (mqttClient === null) {
        return;
      }

      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker: call mqtt.end to close this mqtt connection`
      );

      const { force, opts, cb } = args;
      mqttClient.end(force, opts, cb);
    },

    [WorkerAction.MqttPublish]: (
      args: {
        topic: string;
        message: string;
        opts: IClientPublishOptions;
        callback?: PacketCallback;
      },
      port: MessagePort
    ) => {
      if (mqttClient === null) {
        return;
      }

      const {
        topic,
        message,
        opts = {
          dup: false,
          qos: MqttQoS.AtLeastOnce,
          retain: false,
        },
        callback,
      } = args;
      mqttClient.publish(topic, message, opts, callback);
    },

    [WorkerAction.MqttReconnect]: (port: MessagePort) => {
      if (mqttClient === null) {
        return;
      }

      if (mqttClient.reconnecting) {
        return;
      }

      mqttClient.reconnect();
    },

    [WorkerAction.MqttSubscribe]: (
      args: {
        topic: string | string[];
        options: IClientSubscribeOptions;
      },
      port: MessagePort
    ) => {
      if (mqttClient === null) {
        return Promise.resolve([]);
      }

      return new Promise((resolve, reject) => {
        if (isNil(mqttClient)) {
          return resolve([]);
        }

        const { topic, options = { qos: MqttQoS.AtLeastOnce } } = args;

        const ts: string[] = filterUnsubscribedTopics(topic);
        if (ts.length === 0) {
          broadcast(
            SharedWorkerMessage.create({
              args: {
                granted: [],
              },
              type: WorkerFeedback.MqttSubscribeResolve,
            })
          );

          return resolve([]);
        }

        const callback: ClientSubscribeCallback = (error, granted) => {
          if (error) {
            broadcast(
              SharedWorkerMessage.create({
                args: {
                  error,
                },
                type: WorkerFeedback.MqttSubscribeReject,
              })
            );

            reject(error);
          } else {
            addSubscribedTopics(ts);

            broadcast(
              SharedWorkerMessage.create({
                args: {
                  granted,
                },
                type: WorkerFeedback.MqttSubscribeResolve,
              })
            );

            resolve(granted);
          }
        };

        mqttClient.subscribe(ts, options, callback);
      });
    },

    [WorkerAction.MqttUnsubscribe]: (
      args: {
        topic: string | string[];
        opts?: Object;
        callback?: PacketCallback;
      },
      port: MessagePort
    ) => {
      if (mqttClient === null) {
        return;
      }

      const { topic, opts, callback } = args;
      const ts: string[] = filterSubscribedTopics(topic);
      removeSubscribedTopics(ts);
      mqttClient?.unsubscribe(ts, opts, callback);
    },
  };

  /**
   * 调用new SharedWorker的时候，会触发SharedWorker#connect事件
   *
   * @param event
   */
  const handleConnect = (event: MessageEvent) => {
    const port = event.ports[0];

    addActivatedPort(port);

    const handlePortMessage = (ev: MessageEvent<WorkerMessage>) => {
      const cmd = ev.data;
      const args = cmd.args;
      const type = cmd.type;

      console.info(
        `${new Date().toLocaleString("zh-CN", {
          hour12: false,
        })} SharedWorker: receive command, type: ${type}, args: ${JSON.stringify(
          args
        )}`
      );

      if (type === WorkerAction.BeforeBrowserTabUnload) {
        removeDeactivatedPort(port);
        port.removeEventListener("message", handlePortMessage);
        port.close();
        return;
      }

      const execute = command[type];
      if (execute) {
        execute(args, port);
      }
    };

    port.addEventListener("message", handlePortMessage);
    port.start();
  };

  g.onconnect = handleConnect;
}

bootSharedWorker(self as SharedWorkerGlobalScope);
