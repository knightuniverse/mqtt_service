import type {
  CloseCallback,
  IClientOptions,
  IClientPublishOptions,
  IClientSubscribeOptions,
  PacketCallback,
} from "mqtt";

import type { Business } from "./business";

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
 * @see [TLS 详解握手流程](https://juejin.cn/post/6895624327896432654)
 * @see [connect](https://man7.org/linux/man-pages/man2/connect.2.html)
 * @see [HTTP、TCP与UDP、Socket与Websocket之间的联系与区别](https://segmentfault.com/a/1190000037620675)
 * @see [Reason code](https://www.emqx.com/en/blog/mqtt5-new-features-reason-code-and-ack)
 */
enum MqttSocketError {
  ECONNREFUSED = "ECONNREFUSED",
  EADDRINUSE = "EADDRINUSE",
  ECONNRESET = "ECONNRESET",
  ENOTFOUND = "ENOTFOUND",
  ETIMEDOUT = "ETIMEDOUT",
}

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

enum TransportEvent {
  SubscribeReject = "SubscribeReject",
  SubscribeResolve = "SubscribeResolve",
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
const IMP_WEB_SUBJECT = {
  All_DEFAULT: "global/all", // 前端专用，主要为了解决全局订阅没有权限，导致初始化连接问题
  CENTER_DEVICE: "center/device", // 设备状态通知
  SAS_SCREEN: "sas/screen", // SAS大屏人脸推送
  FAULT_RECORD: "fault/record", // 设备故障告警弹窗
  ALARM_RECORD: "alarm/record", // 系统自定义告警
  PARKING_PLACE_GATE_STATUS: "parkingPlace/gateStatus", // 闸口实时监控推送
  LOG_MAIN: "log/main", // 主记录日志结果推送
  LOG_DETAIL: "log/detail", // 明细记录日志结果推送
  PERSON_MONITOR_RECORDS: "person/monitor/records", // 安防布控未处理记录
  ACTION_CALLBACK_DEVICE: "actionCallback/device", // 方法回调
  SPACE_DEVICE_STATUS: "space_device/status", // 空间设备状态主题
  LAYOUT_DEVICE_STATUS: "layout_device/status", // layout下所有设备状态主题
  RENAME_DEVICE_TOPIC: "connect/renameDevice", // 编辑设备名称主题
  CLAZZROOM_STATISTICS_GRADE_QUEUE: "clazzroom/statistics/grade", // 文明校园 -- 今日数据
  CLAZZROOM_STATISTICS_CLAZZ_QUEUE: "clazzroom/statistics/clazz", // 文明校园 -- 班级视频
  SYSTEM_MESSAGE_NOTIFY: "notify/systemMessage", // 全局消息通知
  UNREAD_MESSAGE_NUM_NOTIFY: "notify/requestUnreadNum", // 接收mqtt，请求更新未读消息数
  SAS_HOME_ALARM: "sas/home/alarm", // 安全校园首页，告警变化
  DATA_CENTER_ENERGY_AUDIT_SPACE: "dataCenter/energyAuditSpace", // 能耗诊断---诊断过程
  DATA_CENTER_ENERGY_AUDIT: "dataCenter/energyAudit", // 能耗诊断--整个诊断状态变化
  DATA_CENTER_LOW_CARBON_OPEN_TASK: "dataCenter/lowCarbonOpenTask", // 节能模式--整个状态的变化
  DATA_CENTER_LOW_CARBON_OPEN_SPACE: "dataCenter/lowCarbonOpenSpace", // 节能模式--开启的列表变化,
  SAS_DATA_OVERVIEW_VENUE: "sas/data/overview/venue", // 安全校园-场馆预约-数据总览,
  TOPIC_TRAFFIC_IMP: "traffic/imp", // 校车出行 - 行车监控
  SYNC_TASK: "sync/task",
};

/**
 * 所有的IMPWeb Mqtt可关注的业务，不需要bid的业务
 */
const IMP_WEB_SUBJECT_THAT_NEEDS_NO_BID = new Set<string>([]);

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

type ClientOptions = IClientOptions & {
  clientId: string;
  password: string;
};

/**
 * Transport接口，规定了Transport要实现的属性和方法
 *
 * @remarks
 *
 * 这样做的好处是，我们的service以及worker依赖的是抽象的接口，目前的实现是MqttTransport，后面我们完善可以使用SharedWorker实现另一套Transport
 *
 * @see [Run websocket in web worker or service worker - javascript](https://stackoverflow.com/questions/61865890/run-websocket-in-web-worker-or-service-worker-javascript)
 */
interface ITransport {
  readonly brokerUrl: string;
  readonly clientId: string;
  readonly connected: boolean;
  readonly isGuest: boolean;
  readonly reconnecting: boolean;
  readonly topics: string[];
  addEventListener: (
    event: MqttEvent | TransportEvent,
    callable: Callable
  ) => void;
  connect: () => void;
  dispose: () => void;
  dispatchEvent: (event: MqttEvent | TransportEvent, args: any[]) => void;
  end: (force?: boolean, opts?: Object, cb?: CloseCallback) => void;
  getSubject: (mqttTopic: string) => string | null;
  getTopic: (subject: string) => string;
  /**
   * @remarks
   *
   * 在我编写这一版本的Mqtt模块的时候，publish这个功能基本上没用，不确定后续是否会用上
   */
  publish: (
    topic: string,
    message: string,
    opts?: IClientPublishOptions,
    callback?: PacketCallback
  ) => void;
  reconnect: () => void;
  removeEventListener: (
    event: MqttEvent | TransportEvent,
    callable?: Callable
  ) => void;
  subscribe: (
    topic: string | string[],
    options?: IClientSubscribeOptions
  ) => void;
  unsubscribe: (
    topic: string | string[],
    opts?: Object,
    callback?: PacketCallback
  ) => void;
}

interface IMqttServiceWorker {
  readonly connected: boolean;
  readonly follows: Business[];
  readonly id: string;
  readonly isGuest: boolean;
  readonly messages: Map<string, MqttPayload>;
  readonly reconnecting: boolean;
  readonly transport: ITransport;
  addEventListener: (
    event: MqttEvent | TransportEvent,
    callable: Callable
  ) => void;
  forceQuit: () => Promise<void>;
  quit: () => Promise<void>;
  getBusiness: (id: string) => Business | undefined;
  isWatching: (f: Business) => boolean;
  letApiKnowIAmInterested: (f: Business) => Promise<void>;
  letApiKnowIAmNotInterested: (f: Business) => Promise<void>;
  removeEventListener: (
    event: MqttEvent | TransportEvent,
    callable?: Callable
  ) => void;
  send: () => void;
  unwatch: (f: Business) => Promise<void>;
  watch: (f: Business) => Promise<void>;
}

interface IMqttService {
  readonly dummyWorker: any;
  readonly isGuest: boolean;
  readonly isReady: boolean;
  readonly state: MqttServiceState;
  readonly suspendWhenBrowserTabHidden: boolean;
  addEventListener: (
    event: MqttEvent | TransportEvent,
    callable: Callable
  ) => void;
  createTransport: () => Promise<ITransport>;
  createWorker: (transport?: ITransport) => IMqttServiceWorker;
  quit: () => Promise<void>;
  getClientId: () => Promise<string>;
  getBrokerUrl: () => Promise<string>;
  getClientOptions: (customized: {
    clientId: string;
    password: string;
    token: string;
  }) => ClientOptions;
  init: () => Promise<void>;
  forceQuit: () => Promise<void>;
  resume: () => void;
  removeEventListener: (
    event: MqttEvent | TransportEvent,
    callable?: Callable
  ) => void;
  removeWorker: (worker: IMqttServiceWorker) => Promise<void>;
  removeWorkers: () => Promise<void>;
  suspend: () => void;
}

type TransportBuilder = {
  /**
   * 浏览器页面处于hidden的情况下，也就是：
   * const isDocumentVisible = document.visibilityState === 'visible';
   * 是否结束当前Mqtt链接，以减轻Broker服务端压力
   */
  suspendWhenBrowserTabHidden: boolean;
  /**
   * 是否共享同一个Mqtt client id
   *
   * @remarks
   *
   * - 如果使用的是经典的MqttTransport，那么多个browser tab，每一个tab都应该调用去获取各自的client id
   * - 如果使用的是SharedWorkerTransport，那么多个browser tab，连接的都是同一个SharedWorkerTransport，因此共享同一个client id
   */
  useSharedClientId: boolean;
  /**
   * 构造Transport
   */
  build: (connection: { brokerUrl: string; opts: ClientOptions }) => ITransport;
  /**
   * 构建完Transport之后的回调函数
   */
  postBuild: (service: IMqttService, transport: ITransport) => void;
};

const CK_MQTT_PASSWORD = "mqttPassword";
const CK_ACCESS_TOKEN = "token";
const CK_MQTT_CLIENT_ID = "clientId";
const CK_MQTT_UUID = "mqttUuid";
const CK_MQTT_HOST = "mqttHost";
const CK_MQTT_HOST_PROTOCOL = "mqttHostProtocol";
const CK_WATCHED_BUSINESS_PREFIX = "mqttWatchedBiz_";

export {
  CK_ACCESS_TOKEN,
  CK_MQTT_CLIENT_ID,
  CK_MQTT_HOST,
  CK_MQTT_HOST_PROTOCOL,
  CK_MQTT_PASSWORD,
  CK_MQTT_UUID,
  CK_WATCHED_BUSINESS_PREFIX,
  GUEST_CLIENT_ID,
  KnownMqttEvents,
  MqttSocketError,
  MqttEvent,
  MqttQoS,
  MqttPayload,
  MqttServiceState,
  TOPIC,
  TOPIC_HEADER,
  TOPIC_VERSION,
  TransportEvent,
  IMP_WEB_SUBJECT,
  IMP_WEB_SUBJECT_THAT_NEEDS_NO_BID,
};
export type {
  Callable,
  ClientOptions,
  ITransport,
  TransportBuilder,
  IMqttService,
  IMqttServiceWorker,
};
