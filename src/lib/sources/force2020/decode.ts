/**
 * decode(bytes) → columns: one FORCE 2020 well file, read with hyparquet and
 * fzstd (ZSTD is the only codec the files use).
 *
 * Every column comes back as a plain array in file order. NULL stays null,
 * because hyparquet's typed-array conversions would write 0; `build` turns it
 * into NaN. INT64 arrives as bigint.
 */

import { parquetMetadata, parquetRead } from "hyparquet";
import { decompress } from "fzstd";

export type ForceValue = number | bigint | string | null | undefined;

/** Column name → one value per row, NULL as null, in the file's column order. */
export type ForceColumns = Readonly<Record<string, ArrayLike<ForceValue>>>;

const compressors = { ZSTD: (input: Uint8Array) => decompress(input) };

export async function decode(bytes: ArrayBuffer): Promise<ForceColumns> {
  const metadata = parquetMetadata(bytes);
  const rowCount = Number(metadata.num_rows);
  const columns: Record<string, ForceValue[]> = {};
  // Claim the file's column order before any chunk arrives.
  for (const element of metadata.schema.slice(1)) {
    if (element.num_children === undefined) columns[element.name] = new Array(rowCount).fill(null);
  }

  await parquetRead({
    file: bytes,
    metadata,
    compressors,
    onChunk: ({ columnName, columnData, rowStart }) => {
      const out = (columns[columnName] ??= new Array(rowCount).fill(null));
      for (let i = 0; i < columnData.length && rowStart + i < rowCount; i++) {
        out[rowStart + i] = (columnData[i] ?? null) as ForceValue;
      }
    },
  });
  return columns;
}
