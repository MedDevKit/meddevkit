/**
 * Engine unit tests: SPEC §4 precedence and clarifications, §5 API shape and
 * sentence handling, §9 privacy, options, edge cases and performance.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screenText, PATTERNS_VERSION } from '../src';
import type { PatternEntry, PatternFile, ScreenFinding, ScreenResult } from '../src';
import { compileData } from '../src/data';
import { screenWith, MAX_SPAN_TEXT } from '../src/screen';
import { sentenceCuts } from '../src/text';

function only(r: ScreenResult, ruleId: string): ScreenFinding {
  const f = r.findings.filter((x) => x.ruleId === ruleId);
  expect(f, `exactly one ${ruleId}`).toHaveLength(1);
  return f[0];
}

describe('API shape (SPEC §5)', () => {
  it('matches the spec example', () => {
    const text = 'I keep thinking about ending it. Maybe tonight.';
    const r = screenText(text);
    expect(r.level).toBe('crisis');
    expect(r.immediacy).toBe(true);
    expect(r.patternsVersion).toBe(PATTERNS_VERSION);
    expect(r.findings[0]).toEqual({
      ruleId: 'si_active.ending_it',
      category: 'suicidal_ideation_active',
      level: 'crisis',
      baseLevel: 'crisis',
      startOffset: 7,
      endOffset: 31,
      text: 'thinking about ending it',
      modifiers: { negated: false, past: false, resolved: false, hypothetical: false, quoted: false, idiom: false },
      subject: 'self',
    });
    const imm = only(r, 'immediacy.timing');
    expect(imm).toMatchObject({ category: 'immediacy', level: 'crisis', baseLevel: 'none', text: 'tonight' });
  });

  it('returns findings in text order with offsets that slice the input', () => {
    const text = "This commute is killing me. My friend said she wants to die. I can't cope, and I want to die tonight.";
    const r = screenText(text);
    const starts = r.findings.map((f) => f.startOffset);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (const f of r.findings) {
      expect(text.slice(f.startOffset, f.endOffset)).toBe(f.text);
      expect(f.text.length).toBeLessThanOrEqual(MAX_SPAN_TEXT);
    }
  });

  it('keeps findings that context softened to none', () => {
    const r = screenText('My roommate cuts herself and I have no idea how to help.');
    expect(r.level).toBe('none');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ level: 'none', baseLevel: 'crisis', subject: 'other' });
  });

  it('handles empty and whitespace-only input', () => {
    expect(screenText('')).toEqual({ level: 'none', immediacy: false, findings: [], patternsVersion: PATTERNS_VERSION });
    expect(screenText('   \n\t  ')).toEqual({ level: 'none', immediacy: false, findings: [], patternsVersion: PATTERNS_VERSION });
  });

  it('is deterministic', () => {
    const text = 'Years ago I tried to kill myself. I am doing better now, but this week I want to die again.';
    expect(screenText(text)).toEqual(screenText(text));
  });

  it('removes overlapping matches, keeping the higher base level', () => {
    const r = screenText('ugh kill me now');
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].ruleId).toBe('si_passive.kill_me_wish');
  });
});

describe('levels and precedence (SPEC §4)', () => {
  it('idiom outranks everything and sets none', () => {
    const r = screenText('My boss is going to kill me.');
    expect(r.level).toBe('none');
    expect(r.findings[0].modifiers.idiom).toBe(true);
  });

  it('third party sets none with subject other', () => {
    const r = screenText('She told me she wants to kill herself.');
    expect(r.level).toBe('none');
    expect(r.findings[0]).toMatchObject({ level: 'none', subject: 'other' });
  });

  it('the text level is the maximum over findings', () => {
    const r = screenText('My friend wants to die, and honestly I want to die too.');
    expect(r.level).toBe('crisis');
    expect(r.findings.map((f) => [f.level, f.subject])).toEqual([
      ['none', 'other'],
      ['crisis', 'self'],
    ]);
  });

  it('negated crisis language is concern, never none', () => {
    const r = screenText("I'm not going to hurt myself.");
    expect(r.level).toBe('concern');
    expect(r.findings[0].modifiers.negated).toBe(true);
  });

  it('negated acute distress is none, with the finding kept', () => {
    const r = screenText("I'm not panicking.");
    expect(r.level).toBe('none');
    expect(r.findings[0]).toMatchObject({ ruleId: 'distress.panicking', level: 'none' });
    expect(r.findings[0].modifiers.negated).toBe(true);
  });

  it('negation stops at a clause boundary', () => {
    const r = screenText("I wouldn't do it, but I want to die.");
    expect(r.level).toBe('crisis');
  });

  it('a cue inside another finding does not scope further', () => {
    // "don't" belongs to "don't trust myself", so it does not negate "tonight".
    const r = screenText("I don't trust myself to be alone tonight.");
    expect(r.immediacy).toBe(true);
  });

  it('recent past is present: last night stays crisis', () => {
    const r = screenText('I cut myself again last night.');
    expect(r.level).toBe('crisis');
    expect(r.findings[0].modifiers.past).toBe(false);
  });

  it('distant past turns crisis language into concern + history', () => {
    const r = screenText('Years ago I tried to kill myself.');
    expect(r.level).toBe('concern');
    expect(r.findings[0]).toMatchObject({ category: 'history', baseLevel: 'crisis', level: 'concern' });
  });

  it('present tense in the clause cancels a past anchor', () => {
    expect(screenText('After the divorce I want to die.').level).toBe('crisis');
  });

  it('past + resolved: acute distress becomes none, crisis language stays concern', () => {
    expect(screenText('Back in college I was falling apart. I got through it.').level).toBe('none');
    const r = screenText('Back in college I wanted to die. I got through it.');
    expect(r.level).toBe('concern');
    expect(r.findings[0]).toMatchObject({ category: 'history' });
    expect(r.findings[0].modifiers).toMatchObject({ past: true, resolved: true });
  });

  it('resolved may come from the next sentence but not the one after', () => {
    expect(screenText('Last year I fell apart. I got through it.').level).toBe('none');
    expect(screenText('Last year I fell apart. Work was busy. I got through it.').level).toBe('concern');
  });

  it('resolved without past changes nothing', () => {
    const r = screenText("I'm doing better now. I want to die.");
    expect(r.level).toBe('crisis');
  });

  it('a first-person conditional is not hypothetical', () => {
    const r = screenText("If this doesn't work out, I'll kill myself.");
    expect(r.level).toBe('crisis');
    expect(r.findings[0].modifiers.hypothetical).toBe(false);
  });

  it('questions about others are hypothetical with subject unknown', () => {
    const r = screenText('How do you know if someone wants to kill themselves?');
    expect(r.level).toBe('concern');
    expect(r.findings[0]).toMatchObject({ subject: 'unknown' });
    expect(r.findings[0].modifiers.hypothetical).toBe(true);
  });

  it('a first-person question stays with the writer', () => {
    expect(screenText("Do you think they'd be better off without me?").level).toBe('crisis');
    expect(screenText('How do I stop wanting to die?').level).toBe('crisis');
  });

  it('a third-party cue is cancelled by a first-person subject before the finding', () => {
    const r = screenText('Since she left I want to die.');
    expect(r.level).toBe('crisis');
    expect(r.findings[0].subject).toBe('self');
  });

  it('quoted crisis language is concern, unless the writer quotes their own thoughts', () => {
    const quoted = screenText('The chorus goes "I want to die" over and over.');
    expect(quoted.level).toBe('concern');
    expect(quoted.findings[0].modifiers.quoted).toBe(true);
    const own = screenText('I keep thinking "I want to die" over and over.');
    expect(own.level).toBe('crisis');
    expect(own.findings[0].modifiers.quoted).toBe(false);
  });

  it('on a tie, past does not relabel a negated finding as history', () => {
    const r = screenText('Back in college I never tried to kill myself.');
    expect(r.level).toBe('concern');
    expect(r.findings[0]).toMatchObject({ category: 'suicidal_ideation_active' });
    expect(r.findings[0].modifiers).toMatchObject({ negated: true, past: true });
  });

  it('when equal-rank modifiers conflict, the higher level wins', () => {
    // negated distress alone would be none; past gives concern.
    const r = screenText("Last year I wasn't falling apart, I was having panic attacks.");
    expect(r.level).toBe('concern');
  });
});

describe('immediacy (SPEC §4)', () => {
  it('needs a non-negated crisis finding', () => {
    expect(screenText('I want to die tonight.').immediacy).toBe(true);
    expect(screenText("I'm not going to kill myself tonight.").immediacy).toBe(false);
    expect(screenText("What's the plan for tonight?").immediacy).toBe(false);
    expect(screenText("I can't cope tonight.").immediacy).toBe(false);
  });

  it('ignores negated, past or third-party cues', () => {
    expect(screenText("I don't have a plan, but I want to die.").immediacy).toBe(false);
    expect(screenText('My brother bought a gun. I want to die.').immediacy).toBe(false);
  });

  it('can come from another sentence', () => {
    const r = screenText("I've been saving up my pills. I think I'm ready to end my life.");
    expect(r.immediacy).toBe(true);
    expect(only(r, 'immediacy.means').level).toBe('crisis');
  });

  it('never lowers a level', () => {
    const r = screenText("I'm going to end my life tonight.");
    expect(r.level).toBe('crisis');
    expect(r.findings.every((f) => f.level === 'crisis')).toBe(true);
  });
});

describe('options', () => {
  it('suppressIdioms: false reports idioms at their base level', () => {
    const on = screenText('This commute is killing me.');
    const off = screenText('This commute is killing me.', { suppressIdioms: false });
    expect(on.level).toBe('none');
    expect(off.level).toBe('concern');
    expect(off.findings[0].modifiers.idiom).toBe(true);
    expect(screenText("I'd rather die than sit through it.", { suppressIdioms: false }).level).toBe('crisis');
  });

  it('suppressIdioms: false still applies the other modifiers', () => {
    const r = screenText('My boss is going to kill me.', { suppressIdioms: false });
    expect(r.level).toBe('concern');
  });

  it('accepts undefined, null and empty options', () => {
    expect(screenText('I want to die.', undefined).level).toBe('crisis');
    expect(screenText('I want to die.', {}).level).toBe('crisis');
    expect(screenText('I want to die.', null as unknown as undefined).level).toBe('crisis');
  });
});

describe('privacy (SPEC §9)', () => {
  const SECRET = 'my name is Zelda Q and I want to die';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
    screenText(SECRET);
    screenText(SECRET, { suppressIdioms: false });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('errors carry no input text', () => {
    const attempts: (() => unknown)[] = [
      () => screenText(SECRET, { suppressIdioms: 'yes' as unknown as boolean }),
      () => screenText(SECRET, 'loud' as unknown as undefined),
      () => screenText(42 as unknown as string),
      () => screenText({ text: SECRET } as unknown as string),
    ];
    for (const attempt of attempts) {
      let message = '';
      try {
        attempt();
      } catch (e) {
        expect(e).toBeInstanceOf(TypeError);
        message = (e as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('Zelda');
      expect(message).not.toContain('die');
    }
  });

  it('caps finding text at 120 characters and does not split surrogate pairs', () => {
    const file: PatternFile = {
      version: '9.9.9',
      patterns: [
        { id: 'si_active.long', category: 'suicidal_ideation_active', level: 'crisis', pattern: 'x[^.]+y', flags: 'i', sources: [], relation: 'informed-by' },
      ],
      modifiers: [],
    };
    const data = compileData(file);
    const long = `x${'a'.repeat(118)}😀${'b'.repeat(50)}y`;
    const r = screenWith(data, long);
    expect(r.patternsVersion).toBe('9.9.9');
    const f = r.findings[0];
    expect(f.endOffset - f.startOffset).toBe(long.length);
    expect(f.text.length).toBeLessThanOrEqual(MAX_SPAN_TEXT);
    expect(f.text).toBe(`x${'a'.repeat(118)}`);
  });
});

describe('pattern file validation', () => {
  const base: PatternFile = { version: '1.0.0', patterns: [], modifiers: [] };
  const pattern: PatternEntry = { id: 'si_active.x', category: 'suicidal_ideation_active', level: 'crisis', pattern: 'x', sources: [], relation: 'informed-by' };

  it('rejects bad flags, uncompilable regexes, unknown categories and bad scopes, naming only the id', () => {
    const cases: PatternFile[] = [
      { ...base, patterns: [{ ...pattern, flags: 'g' }] },
      { ...base, patterns: [{ ...pattern, pattern: '(unclosed' }] },
      { ...base, patterns: [{ ...pattern, category: 'nope' as never }] },
      { ...base, modifiers: [{ id: 'negated.x', modifier: 'negated', scope: 'between', pattern: 'x', sources: [], relation: 'informed-by' }] },
      { ...base, modifiers: [{ id: 'negated.y', modifier: 'nope' as never, pattern: 'x', sources: [], relation: 'informed-by' }] },
    ];
    for (const file of cases) {
      let message = '';
      try {
        compileData(file);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toMatch(/^crisis-signals: (si_active|negated)\.[xy] /);
      expect(message).not.toContain('unclosed');
    }
    expect(() => compileData({ version: 1 } as unknown as PatternFile)).toThrow('pattern file is malformed');
  });

  it('works without a boundaries section', () => {
    const data = compileData({ ...base, patterns: [{ ...pattern, pattern: 'want to die' }] });
    expect(screenWith(data, 'I want to die').level).toBe('crisis');
  });
});

describe('fragments, cores and vetoes (pattern file format)', () => {
  const pattern = (id: string, source: string): PatternEntry => ({
    id,
    category: 'acute_distress',
    level: 'concern',
    pattern: source,
    flags: 'i',
    sources: [],
    relation: 'informed-by',
  });
  const frag = (id: string, source: string) => ({ id, pattern: source, sources: [], relation: 'informed-by' as const });

  it('expands {{fragment}} references, including references to earlier fragments', () => {
    const data = compileData({
      version: '1.0.0',
      fragments: [frag('W', 'falling|coming'), frag('CORE', '(?:{{W}})\\s+apart')],
      patterns: [pattern('distress.x', '\\b{{CORE}}\\b')],
      modifiers: [],
    });
    expect(screenWith(data, 'I am coming apart').findings[0]).toMatchObject({ ruleId: 'distress.x', text: 'coming apart' });
  });

  it('rejects unknown, forward and duplicate fragments, naming only the id', () => {
    const cases: PatternFile[] = [
      { version: '1.0.0', patterns: [pattern('distress.x', '{{NOPE}}')], modifiers: [] },
      { version: '1.0.0', fragments: [frag('A', '{{B}}'), frag('B', 'b')], patterns: [], modifiers: [] },
      { version: '1.0.0', fragments: [frag('A', 'a'), frag('A', 'b')], patterns: [], modifiers: [] },
    ];
    const messages = cases.map((file) => {
      try {
        compileData(file);
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    });
    expect(messages[0]).toBe('crisis-signals: distress.x references an unknown fragment');
    expect(messages[1]).toBe('crisis-signals: A references an unknown fragment');
    expect(messages[2]).toBe('crisis-signals: fragment A is malformed or duplicated');
  });

  it('the first participating capturing group is the span, so a negation in the frame scopes over it', () => {
    const r = screenText("I'm not falling apart, I'm just tired.");
    const f = only(r, 'distress.state');
    expect(f.text).toBe('falling apart');
    expect(f.modifiers.negated).toBe(true);
    expect(r.level).toBe('none');
    const cut = screenText("I've never cut and I'm not going to start now.");
    expect(cut.level).toBe('concern');
    expect(only(cut, 'self_harm.cutting_frame')).toMatchObject({ text: 'cut', level: 'concern' });
  });

  it('an empty capturing group is a veto: the match yields no finding', () => {
    const data = compileData({
      version: '1.0.0',
      patterns: [pattern('distress.x', '\\breading\\s+about\\s+panic()|\\bpanic\\b')],
      modifiers: [],
    });
    expect(screenWith(data, "I'm reading about panic.").findings).toEqual([]);
    expect(screenWith(data, 'I panic every night.').findings).toHaveLength(1);
    expect(screenText("I'm reading about self-harm to support my teenager.").findings).toEqual([]);
  });

  it('a cue with categories acts only on those categories; sentence-or-next blocks reach the previous sentence', () => {
    const data = compileData({
      version: '1.0.0',
      patterns: [
        { ...pattern('threat.x', '\\bkill\\s+me\\b'), category: 'threatened_by_other' },
        pattern('distress.x', '\\bkilling\\s+me\\b'),
      ],
      modifiers: [
        { id: 'idiom.mom', modifier: 'idiom', scope: 'sentence', pattern: '\\bmom\\b', flags: 'i', sources: [], relation: 'informed-by' },
        {
          id: 'idiom.block',
          modifier: 'idiom',
          scope: 'sentence-or-next',
          effect: 'block',
          categories: ['threatened_by_other'],
          pattern: '\\bknife\\b',
          flags: 'i',
          sources: [],
          relation: 'informed-by',
        },
      ],
    });
    const threat = screenWith(data, 'Mom will kill me. She has a knife.');
    expect(threat.findings[0]).toMatchObject({ ruleId: 'threat.x', level: 'concern', subject: 'other' });
    expect(threat.findings[0].modifiers.idiom).toBe(false);
    const distress = screenWith(data, 'Mom is killing me. She has a knife.');
    expect(distress.findings[0]).toMatchObject({ ruleId: 'distress.x', level: 'none' });
    expect(distress.findings[0].modifiers.idiom).toBe(true);
    expect(screenWith(data, 'Mom will kill me.').findings[0].level).toBe('none');
  });

  it('rejects a cue naming an unknown category', () => {
    expect(() =>
      compileData({
        version: '1.0.0',
        patterns: [],
        modifiers: [
          { id: 'idiom.x', modifier: 'idiom', categories: ['nope' as never], pattern: 'x', sources: [], relation: 'informed-by' },
        ],
      }),
    ).toThrow('crisis-signals: idiom.x names an unknown category');
  });
});

describe('threatened_by_other (SPEC §4 clarification)', () => {
  it('a literal threat is concern with subject other, even though the subject is a third party', () => {
    const r = screenText('My boyfriend said he\'d kill me if I ever left, and he keeps a knife next to the bed.');
    expect(r.level).toBe('concern');
    const f = r.findings.find((x) => x.category === 'threatened_by_other') as ScreenFinding;
    expect(f).toMatchObject({ level: 'concern', baseLevel: 'concern', subject: 'other' });
    expect(f.modifiers.idiom).toBe(false);
  });

  it('literal evidence in the next sentence keeps the threat', () => {
    expect(screenText("If my dad finds out I'm gay he'll kill me. He's said it before and he's hit me.").level).toBe('concern');
  });

  it('a figurative threat stays an idiom (none, finding kept)', () => {
    const r = screenText('My mom is going to kill me when she sees my grades.');
    expect(r.level).toBe('none');
    const f = r.findings.find((x) => x.category === 'threatened_by_other') as ScreenFinding;
    expect(f).toMatchObject({ level: 'none', subject: 'other' });
    expect(f.modifiers.idiom).toBe(true);
    expect(screenText('My mom is going to kill me when she sees my grades.', { suppressIdioms: false }).level).toBe('concern');
  });

  it('violence against the writer is a threat finding', () => {
    expect(screenText('my stepdad choked me last night').findings[0]).toMatchObject({
      category: 'threatened_by_other',
      level: 'concern',
      subject: 'other',
    });
    expect(screenText('My brother beat me at chess again.').level).toBe('none');
  });
});

describe('sentence splitting', () => {
  it('splits on terminators followed by whitespace and on line breaks', () => {
    const t = 'I was sad. I am fine!\nOkay?  Yes';
    // A cut is where the next sentence region starts (its leading whitespace included).
    expect(sentenceCuts(t)).toEqual([10, 21, 27]);
  });

  it('does not split after abbreviations, decimals or a trailing terminator', () => {
    expect(sentenceCuts('Dr. Smith said 98.6 is fine.')).toEqual([]);
    expect(sentenceCuts('I said "no." Then I left.')).toEqual([12]);
  });

  it('collapses blank lines', () => {
    expect(sentenceCuts('One.\n\n\nTwo.')).toEqual([4]);
  });
});

describe('performance', () => {
  const realistic = [
    'Work has been fine I guess, and my manager is supportive.',
    "I can't cope with any of this.",
    'This commute is killing me.',
    'Years ago I tried to kill myself. I am in a much better place now.',
    'My friend told me she wanted to die after her divorce.',
    "I'm not going to hurt myself, I just feel completely empty.",
    'What should I say if a coworker tells me they want to kill themselves?',
    'The song goes "I want to die young" and I loved it as a teen.',
  ].join(' ');

  function timed(text: string): number {
    const t0 = performance.now();
    screenText(text);
    return performance.now() - t0;
  }

  // Measured locally at about 20 ms (realistic) and under 40 ms (worst adversarial case).
  // The limits leave room for slow CI machines while still catching catastrophic backtracking.
  it('screens a 50K-character realistic input quickly', () => {
    let text = '';
    while (text.length < 50_000) text += `${realistic} `;
    screenText(text.slice(0, 1000)); // warm up
    const ms = Math.min(timed(text), timed(text));
    expect(ms).toBeLessThan(200);
  });

  it('stays fast on adversarial 50K inputs (no catastrophic backtracking)', () => {
    const inputs = [
      ' '.repeat(50_000),
      'a'.repeat(50_000),
      "'".repeat(50_000),
      '"'.repeat(50_000),
      'not '.repeat(12_500),
      "i'm so ".repeat(7_200),
      'I want to die '.repeat(3_600),
      'I want to die. '.repeat(3_400),
      'she wants to kill herself and I want to die '.repeat(1_150),
      'what if someone '.repeat(3_200),
      '.\n'.repeat(25_000),
      'kill me '.repeat(6_300),
      'wish '.repeat(10_000),
      // First-person frames with bounded fillers and long vocabulary slots.
      'I am '.repeat(10_000),
      'i just really honestly kinda '.repeat(1_800),
      'im so tired and '.repeat(3_200),
      "I'm not not not ".repeat(3_200),
      'thinking about thinking about '.repeat(1_700),
      'my friend my friend '.repeat(2_600),
      'until it until it '.repeat(2_800),
      'relapsed '.repeat(5_600),
      'I wish I could I wish I could '.repeat(1_700),
      'a'.repeat(50_000),
    ];
    screenText(inputs[0].slice(0, 1000)); // warm up
    for (const text of inputs) {
      const ms = timed(text);
      expect(ms, `${text.slice(0, 16)}...`).toBeLessThan(400);
    }
  });
});
