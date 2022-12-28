/**
 * 用于生成最终的Mqtt Topic
 *
 * @private
 */
const TOPIC_HEADER = "iot";

/**
 * 用于生成最终的Mqtt Topic
 *
 * @private
 */
const TOPIC_VERSION = "v1";

/**
 * 用于生成最终的Mqtt Topic
 *
 * @private
 */
const TOPIC = {
  CLIENT: `${TOPIC_HEADER}/${TOPIC_VERSION}/c`,
  SERVER: `${TOPIC_HEADER}/${TOPIC_VERSION}/s`,
  BROADCAST: `${TOPIC_HEADER}/${TOPIC_VERSION}/cb`,
};

/**
 * 默认情况下，Transport的Client ID
 *
 * @remarks
 *
 * 用户未登录/用户登出/登录过期的情况下，
 *   MqttService无法调用API获取Client Id，
 *   此时前端使用该ID构造一个默认情况下的Transport实例
 *
 * @private
 */
const GUEST_CLIENT_ID = "e9d4012e-3156-4f7c-8d73-022989fb2634";

/**
 * Mqtt支持的事件
 */
enum MqttEvent {
  Connect = "connect",
  Reconnect = "reconnect",
  Close = "close",
  Disconnect = "disconnect",
  Offline = "offline",
  Error = "error",
  /**
   * Emitted when mqtt.Client#end() is called. If a callback was passed to mqtt.Client#end(), this event is emitted once the callback returns.
   */
  End = "end",
  Message = "message",
  PacketSend = "packetsend",
  PacketReceive = "packetreceive",
}

/**
 * MQTT QoS Levels
 *
 * @see [Understanding MQTT QOS Levels- Part 1](http://www.steves-internet-guide.com/understanding-mqtt-qos-levels-part-1/)
 */
enum MqttQoS {
  /** QoS 0 – Once (not guaranteed) */
  Once = 0,
  /** QoS 1 – At Least Once (guaranteed) */
  AtLeastOnce = 1,
  /** QoS 2 – Only Once (guaranteed) */
  OnlyOnce = 2,
}

/**
 * 所有的IMPWeb Mqtt可关注的业务，其中有部分不需要bid
 */
const SUBJECT = {
  LOG_DETAIL: "log/detail", // 明细记录日志结果推送
};

/**
 * 所有的IMPWeb Mqtt可关注的业务，不需要bid的业务
 */
const SUBJECT_THAT_NEEDS_NO_BID = new Set<string>([]);

/**
 * 所有已知的Mqtt事件
 */
const KnownMqttEvents = [
  MqttEvent.Connect,
  MqttEvent.Reconnect,
  MqttEvent.Close,
  MqttEvent.Disconnect,
  MqttEvent.Offline,
  MqttEvent.Error,
  MqttEvent.End,
  MqttEvent.Message,
  MqttEvent.PacketSend,
  MqttEvent.PacketReceive,
];

type Callable = {
  /**
   * 在 func 函数运行时使用的 this 值。请注意，this 可能不是该方法看到的实际值：如果这个函数处于非严格模式下，则指定为 null 或 undefined 时会自动替换为指向全局对象，原始值会被包装。
   */
  thisArg: any;
  func: (
    /**
     * argsArray，一个数组或者类数组对象，其中的数组元素将作为单独的参数传给 func 函数。如果该参数的值为 null 或 undefined，则表示不需要传入任何参数。从 ECMAScript 5 开始可以使用类数组对象。浏览器兼容性请参阅本文底部内容。
     */
    ...args: any[]
  ) => void;
};

type MqttPayload = {
  clientId: string;
  method: string;
  payload: Record<string, any>;
  service: string;
  srcAddr: string;
};

export {
  GUEST_CLIENT_ID,
  KnownMqttEvents,
  MqttEvent,
  MqttQoS,
  MqttPayload,
  TOPIC,
  TOPIC_HEADER,
  TOPIC_VERSION,
  SUBJECT as IMP_WEB_SUBJECT,
  SUBJECT_THAT_NEEDS_NO_BID as IMP_WEB_SUBJECT_THAT_NEEDS_NO_BID,
};
export type { Callable };
