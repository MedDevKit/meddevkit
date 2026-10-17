# ACI-Bench fixtures: attribution and license

The `.txt` files in this directory are clinical notes from **ACI-Bench**,
used here as realistic integration-test fixtures for `@meddevkit/chunker`.

## Source

- Dataset: ACI-Bench, https://github.com/wyim/aci-bench
- Split: `train` (`train.csv`, column `note`)
- Citation:

  > Yim, W., Fu, Y., Ben Abacha, A., Snider, N., Lin, T., & Yetisgen, M.
  > (2023). Aci-bench: a Novel Ambient Clinical Intelligence Dataset for
  > Benchmarking Automatic Visit Note Generation. *Scientific Data*, 10, 586.
  > https://doi.org/10.1038/s41597-023-02487-3

## License

ACI-Bench is licensed under the Creative Commons Attribution 4.0
International License (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/

These fixture files remain under CC BY 4.0. The MIT license of this
repository does not apply to them.

## Files taken

| File         | ACI-Bench `encounter_id` | Subset     |
| ------------ | ------------------------ | ---------- |
| `D2N011.txt` | D2N011                   | virtassist |
| `D2N035.txt` | D2N035                   | aci        |
| `D2N041.txt` | D2N041                   | aci        |
| `D2N062.txt` | D2N062                   | aci        |

## Changes

None. Each file is the `note` field of the row with that `encounter_id`,
written byte for byte (UTF-8, original line breaks, trailing whitespace and
typographic characters kept, no newline added at end of file). Only the
`note` column was taken; the `dialogue` column is not included.

## No real patient data

The ACI-Bench encounters were role-played doctor-patient visits. The names,
ages and clinical details in these notes are fictional, and the notes
contain no real patient data or protected health information.

## Not published

These fixtures live under `tests/`, which is not in the `files` list of
`packages/chunker/package.json`, so they are not included in the npm
package.
