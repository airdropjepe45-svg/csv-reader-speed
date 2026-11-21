// Fast CSV reader — original implementation written from the semantics brief.
// Single left-to-right pass over UTF-16 code units. Unquoted fields (the
// ~87% common case) are taken as one slice per field; quoted fields take a
// fast slice path when they contain no doubled quote or embedded line break
// and only fall back to a segment-building scan when they do. No regex in
// the hot loop, no per-character string concatenation on the fast paths.
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  let pos = 0;
  let line = 1;
  let columns = null;
  let width = -1;
  const rows = [];
  const errors = [];
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Rare-path unquoted reader (quote junk and unterminated re-reads only).
  // Returns [value, end] with end 0=comma, 1=line break, 2=end of text.
  // Mutates pos/line and emits stray_cr in scan order.
  function readUnquoted(start) {
    let seg = start;
    let acc = null;
    let i = start;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44) {
        const v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
        pos = i + 1;
        return [v, 0];
      }
      if (c === 10) {
        const v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
        pos = i + 1;
        line++;
        return [v, 1];
      }
      if (c === 13) {
        if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
          const v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
          pos = i + 2;
          line++;
          return [v, 1];
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        acc = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
        i++;
        seg = i;
        continue;
      }
      i++;
    }
    const v = acc === null ? text.slice(seg, n) : acc + text.slice(seg, n);
    pos = n;
    return [v, 2];
  }

  for (;;) {
    // Skip blank lines: LF or CRLF only (a lone CR is not skipped here).
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted = false;
    let endKind = 2;

    for (;;) {
      if (pos < n && text.charCodeAt(pos) === 34) {
        // ---- Quoted field ----
        quoted = true;
        const openPos = pos;
        const openLine = line;
        let value = null;
        let closed = false;
        let slow = false;
        let i = pos + 1;
        // Fast scan: look for the closing quote. Any doubled quote or
        // embedded line break sends us to the segment-building path.
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 34) {
            if (i + 1 < n && text.charCodeAt(i + 1) === 34) {
              slow = true;
            } else {
              value = text.slice(pos + 1, i);
              pos = i + 1;
              closed = true;
            }
            break;
          }
          if (c === 10 || c === 13) {
            slow = true;
            break;
          }
          i++;
        }
        if (slow) {
          let acc = '';
          let seg = pos + 1;
          let j = i;
          while (j < n) {
            const d = text.charCodeAt(j);
            if (d === 34) {
              if (j + 1 < n && text.charCodeAt(j + 1) === 34) {
                acc += text.slice(seg, j);
                acc += '"';
                j += 2;
                seg = j;
              } else {
                acc += text.slice(seg, j);
                value = acc;
                pos = j + 1;
                closed = true;
                break;
              }
            } else if (d === 13) {
              acc += text.slice(seg, j);
              acc += '\n';
              line++;
              j += j + 1 < n && text.charCodeAt(j + 1) === 10 ? 2 : 1;
              seg = j;
            } else if (d === 10) {
              line++;
              j++;
            } else {
              j++;
            }
          }
        }
        if (!closed) {
          // Unterminated: emit, reset the line counter to the opening
          // quote's line, and re-read from after the opening quote as an
          // unquoted field whose initial value is one literal quote.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          line = openLine;
          const r = readUnquoted(openPos + 1);
          value = '"' + r[0];
          endKind = r[1];
          quoted = false;
        } else if (pos >= n) {
          endKind = 2;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            pos++;
            endKind = 0;
          } else if (c === 10) {
            pos++;
            line++;
            endKind = 1;
          } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line++;
            endKind = 1;
          } else {
            // Quote junk: read as unquoted text appended to the value.
            const r = readUnquoted(pos);
            value += r[0];
            endKind = r[1];
            if (r[0].length > 0) {
              errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
          }
        }
        fields.push(value);
      } else {
        // ---- Unquoted field (fast path) ----
        quoted = false;
        let seg = pos;
        let acc = null;
        let i = pos;
        let v;
        let end = -1;
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 44) {
            v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
            pos = i + 1;
            end = 0;
            break;
          }
          if (c === 10) {
            v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
            pos = i + 1;
            line++;
            end = 1;
            break;
          }
          if (c === 13) {
            if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
              v = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
              pos = i + 2;
              line++;
              end = 1;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            acc = acc === null ? text.slice(seg, i) : acc + text.slice(seg, i);
            i++;
            seg = i;
            continue;
          }
          i++;
        }
        if (end === -1) {
          v = acc === null ? text.slice(seg, n) : acc + text.slice(seg, n);
          pos = n;
          end = 2;
        }
        endKind = end;
        fields.push(v);
      }
      if (endKind !== 0) break;
    }

    // Discard a single empty unquoted field (only reachable via stray-CR
    // only lines); its errors stay.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width === -1) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      for (let k = fields.length; k < width; k++) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
      fields.length = width;
    }
    rows.push(fields);
  }

  return { columns: header ? columns ?? [] : null, rows, errors };
}
