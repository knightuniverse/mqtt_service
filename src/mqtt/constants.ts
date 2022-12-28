/*
 * @Author: Milo
 * @Date: 2022-12-26 13:38:56
 * Copyright © Leedarson. All rights reserved.
 */

/**
 * 用于生成最终的Mqtt Topic
 *
 * @private
 */
const TOPIC_HEADER = 'iot';

/**
 * 用于生成最终的Mqtt Topic
 *
 * @private
 */
const TOPIC_VERSION = 'v1';

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
const GUEST_CLIENT_ID = 'e9d4012e-3156-4f7c-8d73-022989fb2634';

/**
 * Mqtt支持的事件
 */
enum MqttEvent {
  Connect = 'connect',
  Reconnect = 'reconnect',
  Close = 'close',
  Disconnect = 'disconnect',
  Offline = 'offline',
  Error = 'error',
  /**
   * Emitted when mqtt.Client#end() is called. If a callback was passed to mqtt.Client#end(), this event is emitted once the callback returns.
   */
  End = 'end',
  Message = 'message',
  PacketSend = 'packetsend',
  PacketReceive = 'packetreceive',
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
  All_DEFAULT: 'global/all', // 前端专用，主要为了解决全局订阅没有权限，导致初始化连接问题
  CENTER_DEVICE: 'center/device', // 设备状态通知
  SAS_SCREEN: 'sas/screen', // SAS大屏人脸推送
  FAULT_RECORD: 'fault/record', // 设备故障告警弹窗
  ALARM_RECORD: 'alarm/record', // 系统自定义告警
  PARKING_PLACE_GATE_STATUS: 'parkingPlace/gateStatus', // 闸口实时监控推送
  LOG_MAIN: 'log/main', // 主记录日志结果推送
  LOG_DETAIL: 'log/detail', // 明细记录日志结果推送
  PERSON_MONITOR_RECORDS: 'person/monitor/records', // 安防布控未处理记录
  ACTION_CALLBACK_DEVICE: 'actionCallback/device', // 方法回调
  SPACE_DEVICE_STATUS: 'space_device/status', // 空间设备状态主题
  LAYOUT_DEVICE_STATUS: 'layout_device/status', // layout下所有设备状态主题
  RENAME_DEVICE_TOPIC: 'connect/renameDevice', // 编辑设备名称主题
  CLAZZROOM_STATISTICS_GRADE_QUEUE: 'clazzroom/statistics/grade', // 文明校园 -- 今日数据
  CLAZZROOM_STATISTICS_CLAZZ_QUEUE: 'clazzroom/statistics/clazz', // 文明校园 -- 班级视频
  SYSTEM_MESSAGE_NOTIFY: 'notify/systemMessage', // 全局消息通知
  UNREAD_MESSAGE_NUM_NOTIFY: 'notify/requestUnreadNum', // 接收mqtt，请求更新未读消息数
  SAS_HOME_ALARM: 'sas/home/alarm', // 安全校园首页，告警变化
  DATA_CENTER_ENERGY_AUDIT_SPACE: 'dataCenter/energyAuditSpace', // 能耗诊断---诊断过程
  DATA_CENTER_ENERGY_AUDIT: 'dataCenter/energyAudit', // 能耗诊断--整个诊断状态变化
  DATA_CENTER_LOW_CARBON_OPEN_TASK: 'dataCenter/lowCarbonOpenTask', // 节能模式--整个状态的变化
  DATA_CENTER_LOW_CARBON_OPEN_SPACE: 'dataCenter/lowCarbonOpenSpace', // 节能模式--开启的列表变化,
  SAS_DATA_OVERVIEW_VENUE: 'sas/data/overview/venue', // 安全校园-场馆预约-数据总览,
  TOPIC_TRAFFIC_IMP: 'traffic/imp', // 校车出行 - 行车监控
  SYNC_TASK: 'sync/task',
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
  IMP_WEB_SUBJECT,
  IMP_WEB_SUBJECT_THAT_NEEDS_NO_BID,
};
export type { Callable };
