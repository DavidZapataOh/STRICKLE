import { poseidon2Hash } from "@zkpassport/poseidon2";
import { assertField } from "./field.js";
export function hash(inputs) {
    inputs.forEach((value, index) => assertField(value, `input ${index}`));
    return poseidon2Hash([...inputs]);
}
