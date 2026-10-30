# lasio fixtures

These LAS files come from lasio's test suite,
[`tests/examples`](https://github.com/kinverarity1/lasio/tree/bf9874e3d4396cf777f5ca413a3559d2eb793de4/tests/examples)
at commit `bf9874e`, under the MIT licence in [`LICENSE`](LICENSE)
(Copyright (c) 2013-2020 Kent Inverarity and contributors). They keep lasio's
file names and directories.

`parse.test.ts` reads them. Each covers one of `parseLas`'s edge-case groups:

| group | files |
|---|---|
| plain 1.2 and 2.x | `1.2/sample.las`, `2.0/sample_2.0.las`, `sample_2.1.las` |
| wrapped | `1.2/sample_wrapped.las`, `2.0/sample_2.0_wrapped.las` |
| NULL variants | `null_policy_dashes.las`, `null_policy_ERR.las`, `index_null.las`, `missing_null.las` |
| duplicate and missing mnemonics | `mnemonic_duplicate.las`, `mnemonic_missing_multiple.las` |
| encodings | `encodings_utf8.las`, `encodings_utf8wbom.las`, `encodings_utf16lebom.las`, `encodings_utf16bebom.las`, `encodings_cp1252.las` |
| section structure | `missing_vers.las`, `missing_wrap.las`, `non-standard-header-sections.las`, `skip_data_section_comments.las`, `missing_a_section.las`, `sparse_curves.las`, `2.0/sample_2.0_tab_dlm.las`, `2.0/sample_2.0_universal_newline.las` |
| index and STRT/STOP | `autodepthindex_F.las`, `autodepthindex_FEET.las`, `autodepthindex_M_FT.las`, `sample_cyrillic_depth_unit.las`, `single_step_20.las`, `duplicate_step.las`, `data_characters.las` |
| non-numeric data | `comma_decimal_mark.las`, `null_policy_dashes.las`, `null_policy_ERR.las` |
| `excess_curves` | `excess_curves.las` |
| LAS 3.0 (refused) | `3.0/sample_3.0.las` |

Not taken: `1001178549.las` (its header claims a third-party data copyright),
and `logging_levels.las` and `6038187_v1.2.las` (no recorded provenance).

## Changes

One file was edited so that no commercial product is named: in
`data_characters.las`, a curve mnemonic and its description carried a logging
tool's trade name, which was removed (`GR_UNC_RT`, "Raw Gamma Ray, Real-Time").
Parsing is unchanged. Every other file is byte for byte as lasio has it.
