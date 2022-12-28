/**
 * 时间格式化，默认获取当前时间
 * @param {*} time
 * @param {*} fmt
 */
function formatDate(time = new Date(), fmt = 'yyyy-MM-dd hh:mm:ss.SSS', timeView = 24) {
  const date = time instanceof Date ? time : new Date(time);
  let finalTime = fmt;
  const obj = {
    'M+': date.getMonth() + 1, // 月份
    'd+': date.getDate(), // 日
    'h+': timeView === 12 && date.getHours() > 11 ? date.getHours() - 12 : date.getHours(), // 小时
    'm+': date.getMinutes(), // 分
    's+': date.getSeconds(), // 秒
    'S+': date.getMilliseconds(), // 毫秒
  };

  let viewFix = '';
  if (timeView === 12 && new RegExp('(h+)').test(finalTime)) {
    viewFix = date.getHours() > 11 ? ' PM' : ' AM';
  }

  // 年份，4位数
  if (/(y+)/.test(finalTime)) {
    finalTime = finalTime.replace(RegExp.$1, `${date.getFullYear()}`.substr(4 - RegExp.$1.length));
  }

  Object.keys(obj).forEach(key => {
    if (new RegExp(`(${key})`).test(finalTime)) {
      finalTime = finalTime.replace(RegExp.$1, `${obj[key]}`.padStart(RegExp.$1.length, '0'));
    }
  });

  return finalTime + viewFix;
}

/**
 * 获取过期时间戳
 * @param hour - 小时，默认24小时
 * @returns 1563781237964
 */
function getExpireTimestamp(hour = 24) {
  return Date.now() + hour * 60 * 60 * 1000; // 24小时
}

let _uuid = 0;
function getSeq() {
  _uuid += 1;
  return String(Date.now() + _uuid).slice(-9);
}

export { formatDate, getExpireTimestamp, getSeq };
