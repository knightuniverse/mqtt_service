// 兼容层，主要的目标是实现上一代Mqtt组件在系统中大范围使用的函数、变量的兼容

import { isEqual } from "lodash";

import { IMP_WEB_SUBJECT } from "./constants";

/**
 * 举个例子
 * {
 *     "LOG_DETAIL": {
 *         "clientId": "server-702deed39e11b607a00139df12427be0",
 *         "method": "detail",
 *         "payload": {
 *             "data": {
 *                 "deviceId": "6154ba444c05f73aa9e6ee0d079b4f9d",
 *                 "mainId": "f90519d1a0cbcb11917d4f3d685cf3f5",
 *                 "memberRecordId": "e36404172c47c044de03220f2ae54503",
 *                 "receiveTime": "2022-12-23T10:01:00.989+0000",
 *                 "result": "1",
 *                 "seq": "device:@7e811938627c1ad1.71b24586c60e1c5c"
 *             },
 *             "topic": "iot/v1/c/9d4ec451d36642e1a0bc84299dabff78/log/detail"
 *         },
 *         "service": "log",
 *         "srcAddr": "centerControlCloud"
 *     }
 * }
 */
type MqttJSON = Record<string, any>;

type MqttReduxState = {
  /**
   * e.g iot/v1/c/9d4ec451d36642e1a0bc84299dabff78/log/detail
   */
  _topic: string;

  /**
   * 举个例子
   * {
   *     "LOG_DETAIL": {
   *         "clientId": "server-702deed39e11b607a00139df12427be0",
   *         "method": "detail",
   *         "payload": {
   *             "data": {
   *                 "deviceId": "6154ba444c05f73aa9e6ee0d079b4f9d",
   *                 "mainId": "f90519d1a0cbcb11917d4f3d685cf3f5",
   *                 "memberRecordId": "e36404172c47c044de03220f2ae54503",
   *                 "receiveTime": "2022-12-23T10:01:00.989+0000",
   *                 "result": "1",
   *                 "seq": "device:@7e811938627c1ad1.71b24586c60e1c5c"
   *             },
   *             "topic": "iot/v1/c/9d4ec451d36642e1a0bc84299dabff78/log/detail"
   *         },
   *         "service": "log",
   *         "srcAddr": "centerControlCloud"
   *     }
   * }
   */
  mqttJSON: MqttJSON;
};

/**
 * @remarks
 *
 * 在上一代Mqtt组件的设计中，并没有在概念上区分业务上的Topic或Mqtt技术上的Topic，
 *   在最新的设计中，从概念上仔细区分了这两者。
 *   Topic都是指Mqtt技术上的概念，而业务上的Topic则用Subject。
 */
const MQTT_TOPICS = IMP_WEB_SUBJECT;

/**
 * 把IMP-Web业务主题转化成Redux State Name
 *
 * @param subject {@link IMP_WEB_SUBJECT}
 * @returns
 *
 * @example
 *
 * // log/detail -> LOG_DETAIL
 * const name = subject2ReduxStateName(IMP_WEB_SUBJECT.LOG_DETAIL);
 */
function subject2ReduxStateName(subject: string) {
  return subject.split("/").join("_").toUpperCase();
}

/**
 * 把IMP-Web业务主题转化成Redux State Name
 *
 * {@link subject2ReduxStateName}
 * @param subject
 * @returns
 */
function combineStateName(subject: string) {
  return subject2ReduxStateName(subject);
}

/**
 * 把IMP-Web业务主题转化成Redux State Name
 *
 * {@link subject2ReduxStateName}
 * @param subject
 * @returns
 */
function transformTopic(subject: string) {
  return subject2ReduxStateName(subject);
}

// TODO 找老樊问清楚，这个函数实现什么功能？
/**
 *
 * @param mqttJSON
 * @param reduxStateName
 * @param preMqttJSON
 * @returns
 */
function transformMqttPayload(
  mqttJSON: MqttJSON,
  reduxStateName: string,
  preMqttJSON: MqttJSON
): MqttJSON {
  const current = (mqttJSON || {})[reduxStateName] || {};
  const prev = (preMqttJSON || {})[reduxStateName] || {};
  if (!isEqual(prev, current)) {
    return current;
  }
  return {};
}

export {
  MQTT_TOPICS,
  combineStateName,
  subject2ReduxStateName,
  transformTopic,
  transformMqttPayload,
};
export type { MqttReduxState };
