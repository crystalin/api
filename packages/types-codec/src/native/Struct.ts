// Copyright 2017-2022 @polkadot/types-codec authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { HexString } from '@polkadot/util/types';
import type { AnyJson, BareOpts, Codec, CodecClass, CodecClassDef, IStruct, IU8a, Registry } from '../types';

import { assert, isBoolean, isFunction, isHex, isObject, isU8a, isUndefined, objectProperties, stringCamelCase, stringify, u8aConcat, u8aToHex, u8aToU8a } from '@polkadot/util';

import { compareMap, decodeU8a, mapToTypeMap, typesToMap } from '../utils';

type TypesDef<T = Codec> = Record<string, string | CodecClass<T>>;

/** @internal */
function decodeStructFromObject (registry: Registry, Types: CodecClassDef, value: any, jsonMap: Map<string, string>): [Iterable<[string, Codec]>, number] {
  let jsonObj: Record<string, unknown> | undefined;
  const inputKeys = Object.keys(Types);
  const typeofArray = Array.isArray(value);
  const typeofMap = value instanceof Map;

  assert(typeofArray || typeofMap || isObject(value), () => `Struct: Cannot decode value ${stringify(value)} (typeof ${typeof value}), expected an input object, map or array`);
  assert(!typeofArray || value.length === inputKeys.length, () => `Struct: Unable to map ${stringify(value)} array to object with known keys ${inputKeys.join(', ')}`);

  const raw = new Array<[string, Codec]>(inputKeys.length);

  for (let i = 0; i < inputKeys.length; i++) {
    const key = inputKeys[i];
    const jsonKey = jsonMap.get(key) || key;
    const Type = Types[key];
    let assign: unknown;

    try {
      if (typeofArray) {
        assign = value[i] as unknown;
      } else if (typeofMap) {
        assign = jsonKey && value.get(jsonKey);
      } else {
        assign = jsonKey && value[jsonKey] as unknown;

        if (isUndefined(assign)) {
          if (isUndefined(jsonObj)) {
            const entries = Object.entries(value);

            jsonObj = {};

            for (let e = 0; e < entries.length; e++) {
              jsonObj[stringCamelCase(entries[e][0])] = entries[e][1];
            }
          }

          assign = jsonKey && jsonObj[jsonKey];
        }
      }

      raw[i] = [
        key,
        assign instanceof Type
          ? assign
          : new Type(registry, assign)
      ];
    } catch (error) {
      let type = Type.name;

      try {
        type = new Type(registry).toRawType();
      } catch (error) {
        // ignore
      }

      throw new Error(`Struct: failed on ${jsonKey}: ${type}:: ${(error as Error).message}`);
    }
  }

  return [raw, 0];
}

/**
 * @name Struct
 * @description
 * A Struct defines an Object with key-value pairs - where the values are Codec values. It removes
 * a lot of repetition from the actual coding, define a structure type, pass it the key/Codec
 * values in the constructor and it manages the decoding. It is important that the constructor
 * values matches 100% to the order in th Rust code, i.e. don't go crazy and make it alphabetical,
 * it needs to decoded in the specific defined order.
 * @noInheritDoc
 */
export class Struct<
  // The actual Class structure, i.e. key -> Class
  S extends TypesDef = TypesDef,
  // input values, mapped by key can be anything (construction)
  V extends { [K in keyof S]: any } = { [K in keyof S]: any },
  // type names, mapped by key, name of Class in S
  E extends { [K in keyof S]: string } = { [K in keyof S]: string }> extends Map<keyof S, Codec> implements IStruct<keyof S> {
  #registry: Registry;

  public createdAtHash?: IU8a;

  readonly initialU8aLength?: number;

  readonly #jsonMap: Map<keyof S, string>;

  readonly #Types: CodecClassDef;

  constructor (registry: Registry, Types: S, value?: V | Map<unknown, unknown> | unknown[] | HexString | null, jsonMap = new Map<string, string>()) {
    const typeMap = mapToTypeMap(registry, Types);
    const [decoded, decodedLength] = isU8a(value)
      ? decodeU8a<Codec, [string, Codec]>(registry, value, typeMap, true)
      : isHex(value)
        ? decodeU8a<Codec, [string, Codec]>(registry, u8aToU8a(value), typeMap, true)
        : value instanceof Struct
          ? [value as Iterable<[string, Codec]>, 0]
          : decodeStructFromObject(registry, typeMap, value || {}, jsonMap);

    super(decoded);

    this.#registry = registry;
    this.initialU8aLength = decodedLength;
    this.#jsonMap = jsonMap;
    this.#Types = typeMap;
  }

  public static with<S extends TypesDef> (Types: S, jsonMap?: Map<string, string>): CodecClass<Struct<S>> {
    const keys = Object.keys(Types);

    return class extends Struct<S> {
      constructor (registry: Registry, value?: unknown) {
        super(registry, Types, value as HexString, jsonMap);

        objectProperties(this, keys, (k) => this.get(k));
      }
    };
  }

  /**
   * @description The available keys for this struct
   */
  public get defKeys (): string[] {
    return Object.keys(this.#Types);
  }

  public getT <T> (key: string): T {
    return this.get(key) as unknown as T;
  }

  /**
   * @description Checks if the value is an empty value
   */
  public get isEmpty (): boolean {
    for (const v of this.values()) {
      if (!v.isEmpty) {
        return false;
      }
    }

    return true;
  }

  /**
   * @description Returns the Type description of the structure
   */
  public get Type (): E {
    const result: Record<string, string> = {};
    const defs = Object.entries(this.#Types);

    for (let i = 0; i < defs.length; i++) {
      const [key, Type] = defs[i];

      result[key] = new Type(this.registry).toRawType();
    }

    return result as E;
  }

  /**
   * @description The length of the value when encoded as a Uint8Array
   */
  public get encodedLength (): number {
    let total = 0;

    for (const v of this.values()) {
      total += v.encodedLength;
    }

    return total;
  }

  /**
   * @description returns a hash of the contents
   */
  public get hash (): IU8a {
    return this.registry.hash(this.toU8a());
  }

  public get registry (): Registry {
    return this.#registry;
  }

  /**
   * @description Compares the value of the input to see if there is a match
   */
  public eq (other?: unknown): boolean {
    return compareMap(this, other);
  }

  /**
   * @description Returns a specific names entry in the structure
   * @param name The name of the entry to retrieve
   */
  public override get (name: keyof S): Codec | undefined {
    return super.get(name);
  }

  /**
   * @description Returns the values of a member at a specific index (Rather use get(name) for performance)
   */
  public getAtIndex (index: number): Codec {
    return this.toArray()[index];
  }

  /**
   * @description Converts the Object to an standard JavaScript Array
   */
  public toArray (): Codec[] {
    return [...this.values()];
  }

  /**
   * @description Returns a hex string representation of the value
   */
  public toHex (): HexString {
    return u8aToHex(this.toU8a());
  }

  /**
   * @description Converts the Object to to a human-friendly JSON, with additional fields, expansion and formatting of information
   */
  public toHuman (isExtended?: boolean): Record<string, AnyJson> {
    const json: Record<string, AnyJson> = {};

    for (const [k, v] of this.entries()) {
      json[k as string] = v && v.toHuman(isExtended);
    }

    return json;
  }

  /**
   * @description Converts the Object to JSON, typically used for RPC transfers
   */
  public toJSON (): Record<string, AnyJson> {
    const json: Record<string, AnyJson> = {};

    for (const [k, v] of this.entries()) {
      const jsonKey = this.#jsonMap.get(k) || k;

      json[jsonKey as string] = v && v.toJSON();
    }

    return json;
  }

  /**
   * @description Returns the base runtime type name for this instance
   */
  public toRawType (): string {
    return stringify(typesToMap(this.registry, this.#Types));
  }

  /**
   * @description Returns the string representation of the value
   */
  public override toString (): string {
    return stringify(this.toJSON());
  }

  /**
   * @description Encodes the value as a Uint8Array as per the SCALE specifications
   * @param isBare true when the value has none of the type-specific prefixes (internal)
   */
  public toU8a (isBare?: BareOpts): Uint8Array {
    const encoded: Uint8Array[] = [];

    for (const [k, v] of this.entries()) {
      if (v && isFunction(v.toU8a)) {
        encoded.push(
          v.toU8a(
            !isBare || isBoolean(isBare)
              ? isBare
              : isBare[k]
          )
        );
      }
    }

    return u8aConcat(...encoded);
  }
}
