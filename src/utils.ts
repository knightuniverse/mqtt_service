import { types } from 'mobx-state-tree';
import type { ISimpleType } from 'mobx-state-tree';

function assert(condition: boolean, message: string) {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (!condition) {
    throw new Error(message);
  }
}

function numberBackedEnumeration<T>(name: string | number[], options?: any): ISimpleType<T> {
  const realOptions: number[] = typeof name === 'string' ? options! : name;
  const type = types.union(...realOptions.map(option => types.literal(option)));
  if (typeof name === 'string') type.name = name;
  return type;
}

export { assert, numberBackedEnumeration };
