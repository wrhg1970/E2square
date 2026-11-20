import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("escapa comillas, comas y fórmulas", () => {
    expect(toCsv([["a,b", 'di "hola"', "=1+1", 5, null]])).toBe('﻿"a,b","di ""hola""",\'=1+1,5,\r\n');
  });
});
