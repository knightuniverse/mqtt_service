## 整体设计

![系统设计](./MQTT.png)

## 核心类型

1. MqttService
2. MqttServiceWorker
3. Transport

**MqttService**

单例模式，全局只有一个MqttService对象，主要职责：

1. Mqtt模块的初始化
2. 实例化全局唯一的共享Transport对象
3. 实例化Worker，回收Worker，释放各种资源
4. 处理来自于共享Transport的各种异常，比如断开链接，重连等
5. 切换不同浏览器Tab页的时候，挂起Transport；在浏览器切换回原来的Tab页之后，重新链接Transport

其他

1. 初始化
  - 在t800.tsx进行初始化，分别在 未登录/登录 的情况下注入实例
2. 调用killMqttService退出
  - projects\platform\src\utils\index.ts#logoutEffect， 用户主动注销登录
  - projects\platform\src\utils\api.js#code === 600057， 用户token过期
  - projects\platform\src\t800.tsx#code === 600057， 用户token过期

示例代码

```ts
import { MqttEvent, useMqttService } from "@platform/core/infra";

async function _createWorker() {
  const mqttService = useMqttService();
  const transport = await mqttService.createTransport();
  const worker = mqttService.createWorker(transport);
  const listeners = new Map([
    [
      MqttEvent.Connect,
      new Set([
        {
          thisArg: worker,
          func: (...args) => {
            // worker && transport is ready
            // mqtt topic u would like to subscribe, but please remember, we have to append some prefix at the head of your topic
            const yourTopic = transport.getTopic("#");
            // could call transport.subscribe so you could receive mqtt messages from mqtt broker
            transport.subscribe(yourTopic);
          },
        },
      ]),
    ],
  ]);
  listeners.forEach((callable, event) => {
    callable.forEach((c) => {
      worker.addEventListener(event, c);
    });
  });
  worker.transport.connect();
  return worker;
}
```

**MqttServiceWorker**

每一个UI组件都会分配单独的一个Worker，UI组件被释放之后，由MqttService进行回收释放，主要职责：

1. 负责Mqtt消息的发送
2. 接收到Mqtt消息后，消息的处理

示例代码

```ts
import { useEffect, useRef } from "react";
import { isEmpty, isEqual } from "lodash";

import type { MqttAbility } from "@platform/components/with_mqtt_service";
import {
  transformTopic,
  withMqttService,
} from "@platform/components/with_mqtt_service";
import { IMP_WEB_SUBJECT } from "@platform/core/infra";

type _YourPageProps = MqttAbility & {
  // your props here
};

// please remember message is different from subject to subject
type TMqttMessage = {
  alarmState: number;
  deviceId: string;
  properties: Record<string, any>;
  spaceFilterCode: string;
  status: string;
  topic: string;
};

const yourSubject = IMP_WEB_SUBJECT.LAYOUT_DEVICE_STATUS;

function _YourPage(props: _YourPageProps) {
  const {
    isMqttInited = false,
    mqttJSON,
    notifySubOrUnSubToEndApi = () => void 0,
  } = props;

  const mqttRef = useRef<TMqttMessage>();

  useEffect(() => {
    if (!notifySubOrUnSubToEndApi || !isMqttInited) {
      return;
    }

    notifySubOrUnSubToEndApi(true, {
      topic: yourSubject,
      bid: "", // your bid here
    });
  }, [notifySubOrUnSubToEndApi, isMqttInited]);

  useEffect(() => {
    const reduxStateName = transformTopic(yourSubject);
    const { payload } = (mqttJSON || {})[reduxStateName] || {};

    if (isEmpty(payload)) {
      return;
    }

    if (isEqual(payload, mqttRef.current)) {
      return;
    }

    mqttRef.current = payload;

    console.log("🚀 layout - mqtt推送", payload);
  }, [mqttJSON]);

  return <div>your react ui component here</div>;
}

const YourPage = withMqttService({
  topics: [
    // for example
    yourSubject,
  ],
  isConnectMqtt: false,
})(_YourPage);

export default YourPage;
````

**Transport**

基于MQTT实现的数据通道，消息的准备、处理由上层应用通过事件机制来决定。主要职责：

1. 连接Mqtt Broker
2. 收发消息

## React 组件

withMqttService，主要职责：

1. 调用`MqttService.init`初始化`MqttService`
2. 为每个React UI单独分配Worker，并且注入对相应的方法和属性，提供兼容层，兼容原先MQTTRedux的props

**代码文件**

projects\platform\src\components\with_mqtt_service\index.tsx
