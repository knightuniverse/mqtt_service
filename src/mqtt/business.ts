/*
 * @Author: Milo
 * @Date: 2022-12-26 14:02:20
 * Copyright © Leedarson. All rights reserved.
 */

import { isNil, isString } from 'lodash';

/**
 * IMP-Web业务
 *
 * @remarks
 *
 * 前端想要关注IMP业务，需要调用API通知服务端，服务端作为中介，向Mqtt Broker推送消息。
 */
class Business {
  private __bid: number | string | null = null;
  private __subject: string = '';
  public static create(args: { subject: string; bid?: number | string }): Business {
    return new Business(args.subject, { bid: args.bid });
  }
  constructor(
    subject: string,
    extra: {
      bid?: number | string;
    } = {},
  ) {
    const { bid } = extra;

    this.__subject = subject;
    this.__bid = isNil(bid) || (isString(bid) && bid.length === 0) ? null : bid;
  }

  public get bid() {
    return this.__bid;
  }

  public get id() {
    return `${this.__subject}|${isNil(this.__bid) ? '' : this.__bid}`;
  }

  public get subject() {
    return this.__subject;
  }

  public get needsToLetApiKnowIAMInterested() {
    return !isNil(this.__bid);
  }
}
export { Business };
