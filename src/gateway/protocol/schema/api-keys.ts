import { Type, type Static } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const KeysListParamsSchema = Type.Object({}, { additionalProperties: false });

export const KeysSetParamsSchema = Type.Object(
  {
    provider: NonEmptyString,
    key: Type.Optional(Type.String()),
    baseUrl: Type.Optional(Type.String()),
    label: Type.Optional(Type.String()),
    profileId: Type.Optional(NonEmptyString),
  },
  { additionalProperties: false },
);

export type KeysSetParams = Static<typeof KeysSetParamsSchema>;

export const KeysDeleteParamsSchema = Type.Object(
  {
    profileId: NonEmptyString,
  },
  { additionalProperties: false },
);

export type KeysDeleteParams = Static<typeof KeysDeleteParamsSchema>;

export const KeysSetActiveParamsSchema = Type.Object(
  {
    profileId: NonEmptyString,
  },
  { additionalProperties: false },
);

export type KeysSetActiveParams = Static<typeof KeysSetActiveParamsSchema>;

export const KeysReloadParamsSchema = Type.Object({}, { additionalProperties: false });

export const ModelSetDefaultParamsSchema = Type.Object(
  {
    modelId: NonEmptyString,
  },
  { additionalProperties: false },
);

export type ModelSetDefaultParams = Static<typeof ModelSetDefaultParamsSchema>;

export const MaskedKeyEntrySchema = Type.Object(
  {
    profileId: NonEmptyString,
    provider: NonEmptyString,
    name: NonEmptyString,
    maskedKey: NonEmptyString,
    baseUrl: Type.Union([Type.Null(), Type.String()]),
    isActive: Type.Boolean(),
    isValidFormat: Type.Boolean(),
  },
  { additionalProperties: false },
);
