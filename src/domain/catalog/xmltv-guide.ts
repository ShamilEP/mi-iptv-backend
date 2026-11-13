/** Minimal XMLTV channel (SEC-032 / Security §4.2 sandbox). */
export type XmltvChannel = {
  readonly id: string;
  readonly displayName: string | null;
};

/** Minimal XMLTV programme row. */
export type XmltvProgramme = {
  readonly channelId: string;
  readonly start: string;
  readonly stop: string | null;
  readonly title: string | null;
};

export type XmltvParseStats = {
  readonly channelCount: number;
  readonly programmeCount: number;
  readonly skippedTagCount: number;
  readonly byteLength: number;
};

export type XmltvParseResult = {
  readonly channels: readonly XmltvChannel[];
  readonly programmes: readonly XmltvProgramme[];
  readonly stats: XmltvParseStats;
};
