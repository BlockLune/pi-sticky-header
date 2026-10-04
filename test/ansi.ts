/** Read the SGR background color at a text offset. */
export function backgroundAt(line: string, offset: number): string | undefined {
  let background: string | undefined;
  // oxlint-disable-next-line no-control-regex -- read terminal SGR codes for color tests.
  const sgr = /\x1b\[([\d;]*)m/g;
  for (const match of line.slice(0, offset).matchAll(sgr)) {
    const codes = match[1]!.split(";").map(Number);
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index];
      if (code === 38 || code === 48) {
        const count = codes[index + 1] === 2 ? 5 : 3;
        if (code === 48) background = codes.slice(index, index + count).join(";");
        index += count - 1;
      } else if (code === 0 || code === 49) background = undefined;
      else if (code !== undefined && ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)))
        background = String(code);
    }
  }
  return background;
}
