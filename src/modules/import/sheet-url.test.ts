import { describe, expect, it } from "vitest";
import { parseSheetUrl } from "./sheet-url";

describe("parseSheetUrl", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd";
  it("lee id y pestaña de la liga de edición", () => {
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?gid=123456#gid=123456`)).toEqual({ id, gid: "123456" });
    expect(parseSheetUrl(` https://docs.google.com/spreadsheets/d/${id}/edit#gid=0 `)).toEqual({ id, gid: "0" });
    expect(parseSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing`)).toEqual({ id, gid: null });
  });
  it("rechaza ligas que no son de Google Sheets", () => {
    expect(parseSheetUrl("hola")).toBeNull();
    expect(parseSheetUrl(`http://docs.google.com/spreadsheets/d/${id}/edit`)).toBeNull();
    expect(parseSheetUrl(`https://evil.com/spreadsheets/d/${id}/edit`)).toBeNull();
    expect(parseSheetUrl(`https://docs.google.com/document/d/${id}/edit`)).toBeNull();
  });
});
