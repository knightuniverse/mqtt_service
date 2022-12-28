import { getDemoModePort } from "@platform/utils/demo-mode";
import type { AxiosRequestConfig, AxiosResponse, Canceler } from "axios";
import axios from "axios";
import {
  forEach,
  isFunction,
  isNil,
  isNumber,
  isObject,
  isString,
} from "lodash";
import HashAlgorithm from "md5.js";

interface APIResponse<T = unknown> {
  /** 自定义业务响应码 */
  code: number;
  /** 业务数据 */
  data: T;
  /** 自定义业务响应描述 */
  desc: string;
}

interface HTTPException<T = unknown> {
  /** 自定义业务响应码 */
  code: number;
  /** 业务数据 */
  data: T;
  /** 自定义业务响应描述 */
  desc: string;
}

interface APIPagedData<T> {
  endRow: number;
  pageNum: number;
  pageSize: number;
  pages: number;
  result: T[];
  startRow: number;
  total: number;
}

interface IHttp {
  get: <T = unknown>(
    url: string,
    parameters?: Record<string, unknown>,
    extraConfig?: ExtraConfig
  ) => Promise<APIResponse<T>>;
  delete: <T = unknown>(
    url: string,
    parameters?: Record<string, unknown>,
    extraConfig?: ExtraConfig
  ) => Promise<APIResponse<T>>;
  patch: <T = unknown>(
    url: string,
    parameters?: Record<string, unknown>,
    extraConfig?: ExtraConfig
  ) => Promise<APIResponse<T>>;
  post: <T = unknown>(
    url: string,
    parameters?: Record<string, unknown>,
    extraConfig?: ExtraConfig
  ) => Promise<APIResponse<T>>;
  put: <T = unknown>(
    url: string,
    parameters?: Record<string, unknown>,
    extraConfig?: ExtraConfig
  ) => Promise<APIResponse<T>>;
}

type CancelTokenExecutor = (cancel: Canceler) => void;

type ExtraConfig = Partial<{
  /**
   * API服务前缀，默认值是building，也就是默认调用smart-building-service
   */
  apiChange: string;
  /**
   * @deprecated 自从有了大屏设计器，我们就不需要在API层面使用演示数据了
   */
  demo: boolean;
  /**
   * @deprecated 自从有了大屏设计器，我们就不需要在API层面使用演示数据了
   */
  demoUrl: string;
  /**
   * 除了'access-token' | 'terminal' | 'token'之外，额外添加的HTTP请求头，
   */
  headers: Record<
    Exclude<string, "access-token" | "terminal" | "token">,
    string
  >;
  /**
   * 是否隐藏请求URL中的随机时间戳（这个随机时间戳用于防止API缓存）
   */
  hideTimes: boolean;
  /**
   * 是否在HTTP模块中吞掉异常。
   *
   * @remarks
   *
   * - 如果不设置，或者isCatch为true，API网关的响应不是200的情况下，HTTP模块会吞掉异常，不会向上抛。
   * - 如果isCatch为false，请求失败的情况下，HTTP模块会向上抛出异常。
   *
   * @remarks
   *
   * 之所以会有这个设计是因为原本很多代码是手动判断API返回的业务处理结果，一般情况下API的业务处理结果是：
   *
   * { code:string; data:any; desc:string; }
   *
   * 前端会根据code做一定的处理，如果API返回成功，code一般是200；
   *
   * const res = await api({
   *   method: 'get',
   *   url: '',
   *   params: { },
   *   apiChange: 'building',
   * });
   *
   * if (res?.code === 200) {
   *   // do something when success
   * }
   *
   * if (res?.code !== 200) {
   *   // do something when failed
   * }
   *
   */
  isCatch: boolean;
  /**
   * @deprecated 自从有了大屏设计器，我们就不需要在API层面使用演示数据了
   */
  mock: boolean;
  // `responseType` indicates the type of data that the server will respond with
  // options are: 'arraybuffer', 'document', 'json', 'text', 'stream'
  // browser only: 'blob'
  responseType:
    | "arraybuffer"
    | "blob"
    | "document"
    | "json"
    | "text"
    | "stream";
  /**
   * 请求超时，默认值是1000*50
   */
  timeout: number;
  /**
   * `data` is the data to be sent as the request body
   * Only applicable for request methods 'PUT', 'POST', 'DELETE', and 'PATCH'
   * When no `transformRequest` is set, must be of one of the following types:
   * - string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
   * - Browser only: FormData, File, Blob
   * - Node only: Stream, Buffer
   *
   * @example
   *
   * yield* toGenerator(
   *   api.put<OSSFile>(
   *     endpoint.presignedUrl,
   *     { blob },
   *     {
   *       headers: headers,
   *       hideTimes: true,
   *       isCatch: false,
   *       usingBlob: true,
   *       onUploadProgress: onUploadProgress,
   *     },
   *   ),
   * );
   */
  usingBlob: boolean;
  /**
   * `data` is the data to be sent as the request body
   * Only applicable for request methods 'PUT', 'POST', 'DELETE', and 'PATCH'
   * When no `transformRequest` is set, must be of one of the following types:
   * - string, plain object, ArrayBuffer, ArrayBufferView, URLSearchParams
   * - Browser only: FormData, File, Blob
   * - Node only: Stream, Buffer
   *
   * @example
   *
   * yield* toGenerator(
   *   api.put(
   *     '', // your api endpoint
   *     { formData: new FormData() }, // parameters
   *     {
   *       headers: headers,
   *       hideTimes: true,
   *       isCatch: false,
   *       usingFormData: true,
   *       onUploadProgress: onUploadProgress,
   *     },
   *   ),
   * );
   *
   * yield* toGenerator(
   *   api.put(
   *     '', // your api endpoint
   *     { a: '', b:'', c:'' }, // parameters
   *     {
   *       headers: headers,
   *       hideTimes: true,
   *       isCatch: false,
   *       usingFormData: true,
   *       onUploadProgress: onUploadProgress,
   *     },
   *   ),
   * );
   */
  usingFormData: boolean;
  /**
   * `cancelToken` specifies a cancel token that can be used to cancel the request
   */
  cancelToken: CancelTokenExecutor;
  /**
   * `onUploadProgress` allows handling of progress events for uploads
   * browser only
   */
  onUploadProgress: (progressEvent: any) => void;
  /**
   * `onDownloadProgress` allows handling of progress events for downloads
   * browser only
   */
  onDownloadProgress: (progressEvent: any) => void;
}>;

type SyncBeforeRequestMiddleware = (
  method: "get" | "delete" | "patch" | "post" | "put",
  url: string,
  parameters: Record<string, unknown>,
  extraConfig: ExtraConfig
) => boolean | void;
type AsyncBeforeRequestMiddleware = (
  method: "get" | "delete" | "patch" | "post" | "put",
  url: string,
  parameters: Record<string, unknown>,
  extraConfig: ExtraConfig
) => Promise<boolean | void>;
type BeforeRequestMiddleware =
  | SyncBeforeRequestMiddleware
  | AsyncBeforeRequestMiddleware;

type SyncAfterReturningMiddleware = (
  data: APIResponse<any>,
  extraConfig: ExtraConfig
) => boolean | void;
type AsyncAfterReturningMiddleware = (
  data: APIResponse<any>,
  extraConfig: ExtraConfig
) => Promise<boolean | void>;
type AfterReturningMiddleware =
  | SyncAfterReturningMiddleware
  | AsyncAfterReturningMiddleware;

function isPromise(obj: any): boolean {
  return (
    !!obj &&
    (typeof obj === "object" || typeof obj === "function") &&
    typeof obj.then === "function"
  );
}

function isAPIResponse(sn: any) {
  const isObj = isObject(sn);
  const hasCode = isNumber(sn.code);
  const hasData = sn.hasOwnProperty("data");
  const hasDesc = isString(sn.desc);

  return isObj && hasCode && hasData && hasDesc;
}

const AXIOS_HTTP_TIMEOUT = 1000 * 50;
const FAKE_HTTP_REQUEST_HASH = "21febc4b-a082-42c5-93ee-4ed1ee18df8d";
const MAX_WAIT_MS = 500; /** ms */
const PREFIX_HASH = {
  building: "building",
};

const ApiError = {
  busy: {
    code: -1,
    desc: "服务繁忙，稍后重试",
  },
  canceledByUser: {
    code: -1,
    desc: "用户取消了请求",
  },
  forbidden: {
    code: 600057,
    desc: "无权限访问，请重新登录",
  },
};

function removeNullOrUndefinedProperties(
  parameters: Record<string, unknown> = {}
): NonNullable<Record<string, unknown>> {
  const data: NonNullable<Record<string, unknown>> = {};
  forEach(parameters, (v, k) => {
    if (isNil(v)) {
      return;
    }
    data[k] = v;
  });
  return data;
}

class AxiosHttpService {
  private accessToken: string | null;
  private language: string | null;
  private useApi2: boolean = false;

  static create(
    config: {
      accessToken?: string;
      language?: string;
      useApi2: boolean;
    } = {
      useApi2: false,
    }
  ): AxiosHttpService {
    const { accessToken, language, useApi2 } = config;
    return new AxiosHttpService(
      accessToken ? accessToken : null,
      language ? language : null,
      useApi2
    );
  }

  constructor(
    accessToken: string | null,
    language: string | null,
    useApi2: boolean = false
  ) {
    this.accessToken = accessToken;
    this.language = language;
    this.useApi2 = useApi2;
  }

  private __createClient(extraConfig: ExtraConfig = {}) {
    const accessToken = this.accessToken;
    const language = this.language;
    const useApi2 = this.useApi2;
    const {
      apiChange,
      headers,
      hideTimes,
      mock,
      responseType,
      timeout,
      cancelToken,
      onDownloadProgress,
      onUploadProgress,
    } = extraConfig;
    const axiosInstance = axios.create({
      baseURL: useApi2 === true ? "/api2" : "/api",
      timeout: isNumber(timeout) && timeout >= 0 ? timeout : AXIOS_HTTP_TIMEOUT,
    });

    const onRequestFulfilled = (config: AxiosRequestConfig) => {
      const requestConfig = config;

      if (!isNil(language)) {
        requestConfig.headers.CUSTOM_LANGUANGE_HEADER = this.language;
      }

      if (!isNil(accessToken)) {
        requestConfig.headers.token = accessToken;
        requestConfig.headers["access-token"] = accessToken;
      }

      if (!isNil(headers)) {
        forEach(headers, (v, k) => {
          requestConfig.headers[k] = v;
        });
      }

      requestConfig.responseType = isNil(responseType) ? "json" : responseType;

      const terminal = /(iphone|ipad|android)/gi.test(navigator.appVersion)
        ? "APP"
        : "WEB";
      requestConfig.headers.terminal = terminal;

      if (mock) {
        requestConfig.url = `mock${requestConfig.url}`;
      }

      if (apiChange && !mock) {
        const prefixKey = apiChange || "building";
        // @ts-ignore
        const prefix = PREFIX_HASH[prefixKey] || PREFIX_HASH.building;
        requestConfig.baseURL = "/api";
        requestConfig.url = `/${prefix}${requestConfig.url}`;
      }

      // TODO requestConfig.url 有可能为undefined吗？
      if (hideTimes !== true) {
        requestConfig.url = `${requestConfig.url}${
          requestConfig.url!.indexOf("?") >= 0 ? "&" : "?"
        }_r=${Math.random()}`;
      }

      if (isFunction(cancelToken)) {
        requestConfig.cancelToken = new axios.CancelToken(cancelToken);
      }

      if (isFunction(onDownloadProgress)) {
        requestConfig.onDownloadProgress = onDownloadProgress;
      }

      if (isFunction(onUploadProgress)) {
        requestConfig.onUploadProgress = onUploadProgress;
      }

      return requestConfig;
    };

    const onRequestRejected = (error: any) => Promise.reject(error);

    axiosInstance.interceptors.request.use(
      onRequestFulfilled,
      onRequestRejected
    );

    return axiosInstance;
  }

  async call<T = unknown>(
    method: "get" | "delete" | "patch" | "post" | "put",
    url: string,
    parameters: Record<string, unknown>,
    extraConfig: ExtraConfig = {}
  ): Promise<AxiosResponse<APIResponse<T>>> {
    const client = this.__createClient(extraConfig);
    const usingParams = new Set(["delete", "get"]).has(method);

    let data: Blob | FormData | Record<string, unknown> = parameters;
    if (!usingParams && extraConfig.usingFormData === true) {
      data =
        parameters.formData instanceof FormData
          ? parameters.formData
          : (function createFormData() {
              const fd = new FormData();
              forEach(parameters, (v, k) => {
                if (v instanceof Blob) {
                  fd.append(k, v as Blob);
                } else {
                  fd.append(k, `${v}`);
                }
              });
              return fd;
            })();
    }

    if (
      !usingParams &&
      extraConfig.usingBlob === true &&
      parameters.blob instanceof Blob
    ) {
      data = parameters.blob;
    }

    return usingParams
      ? client.request({
          method: method,
          url: url,
          // `params` 是与请求一起发送的 URL 参数
          params: parameters,
        })
      : client.request({
          method: method,
          url: url,
          data: data,
        });
  }
}

/**
 * 为每个请求创建一个哈希
 *
 * @param request
 */
function __hash(request: {
  method: "get" | "delete" | "patch" | "post" | "put";
  url: string;
  parameters: Record<string, unknown>;
  extraConfig: ExtraConfig;
}): string {
  function __doHash(str: string): string {
    const algorithm = new HashAlgorithm();
    algorithm.end(str);
    return algorithm.read().toString("hex");
  }

  return __doHash(JSON.stringify(request));
}

function __isHTTPGetMethod(method: string) {
  return method.toLowerCase() === "get";
}

function __matchParams(
  data: Record<string, any>,
  params: Record<string, any> = {}
) {
  const { default: defaultData, ...restData } = data;
  let matchData = null;
  forEach(restData, (val, key) => {
    const keyQuery: Record<string, any> = {};
    let isMatch = true;
    key.split("&").forEach((pair) => {
      const [k, v] = pair.split("=");
      keyQuery[k] = v;
      if (v !== String(params[k])) {
        isMatch = false;
      }
      return isMatch;
    });
    if (isMatch) {
      matchData = val;
      return false;
    }
    return true;
  });
  return matchData || defaultData || null;
}

class AxiosHttp implements IHttp {
  static create(
    config: {
      accessToken?: string;
      language?: string;
      useApi2: boolean;
    } = {
      useApi2: false,
    }
  ) {
    return new AxiosHttp(config);
  }

  private __httpRequestCache = new Map<
    /* Request Object Hash */ string,
    {
      /** Milliseconds elapsed since, e.g Date.now() */
      createdAt: number;
      /** Axios instance */
      promise: Promise<any>;
    }
  >([]);
  private __middleware: {
    afterReturning: AsyncAfterReturningMiddleware[];
    beforeRequest: AsyncBeforeRequestMiddleware[];
  } = {
    afterReturning: [],
    beforeRequest: [],
  };
  private __service: AxiosHttpService;

  constructor(
    config: {
      accessToken?: string;
      language?: string;
      useApi2: boolean;
    } = {
      useApi2: false,
    }
  ) {
    this.__service = AxiosHttpService.create(config);
  }

  /**
   * 添加中间件，中间件的调用时机是请求结束之后
   *
   * @example
   *
   * const beforeRequest: BeforeRequestMiddleware = (data, extraConfig) => {
   *   // do something
   * }
   *
   * const afterReturning: AfterReturningMiddleware = (data, extraConfig) => {
   *   // do something
   * }
   *
   * const api = AxiosHttp.create({
   *   accessToken: '',
   *   language: 'en_US',
   *   useApi2: false,
   * });
   *
   * api.beforeRequest(beforeRequest);
   * api.afterReturning(afterReturning);
   *
   * @param middleware
   * @returns
   */
  afterReturning(middleware: AfterReturningMiddleware) {
    if (!isFunction(middleware)) {
      return;
    }

    if (!isPromise(middleware)) {
      this.__middleware.afterReturning.push(
        (data: APIResponse<any>, extraConfig: ExtraConfig) =>
          new Promise<boolean | void>((resolve) => {
            resolve(
              (middleware as SyncAfterReturningMiddleware)(data, extraConfig)
            );
          })
      );
    } else {
      this.__middleware.afterReturning.push(
        middleware as AsyncAfterReturningMiddleware
      );
    }
  }

  /**
   * 添加中间件，中间件的调用时机是请求发生前
   *
   * @example
   *
   * const beforeRequest: BeforeRequestMiddleware = (data, extraConfig) => {
   *   // do something
   * }
   *
   * const afterReturning: AfterReturningMiddleware = (data, extraConfig) => {
   *   // do something
   * }
   *
   * const api = AxiosHttp.create({
   *   accessToken: '',
   *   language: 'en_US',
   *   useApi2: false,
   * });
   *
   * api.beforeRequest(beforeRequest);
   * api.afterReturning(afterReturning);
   *
   * @param middleware
   * @returns
   */
  beforeRequest(middleware: BeforeRequestMiddleware) {
    if (!isFunction(middleware)) {
      return;
    }

    if (!isPromise(middleware)) {
      this.__middleware.beforeRequest.push(
        (method, url, parameters, extraConfig) =>
          new Promise<boolean | void>((resolve) => {
            resolve(
              (middleware as SyncBeforeRequestMiddleware)(
                method,
                url,
                parameters,
                extraConfig
              )
            );
          })
      );
    } else {
      this.__middleware.beforeRequest.push(
        middleware as AsyncBeforeRequestMiddleware
      );
    }
  }

  private __cacheRequest(
    /** Request Object Hash */
    requestHash: string,
    /** Axios instance */
    promise: Promise<any>
  ) {
    this.__httpRequestCache.set(requestHash, {
      createdAt: Date.now(),
      promise,
    });
  }

  private async __call<T = unknown>(
    method: "get" | "delete" | "patch" | "post" | "put",
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ): Promise<APIResponse<T>> {
    /**
     * 获取演示数据
     *
     * @deprecated 自从有了大屏设计器，我们就不需要在API层面使用演示数据了
     */
    const __fetchDemoData = async (
      port: string
    ): Promise<APIResponse<T | null>> => {
      const { demoUrl } = extraConfig;
      const baseUrl =
        port === "sample"
          ? `${window.location.origin}/sample`
          : `http://127.0.0.1:${port}`;
      const params = removeNullOrUndefinedProperties(parameters);
      try {
        const { data } = await axios({
          method: "get",
          params: params,
          url: `${baseUrl}${demoUrl || url}.json`,
        });
        const matchData = __matchParams(data, params);
        return !matchData
          ? {
              code: 200,
              data: null,
              desc: "",
            }
          : {
              code: 200,
              data: matchData as T,
              desc: "",
            };
      } catch (e) {
        console.log("加载本地数据出错......");
      }

      return {
        code: 200,
        data: null,
        desc: "",
      };
    };

    /**
     * 发起真正的API请求
     *
     * @remarks
     *
     * API发送请求分两个阶段
     *
     * 1. 请求发起前
     * 2. 请求结束后
     *
     * **请求发起前**
     *
     * 执行所有的中间件，如果其中有一个中间件返回false，则意味着取消请求，此时HTTP模块将不会发起请求。
     *
     * **请求结束后**
     *
     * 执行所有的中间件，并且传入API业务响应。API业务响应的数据结构是：
     *
     * { code: number; data: any; desc: string; }
     *
     * 此时如果中间件返回false，根据isCatch的值，HTTP模块会选择吞掉，或者抛出异常。
     *
     * **异常处理**
     *
     * 异常分两种情况：
     *
     * 1. 应用服务器，比如Nginx返回的异常
     * 2. API网关返回的异常
     *
     * *应用服务器*
     *
     * 常见的应该是404之类的异常
     *
     * *API网关返回的异常*
     *
     * 1. 应用服务器返回的HTTP状态码 === 200，API服务响应的code !== 200
     *
     *  也就是业务处理过程中发生了异常
     *
     * 2. 应用服务器返回的HTTP状态码 !== 200，API服务响应的code !== 200
     *
     *  这种情况就是API响应请求的时候，把HTTP状态码也同步修改了，HTTP状态码可能是400，也可能是500。HTTP状态码不一定和API响应中的code一致。
     *  比如HTTP状态码可能是400（按照现在的约定是，如果API处理过程中出现了异常，API会把HTTP状态码统一改成400），但API业务响应中的code为600057。
     */
    const __issueApiRequest = async (): Promise<APIResponse<T>> => {
      /** beforeRequest，中间件 */
      let shouldRejectThisRequest = false;
      const beforeRequest = this.__middleware.beforeRequest;
      const params = removeNullOrUndefinedProperties(parameters);
      for (const middleware of beforeRequest) {
        const result = await middleware(method, url, params, extraConfig);
        if (result === false) {
          shouldRejectThisRequest = true;
        }
      }

      if (shouldRejectThisRequest) {
        return Promise.reject({
          code: -1,
          data: {},
          desc: `BeforeRequest中间件返回false，请求取消，${method},\n ${url},\n ${params},\n ${extraConfig}`,
        });
      }

      const shouldThrows = extraConfig.isCatch === false;
      try {
        // 使用Axios库，发起HTTP请求
        const axiosResponse = await this.__service.call<T>(
          method,
          url,
          params,
          extraConfig
        );
        // API业务响应
        const apiResponse = axiosResponse.data;

        //有些场景下是不会有API响应的，比如上传文件的时候
        if (apiResponse) {
          // 使中间件机制，对API的业务响应结果进行处理。
          // 此时API响应结果的code字段是200，则表示业务处理正常进行
          // 此时API响应结果的code字段不是200，这表示业务处理过程中，遇到了异常情况，这时候根据shouldThrows判断是否要吞掉异常
          let shouldRejectThisResponse = false;
          const afterReturning = this.__middleware.afterReturning;
          for (const middleware of afterReturning) {
            const ret = await middleware(apiResponse, extraConfig);
            if (ret === false) {
              shouldRejectThisResponse = true;
            }
          }

          return shouldRejectThisResponse
            ? shouldThrows
              ? Promise.reject(apiResponse)
              : Promise.resolve(apiResponse)
            : Promise.resolve(apiResponse);
        }

        return Promise.resolve({
          code: axiosResponse.status,
          data: {} as T,
          desc: axiosResponse.statusText,
        });
      } catch (error: any) {
        if (axios.isCancel(error)) {
          return Promise.reject({
            code: error.response.status,
            data: {} as T,
            desc: ApiError.canceledByUser.desc,
          });
        }

        const axiosResponse = error.response;
        const apiResponse = axiosResponse?.data as APIResponse<any> | null;

        if (!isNil(apiResponse)) {
          const afterReturning = this.__middleware.afterReturning;
          for (const middleware of afterReturning) {
            await middleware(apiResponse, extraConfig);
          }

          const exception: HTTPException<any> = isAPIResponse(apiResponse)
            ? {
                code: apiResponse.code,
                data: apiResponse.data || ({} as T),
                desc: apiResponse.desc,
              }
            : {
                code: axiosResponse.status,
                data: {} as T,
                desc: axiosResponse.statusText,
              };

          // API返回异常
          return shouldThrows
            ? Promise.reject(exception)
            : Promise.resolve(exception);
        }

        // 应用服务器返回的异常，比如应用服务器返回404错误
        return shouldThrows
          ? Promise.reject({
              code: axiosResponse.status,
              data: {} as T,
              desc: axiosResponse.statusText,
            })
          : Promise.resolve({
              code: axiosResponse.status,
              data: {} as T,
              desc: axiosResponse.statusText,
            });
      }
    };

    /**
     * 获取演示数据
     *
     * @deprecated 自从有了大屏设计器，我们就不需要在API层面使用演示数据了
     */
    const demoPort = getDemoModePort();
    if (extraConfig.demo === true && !isNil(demoPort)) {
      const ret = await __fetchDemoData(demoPort);
      if (ret.data === null) {
        return await __issueApiRequest();
      }

      // TODO double check
      return ret as APIResponse<T>;
    }

    /**
     * 电梯算法，合并HTTP Get请求
     *
     * @remarks
     *
     * 某些场景下，比如我们封装了一个业务Select组件。
     * 这个Select组件用在Form.List里，渲染Form.List的时候，同样的API请求会触发多次。
     * 使用一个简单的电梯算法合并这些请求。
     */
    const needsCache = __isHTTPGetMethod(method);
    const requestHash = needsCache
      ? __hash({
          method,
          url,
          parameters,
          extraConfig,
        })
      : FAKE_HTTP_REQUEST_HASH;

    if (!needsCache) {
      return __issueApiRequest();
    }

    const cachedRequest = this.__httpRequestCache.get(requestHash);
    if (cachedRequest && Date.now() - cachedRequest.createdAt <= MAX_WAIT_MS) {
      return cachedRequest.promise;
    }
    const promise = __issueApiRequest();
    this.__cacheRequest(requestHash, promise);
    return promise;
  }

  async get<T = unknown>(
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ) {
    return await this.__call<T>("get", url, parameters, extraConfig);
  }

  async delete<T = unknown>(
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ) {
    return this.__call<T>("delete", url, parameters, extraConfig);
  }

  async patch<T = unknown>(
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ) {
    return this.__call<T>("get", url, parameters, extraConfig);
  }

  async post<T = unknown>(
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ) {
    return this.__call<T>("post", url, parameters, extraConfig);
  }

  async put<T = unknown>(
    url: string,
    parameters: Record<string, unknown> = {},
    extraConfig: ExtraConfig = {}
  ) {
    return this.__call<T>("put", url, parameters, extraConfig);
  }
}

export { ApiError, AxiosHttp, PREFIX_HASH, isAPIResponse };
export type {
  AfterReturningMiddleware,
  APIPagedData,
  APIResponse,
  BeforeRequestMiddleware,
  ExtraConfig,
  HTTPException,
  IHttp,
};
