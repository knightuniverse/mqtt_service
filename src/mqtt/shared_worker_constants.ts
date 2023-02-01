/**
 * Browser Tab发送给SharedWorker的指令类型
 */
enum WorkerAction {
  /** 发起Mqtt Client与Broker之间的连接 */
  MqttConnect = "MqttConnect",
  /** 关闭Mqtt Client与Broker之间的连接 */
  MqttEnd = "MqttEnd",
  /** 发布消息 */
  MqttPublish = "MqttPublish",
  /** 发起Mqtt Client与Broker之间的重连 */
  MqttReconnect = "MqttReconnect",
  /** 发起Mqtt主题订阅 */
  MqttSubscribe = "MqttSubscribe",
  /** 取消Mqtt主题订阅 */
  MqttUnsubscribe = "MqttUnsubscribe",
  /** 有时候用户会选择直接关闭Browser tab，在那之前，我们需要做一些资源回收的操作 */
  BeforeBrowserTabUnload = "BeforeBrowserTabUnload",
}

/**
 * SharedWorker广播给各Browser Tab的消息类型
 */
enum WorkerFeedback {
  MqttConnect = "MqttConnect",
  MqttReconnect = "MqttReconnect",
  MqttClose = "MqttClose",
  MqttDisconnect = "MqttDisconnect",
  MqttOffline = "MqttOffline",
  MqttError = "MqttError",
  MqttEnd = "MqttEnd",
  MqttMessage = "MqttMessage",
  MqttSubscribeReject = "MqttSubscribeReject",
  MqttSubscribeResolve = "MqttSubscribeResolve",
}

/**
 * SharedWorker消息，适用于Browser Tab发送给SharedWorker的指令消息，以及SharedWorker发送给Browser Tab的反馈消息
 */
type WorkerMessage<T = any> = {
  args: T;
  type: WorkerAction | WorkerFeedback;
};

class SharedWorkerMessage {
  static create(sn: WorkerMessage) {
    return sn;
  }
}

export { SharedWorkerMessage, WorkerAction, WorkerFeedback };
export type { WorkerMessage };
