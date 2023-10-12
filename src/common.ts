import * as t from "io-ts";

export const botConfigCodec = t.type({ id: t.string, name: t.string, runCommand: t.string });
export type BotConfig = t.TypeOf<typeof botConfigCodec>;
export const matchConfigCodec = t.type({
  map: t.string,
  bots: t.array(botConfigCodec),
});
