import { poseidon2Hash } from "@zkpassport/poseidon2";
import { assertField } from "./field.ts";

export function hash(inputs: readonly bigint[]): bigint {
  inputs.forEach((value, index) => assertField(value, `input ${index}`));
  return poseidon2Hash([...inputs]);
}
