# Splitter benchmark: do text splitters cut clinical patterns apart?

This benchmark splits 207 ACI-Bench clinical notes with three splitters and counts how often a vital sign, medication
mention or section header line ends up with no single chunk containing it whole.

## Summary

These counts cover vitals, medications and standalone section headers: 1,888 patterns across 207 notes. They leave
out 145 lines that the section detector also matches but that are paragraphs starting with a label (for example
"Labs: Within normal limits. White blood cell count…"); the detector over-matches these, and splitting one is ordinary
paragraph splitting. The full tables below include them.

- On the notes as written, LangChain at chunkSize 1000 and 2000 (overlap 0) broke 0 of 1,888.
- On flattened notes (line breaks removed), LangChain at chunkSize 1000, overlap 0 broke 14: 2 vitals, 6 medications
  and 6 headers, in 14 of 207 notes.
- On flattened notes, MedicalChunker at maxTokens 256 with overlap turned off (`overlapTokens: 0`) broke 0 of 1,888.
  Its chunk text was 1.00x the note text, so nothing was duplicated.
- On flattened notes, LangChain at chunkSize 1000 with 200 overlap also broke 0, with chunk text 1.19x the note text.

On well-formatted notes LangChain's default splitter does not break these patterns at chunkSize 1000 or more (at
500 it broke 1 medication). The difference shows up when line breaks are lost, and overlap closes it at a storage
cost. See "What this does and doesn't show" for the limits.

## Setup

Splitters compared:

- **Demo word-boundary splitter**: a port of `demo/src/utils/naiveChunker.ts`, the "generic chunker" shown in the
  MedDevKit demo. It splits at spaces to fit `maxTokens` and ignores newlines. Settings: maxTokens 128, 256, 512.
- **LangChain `RecursiveCharacterTextSplitter`** from `@langchain/textsplitters` 1.0.2, default separators
  (`["\n\n", "\n", " ", ""]`). Settings: chunkSize 500, 1000, 2000 with overlap 0, and chunkSize 1000 with overlap 200.
- **`MedicalChunker`** from `@meddevkit/chunker` (built from this repo), `new MedicalChunker({ maxTokens })` with all
  other options at their defaults (including `overlapTokens: 50` and `minTokens: 50`). Settings: maxTokens 128, 256, 512.
  The same three sizes run again with `overlapTokens: 0`, for a like-for-like comparison with LangChain at overlap 0.

Each setting runs twice: on the notes as written, and on "flattened" notes where every run of newlines is replaced by
one space. Flattening simulates EHR exports or copy-paste that lose line breaks.

## What counts as broken

Patterns are whatever MedDevKit's own detectors find in each note:

- **Vitals:** `detectVitals` spans, e.g. `Heart rate: 58 bpm`.
- **Medications:** `detectMedications` spans, e.g. `metformin 1000 mg twice a day`.
- **Section lines:** the whole line `detectSections` matched as a header, e.g. `ASSESSMENT AND PLAN`.

A pattern is **broken** for a splitter if no single chunk's range in the note text contains the pattern's whole span.
If any chunk holds it whole, including through overlap, it is intact. A partial copy left in a neighbouring chunk is
not penalised.

The run finds 128 vitals, 320 medications and 1,585 section lines, 2,033 patterns in total. The counts are the same
in both modes. In flattened mode, vitals and meds are detected on the flattened text. `detectSections` works line by
line and finds nothing useful once the lines are gone, so section spans are the lines detected on the original text,
mapped to their exact position in the flattened text.

`detectSections` also matches 145 lines that are paragraphs starting with a label, not headers (for example
"Examination of the right knee: Tenderness along…"). The second table in each mode separates these from the 1,440
standalone headers (5 words or fewer, no terminal period).

### How chunk positions are found

- Demo splitter: returns character offsets; each chunk is checked against `text.slice(start, end)`.
- LangChain: `splitText` returns trimmed strings without offsets, so each chunk is located with `indexOf` from a
  moving cursor. A placement is accepted only if it adds text past the previous chunk's end and leaves only whitespace
  in any gap.
- MedicalChunker: chunk `boundaries` are offsets into `normalizeText(text)`, which collapses and trims whitespace. The
  comparison is therefore done in non-whitespace-character positions. The script asserts that normalization leaves
  every non-whitespace character unchanged. The chunk range used is `[overlapStart ?? start, end)`, so overlap counts.

The script also asserts every detector offset, and checks that every non-whitespace character of every note is
covered by some chunk. It aborts or prints a warning if any check fails.

## How to run it

Needs Node 20 or later and pnpm 8.15. From the repo root:

```bash
pnpm install
pnpm build
node benchmarks/splitters/fetch-data.mjs     # downloads ACI-Bench to benchmarks/splitters/data/
node benchmarks/splitters/run.mjs            # notes as written
node benchmarks/splitters/run.mjs --flatten  # newlines collapsed to spaces
```

`fetch-data.mjs` downloads five CSVs from [wyim/aci-bench](https://github.com/wyim/aci-bench) at commit
`b909b2bb9cf1d19de08df15cddde7bd0179665e4` (`data/challenge_data/`: `train`, `valid`, `clinicalnlp_taskB_test1`,
`clinicalnlp_taskC_test2`, `clef_taskC_test3`), checks each against a SHA-256 hash, and writes the `note` column to
`data/aci-bench.jsonl` as `{"id", "text"}` lines (id is `<split>/<encounter_id>`). The data directory is git-ignored;
the notes are not redistributed here.

`run.mjs` prints the tables below plus broken examples, and writes every broken pattern to `data/results.json` or
`data/results-flat.json`. To print one note's chunks for one setting:

```bash
node benchmarks/splitters/run.mjs --dump "LangChain RCTS, chunkSize 1000, overlap 0" train/D2N047 --flatten
```

Nothing is sent over the network except the data download.

## Results

Run on 2026-10-20, Apple M4 Max, Node v24.7.0, `@langchain/textsplitters` 1.0.2 with `@langchain/core` 1.2.20,
`@meddevkit/chunker` 0.3.2 built from this repo. Splitting is deterministic, so the counts should reproduce exactly;
only latency varies.

"Chunk text / note text" is the total length of all chunks divided by the total length of all notes. Above 1.00x
means overlap repeats text across chunks.

### Notes as written

| Splitter / setting | Broken (all) | Vitals broken | Meds broken | Section lines broken | Notes with >=1 broken | Median chunks/note | Median chunk chars | Chunk text / note text |
|---|---|---|---|---|---|---|---|---|
| Demo word-boundary splitter, maxTokens 128 | 40 (2.0%) | 4 (3.1%) | 5 (1.6%) | 31 (2.0%) | 37/207 | 4 | 683 | 1.00x |
| Demo word-boundary splitter, maxTokens 256 | 21 (1.0%) | 2 (1.6%) | 2 (0.6%) | 17 (1.1%) | 21/207 | 2 | 1359 | 1.00x |
| Demo word-boundary splitter, maxTokens 512 | 5 (0.2%) | 0 (0.0%) | 2 (0.6%) | 3 (0.2%) | 5/207 | 1 | 2315 | 1.00x |
| LangChain RCTS, chunkSize 500, overlap 0 | 3 (0.1%) | 0 (0.0%) | 1 (0.3%) | 2 (0.1%) | 3/207 | 8 | 358 | 1.00x |
| LangChain RCTS, chunkSize 1000, overlap 0 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 4 | 833 | 1.00x |
| LangChain RCTS, chunkSize 2000, overlap 0 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 2 | 1559 | 1.00x |
| LangChain RCTS, chunkSize 1000, overlap 200 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 4 | 829 | 1.08x |
| MedicalChunker, maxTokens 128 (defaults) | 2 (0.1%) | 0 (0.0%) | 0 (0.0%) | 2 (0.1%) | 2/207 | 6 | 583 | 1.31x |
| MedicalChunker, maxTokens 256 (defaults) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 3 | 970 | 1.14x |
| MedicalChunker, maxTokens 512 (defaults) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 2 | 1552 | 1.06x |
| MedicalChunker, maxTokens 128, overlapTokens 0 | 3 (0.1%) | 0 (0.0%) | 0 (0.0%) | 3 (0.2%) | 3/207 | 6 | 453 | 1.00x |
| MedicalChunker, maxTokens 256, overlapTokens 0 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 3 | 899.5 | 1.00x |
| MedicalChunker, maxTokens 512, overlapTokens 0 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 2 | 1480 | 1.00x |

| Splitter / setting | Standalone headers broken (of 1,440) | Label+prose lines broken (of 145) |
|---|---|---|
| Demo word-boundary splitter, maxTokens 128 | 9 (0.6%) | 22 (15.2%) |
| Demo word-boundary splitter, maxTokens 256 | 7 (0.5%) | 10 (6.9%) |
| Demo word-boundary splitter, maxTokens 512 | 1 (0.1%) | 2 (1.4%) |
| LangChain RCTS, chunkSize 500, overlap 0 | 0 (0.0%) | 2 (1.4%) |
| LangChain RCTS, chunkSize 1000, overlap 0 | 0 (0.0%) | 0 (0.0%) |
| LangChain RCTS, chunkSize 2000, overlap 0 | 0 (0.0%) | 0 (0.0%) |
| LangChain RCTS, chunkSize 1000, overlap 200 | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 128 (defaults) | 0 (0.0%) | 2 (1.4%) |
| MedicalChunker, maxTokens 256 (defaults) | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 512 (defaults) | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 128, overlapTokens 0 | 0 (0.0%) | 3 (2.1%) |
| MedicalChunker, maxTokens 256, overlapTokens 0 | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 512, overlapTokens 0 | 0 (0.0%) | 0 (0.0%) |

### Flattened notes (`--flatten`)

| Splitter / setting | Broken (all) | Vitals broken | Meds broken | Section lines broken | Notes with >=1 broken | Median chunks/note | Median chunk chars | Chunk text / note text |
|---|---|---|---|---|---|---|---|---|
| Demo word-boundary splitter, maxTokens 128 | 42 (2.1%) | 4 (3.1%) | 8 (2.5%) | 30 (1.9%) | 40/207 | 4 | 682 | 1.00x |
| Demo word-boundary splitter, maxTokens 256 | 20 (1.0%) | 2 (1.6%) | 2 (0.6%) | 16 (1.0%) | 19/207 | 2 | 1357 | 1.00x |
| Demo word-boundary splitter, maxTokens 512 | 4 (0.2%) | 0 (0.0%) | 1 (0.3%) | 3 (0.2%) | 4/207 | 1 | 2296 | 1.00x |
| LangChain RCTS, chunkSize 500, overlap 0 | 53 (2.6%) | 4 (3.1%) | 5 (1.6%) | 44 (2.8%) | 50/207 | 6 | 496 | 1.00x |
| LangChain RCTS, chunkSize 1000, overlap 0 | 26 (1.3%) | 2 (1.6%) | 6 (1.9%) | 18 (1.1%) | 26/207 | 3 | 995 | 1.00x |
| LangChain RCTS, chunkSize 2000, overlap 0 | 9 (0.4%) | 0 (0.0%) | 1 (0.3%) | 8 (0.5%) | 9/207 | 2 | 1908 | 1.00x |
| LangChain RCTS, chunkSize 1000, overlap 200 | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 3 | 994 | 1.19x |
| MedicalChunker, maxTokens 128 (defaults) | 3 (0.1%) | 0 (0.0%) | 0 (0.0%) | 3 (0.2%) | 3/207 | 6 | 602 | 1.30x |
| MedicalChunker, maxTokens 256 (defaults) | 1 (0.0%) | 0 (0.0%) | 0 (0.0%) | 1 (0.1%) | 1/207 | 3 | 1007.5 | 1.13x |
| MedicalChunker, maxTokens 512 (defaults) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0 (0.0%) | 0/207 | 2 | 1930 | 1.05x |
| MedicalChunker, maxTokens 128, overlapTokens 0 | 13 (0.6%) | 0 (0.0%) | 0 (0.0%) | 13 (0.8%) | 12/207 | 6 | 466 | 1.00x |
| MedicalChunker, maxTokens 256, overlapTokens 0 | 5 (0.2%) | 0 (0.0%) | 0 (0.0%) | 5 (0.3%) | 5/207 | 3 | 968.5 | 1.00x |
| MedicalChunker, maxTokens 512, overlapTokens 0 | 3 (0.1%) | 0 (0.0%) | 0 (0.0%) | 3 (0.2%) | 3/207 | 2 | 1891 | 1.00x |

| Splitter / setting | Standalone headers broken (of 1,440) | Label+prose lines broken (of 145) |
|---|---|---|
| Demo word-boundary splitter, maxTokens 128 | 7 (0.5%) | 23 (15.9%) |
| Demo word-boundary splitter, maxTokens 256 | 6 (0.4%) | 10 (6.9%) |
| Demo word-boundary splitter, maxTokens 512 | 0 (0.0%) | 3 (2.1%) |
| LangChain RCTS, chunkSize 500, overlap 0 | 11 (0.8%) | 33 (22.8%) |
| LangChain RCTS, chunkSize 1000, overlap 0 | 6 (0.4%) | 12 (8.3%) |
| LangChain RCTS, chunkSize 2000, overlap 0 | 1 (0.1%) | 7 (4.8%) |
| LangChain RCTS, chunkSize 1000, overlap 200 | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 128 (defaults) | 0 (0.0%) | 3 (2.1%) |
| MedicalChunker, maxTokens 256 (defaults) | 0 (0.0%) | 1 (0.7%) |
| MedicalChunker, maxTokens 512 (defaults) | 0 (0.0%) | 0 (0.0%) |
| MedicalChunker, maxTokens 128, overlapTokens 0 | 1 (0.1%) | 12 (8.3%) |
| MedicalChunker, maxTokens 256, overlapTokens 0 | 0 (0.0%) | 5 (3.4%) |
| MedicalChunker, maxTokens 512, overlapTokens 0 | 0 (0.0%) | 3 (2.1%) |

MedicalChunker latency per note, after two warm-up passes, across all six settings: median 0.70 to 0.73 ms (p95 1.05
to 1.11 ms) as written, and 0.28 to 0.32 ms (p95 0.45 to 0.53 ms) flattened. Expect about ±0.1 ms between runs.

### Notes on the results

- **As written, LangChain does not break these patterns at normal sizes.** At chunkSize 1000 and 2000 it broke 0 of
  2,033. At 500 it broke 3, and 2 of those are paragraph lines longer than 500 characters.
- **MedicalChunker as written** broke 2 at maxTokens 128 and 0 at 256 and 512. Both breaks are long label+prose
  paragraph lines (97 and 114 estimated tokens) that would have fit in a 128-token chunk; MedicalChunker had already
  filled the chunk and cut the line at a sentence boundary. These are real, avoidable misses.
- **Flattened, LangChain without overlap behaves like a word-boundary splitter.** With no newlines its separators fall
  through to `" "`. At chunkSize 1000/overlap 0 (median 995 chars per chunk) it broke 26 patterns in 26 notes:
  2 vitals, 6 meds, 6 standalone headers and 12 prose lines.
- **MedicalChunker at maxTokens 256 (median 1,008 chars per chunk, the closest size match) broke 1 flattened**: a
  536-char prose line, cut at a sentence boundary. It broke 0 vitals, 0 meds and 0 standalone headers at every size,
  in both modes.
- **With overlap off, MedicalChunker breaks more prose lines but still no vitals or meds.** Flattened, at
  `overlapTokens: 0` it broke 13 at maxTokens 128, 5 at 256 and 3 at 512, at 1.00x text. All are label+prose lines
  except one at 128: `Constitutional: Reports chills. Denies fever` (D2N206), a review-of-systems line that the
  "5 words or fewer, no terminal period" rule counts as a standalone header. As written, overlap off broke 3 at 128
  and 0 at 256 and 512, all label+prose lines.
- **LangChain 1000 with overlap 200 broke 0 flattened**, at the cost of 1.19x the note text in chunks.
- **The demo word-boundary splitter** breaks about 2% of patterns at 128 tokens in both modes, because it never looks at
  newlines.

## Broken examples

Format: `…<25 chars before the cut> | <25 chars after the cut>…`, where ⏎ marks a newline. Quotes are from ACI-Bench
(CC BY 4.0). The full lists are in `data/results*.json` after a run.

Flattened, LangChain chunkSize 1000, overlap 0:

- `train/D2N032` vital `Weight: 169 lb`: `… Height: 5’6. Weight: 169 | lb. PHYSICAL EXAM Constit…`
- `clef_taskC_test3/D2N204` vital `Blood Pressure: 110/74 mmHg`: `…nd bruising. VITALS Blood | Pressure: 110/74 mmHg. He…`
- `train/D2N047` medication `metformin 1000 mg twice a day`: `…continue him on metformin | 1000 mg twice a day. A he…`
- `train/D2N003` medication `Protonix 40 mg daily`: `…tinue with Protonix 40 mg | daily. A refill was provi…`

Flattened, LangChain chunkSize 2000, overlap 0:

- `clef_taskC_test3/D2N182` header `CURRENT MEDICATIONS`: `…atic dysreflexia. CURRENT | MEDICATIONS MiraLAX as ne…`

As written, demo word-boundary splitter, maxTokens 128:

- `train/D2N008` header `ASSESSMENT AND PLAN`: `…lobin is 8.2.⏎⏎ASSESSMENT | AND PLAN⏎⏎Ms. Stephanie D…`
- `train/D2N060` vital `Heart rate: 58 bpm`: `…essure: 118/72 mmHg⏎Heart | rate: 58 bpm⏎Respiratory …`

Flattened, MedicalChunker maxTokens 256 (its only break at this size):

- `clef_taskC_test3/D2N179` prose line starting `Diagnosis discussed with patient, I explained that the nerves in
  his wrists are aggrava…` (536 chars): `…EMG testing is performed. | If still symptomatic, we …`

## What this does and doesn't show

- **LangChain's default splitter is fine on well-formatted notes.** On ACI-Bench as written, it keeps
  MedDevKit-detected vitals, medications and section headers intact as well as MedicalChunker does. Pattern
  preservation alone is not a differentiator on formatted notes. ACI notes are generated from dictation: headers sit
  on their own lines, vitals are often one per line, and paragraphs are short. A splitter that tries `\n\n` and `\n`
  before spaces rarely needs to cut mid-line.
- **The difference appears when line breaks are lost.** Flattened text is a simulation of that case, not a sample of
  real exported notes. Notes with long run-on paragraphs or inline vitals strings ("BP 142/88 HR 96 RR 18") are not
  tested here.
- **Overlap also fixes the flattened case.** LangChain at 1000/200 broke 0 flattened patterns. The cost is duplicated
  text: 1.19x the note text in chunks, which means more embedding and storage and repeated retrieval hits. The
  fragment of a pattern at the end of the previous chunk still exists as a partial copy; this test does not count it.
  MedicalChunker also uses overlap by default (50 tokens), at 1.05x to 1.31x. The `overlapTokens: 0` rows show it
  without that help.
- **Patterns are only what MedDevKit's own detectors find.** Detector misses are not counted for any splitter.
  MedicalChunker protects exactly what these detectors find, so the setup favours it by construction. The detectors
  also over-match sections: 145 of 1,585 section lines are label+prose paragraphs. All but one of MedicalChunker's
  breaks are in those, and the one exception (D2N206) is a prose line the header rule misclassifies.
- **The demo splitter is a strawman.** It ignores newlines, which is why it breaks patterns as written. Its numbers
  should not be read as "generic splitters".
- **ACI-Bench notes are role-played.** They are written from simulated doctor-patient encounters, not real patient
  records. Real notes differ in format and noise.
- **Characters vs tokens.** LangChain sizes are in characters; the demo splitter and MedicalChunker use estimated
  tokens (`estimateTokens`). The settings are not perfectly matched, and with default options MedicalChunker's chunk
  length includes up to 50 tokens of overlap. The closest size match to LangChain 1000/0 flattened (median 995 chars)
  is MedicalChunker 256: median 1,007.5 chars with default overlap, 968.5 with overlap off. Compare rows by median
  chunk chars, not by the setting number. At the larger sizes most notes are only 1 or 2 chunks (median note is
  2,615 chars), so there are few boundaries where anything could break.
- **"Intact" is span containment only.** It does not measure whether a chunk keeps its section context, whether chunks
  are semantically coherent, or retrieval quality. MedicalChunker's other features (chunk metadata, PHI flags,
  negation) are not evaluated.
- **Small counts, one corpus.** 207 notes. Apart from the demo splitter, flattened LangChain and flattened
  MedicalChunker 128 with overlap off (13), the non-zero cells are 1 to 5 instances.
- **Machine and versions.** Results above are from one machine (Apple M4 Max, Node v24.7.0) with the package versions
  listed under Results. Break counts do not depend on the machine; latency does.

## Data and license

ACI-Bench: Wen-wai Yim, Yujuan Fu, Asma Ben Abacha, Neal Snider, Thomas Lin, Meliha Yetisgen. "ACI-BENCH: a Novel
Ambient Clinical Intelligence Dataset for Benchmarking Automatic Visit Note Generation." *Scientific Data*, 2023.
Repository: <https://github.com/wyim/aci-bench>. Licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The note excerpts quoted above are unmodified except for
truncation and the ⏎ newline marker. The benchmark code in this directory is MIT, like the rest of the repo.
