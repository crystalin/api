// Copyright 2017-2022 @polkadot/types-codec authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { CodecTo } from '@polkadot/types-codec/types';

import { TypeRegistry } from '@polkadot/types';
import { Bytes, Raw, Text } from '@polkadot/types-codec';

describe('Text', (): void => {
  const registry = new TypeRegistry();

  describe('decode', (): void => {
    const testDecode = (type: string, input: null | string | Uint8Array | { toString: () => string }, expected: string, toFn: 'toString' | 'toHex' | 'toHuman' = 'toString'): void =>
      it(`can decode from ${type}`, (): void => {
        expect(new Text(registry, input)[toFn]()).toBe(expected);
      });

    testDecode('string', 'foo', 'foo');
    testDecode('Text', new Text(registry, 'foo'), 'foo');
    testDecode('Uint8Array', Uint8Array.from([12, 102, 111, 111]), 'foo');
    testDecode('Raw', new Raw(registry, Uint8Array.from([102, 111, 111])), 'foo'); // no length
    testDecode('Raw', new Raw(registry, Uint8Array.from([102, 111, 111])), 'foo', 'toHuman'); // no length
    testDecode('Bytes', new Bytes(registry, Uint8Array.from([12, 102, 111, 111])), 'foo'); // length-aware encoding
    testDecode('Bytes', new Bytes(registry, Uint8Array.from([12, 102, 111, 111])), 'foo', 'toHuman'); // length-aware encoding
    testDecode('object with `toString()`', { toString (): string { return 'foo'; } }, 'foo');
    testDecode('hex input value', new Text(registry, '0x12345678'), '0x12345678', 'toHex');
    testDecode('null', null, '');
  });

  describe('encode', (): void => {
    const testEncode = (to: CodecTo, expected: string | Uint8Array): void =>
      it(`can encode ${to}`, (): void => {
        expect(new Text(registry, 'foo')[to]()).toEqual(expected);
      });

    testEncode('toHex', '0x666f6f');
    testEncode('toString', 'foo');
    testEncode('toU8a', Uint8Array.from([12, 102, 111, 111]));
  });

  describe('utils', (): void => {
    it('compares actual string values', (): void => {
      expect(new Text(registry, '123').eq('123')).toBe(true);
    });

    it('compares actual String values', (): void => {
      expect(new Text(registry, 'XYX').eq(String('XYX'))).toBe(true);
    });

    it('compares actual non-string values (fails)', (): void => {
      expect(new Text(registry, '123').eq(123)).toBe(false);
    });

    it('calulates the length & encoded length correctly for ASCII', (): void => {
      const test = new Text(registry, 'abcde');

      expect(test.encodedLength).toEqual(6);
      expect(test).toHaveLength(5);
    });

    it('calulates the length & encoded length correctly for non-ASCII', (): void => {
      const test = new Text(registry, '中文');

      expect(test.encodedLength).toEqual(7);
      expect(test).toHaveLength(2);
    });
  });
});
