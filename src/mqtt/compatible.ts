// 兼容层，主要的目标是实现上一代Mqtt组件在系统中大范围使用的函数、变量的兼容

import { IMP_WEB_SUBJECT } from "./constants";

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
 * const name = subject2ReduxStateName(IMP_WEB_SUBJECT.LOG_DETAIL); // LOG_DETAIL
 */
function subject2ReduxStateName(subject: string) {
  const stateName = subject.split("/").join("_");
  const upperCaseStateName = stateName.toUpperCase();
  return upperCaseStateName;
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

export {
  MQTT_TOPICS,
  combineStateName,
  subject2ReduxStateName,
  transformTopic,
};
