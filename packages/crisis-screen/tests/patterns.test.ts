/**
 * Every pattern, cue and boundary id has at least one positive and one
 * negative example (MedDevKit testing rule). Negatives are near misses where
 * possible. The table must cover exactly the ids in the data file, so a new
 * pattern cannot land without examples.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PatternFile } from '../src';
import { screenText } from '../src';

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/crisis.patterns.json', import.meta.url)), 'utf8'),
) as PatternFile;

/** id -> [positive, negative] */
const EXAMPLES: Record<string, [string, string]> = {
  // suicidal_ideation_passive
  'si_passive.better_off_without_me': ['They would all be better off without me.', 'The team works better without meetings.'],
  'si_passive.better_off_dead': ["I'd be better off dead.", 'I am better off now.'],
  'si_passive.wish_dead': ['I wish I was dead.', 'I wish I was there.'],
  'si_passive.wish_could_die': ['I wish I could just die.', 'I wish I could disappear into the mountains for a week.'],
  'si_passive.hope_i_die': ['I hope I die in my sleep.', 'I hope I do well in my sleep study.'],
  'si_passive.want_to_not_exist': ['I want to stop existing.', 'I want to stop exercising so much.'],
  'si_passive.feel_like_dying': ['I feel like dying.', 'I feel like dyeing my hair.'],
  'si_passive.whats_the_point_of_living': ["What's the point of living?", "What's the point of this meeting?"],
  'si_passive.wish_not_alive': ["I wish I wasn't alive.", "I wish I wasn't late."],
  'si_passive.never_born': ["I wish I'd never been born.", 'I wish I had never bought that car.'],
  'si_passive.not_wake_up': ['I hope I never wake up.', "I hope I don't wake up the baby."],
  'si_passive.dont_want_to_live': ["I don't want to live anymore.", "I don't want to live in Denver."],
  'si_passive.no_reason_to_live': ['There is no reason to live.', 'There is no reason to leave early.'],
  'si_passive.tired_of_living': ["I'm tired of living.", "I'm tired of living in this city."],
  'si_passive.suicidal': ["I've been feeling suicidal.", 'We trained to support suicidal patients.'],
  'si_passive.think_about_dying': ['I think about dying a lot.', 'I think about diving a lot.'],
  'si_passive.kill_me_wish': ['Someone please kill me.', 'Someone please call me.'],
  'si_passive.rather_be_dead': ["I'd rather be dead.", "I'd rather be home."],
  'si_passive.no_one_would_miss_me': ['No one would miss me.', 'No one would miss me at the party tonight.'],
  'si_passive.shouldnt_exist': ["I shouldn't be alive.", "I shouldn't be late."],
  'si_passive.wont_be_around': ["I won't be around much longer.", "I won't be around on Friday."],
  'si_passive.death_would_be_relief': ['Dying would be a relief.', 'Moving would be a relief.'],
  // suicidal_ideation_active
  'si_active.kill_myself': ['I want to kill myself.', 'Can you kill the process?'],
  'si_active.end_my_life': ['I want to end my life.', 'This is the end of my shift.'],
  'si_active.take_my_life': ['I thought about taking my own life.', 'I want to take my life back.'],
  'si_active.ending_it': ['I keep thinking about ending it.', 'I decided to end it with him.'],
  'si_active.want_to_die': ['I want to die.', 'The plants need to die back in winter.'],
  'si_active.suicide_frames': ["I've been thinking about suicide.", 'I think about suicide prevention at work.'],
  'si_active.overdose': ['I overdosed last night.', 'Naloxone lowers the risk of overdose.'],
  'si_active.method': ['I want to hang myself.', 'I shot myself in the foot with that email.'],
  'si_active.jump': ['I keep picturing myself jumping off the bridge.', 'The kids were jumping off the bridge into the lake.'],
  'si_active.suicide_note_plan': ['I wrote my suicide note.', 'The suicide squeeze is a risky play.'],
  'si_active.ways_to_die': ['I looked up painless ways to die.', 'I looked up painless ways to floss.'],
  // self_harm
  'self_harm.reflexive_harm': ["I've been hurting myself again.", 'I cut myself shaving.'],
  'self_harm.self_harm_word': ['I self-harmed last night.', 'We ran a self-harm prevention training.'],
  'self_harm.cutting_frame': ["I've been cutting again.", "We've been cutting costs."],
  'self_harm.urges': ['I have the urge to self-harm.', 'I have urges to eat cake.'],
  // unsafe_with_self
  'unsafe.not_safe_with_self': ["I don't feel safe with myself.", "I don't feel safe driving at night."],
  'unsafe.scared_of_what_i_might_do': ["I'm scared of what I might do.", "I'm scared of what I might say in the interview."],
  'unsafe.dont_trust_myself': ["I don't trust myself right now.", "I don't trust myself with cake."],
  'unsafe.do_something_to_myself': ['I might do something to myself.', 'I might do something nice for myself.'],
  'unsafe.cant_keep_myself_safe': ["I can't keep myself safe.", 'I keep myself busy.'],
  // acute_distress
  'distress.cant_cope': ["I can't cope.", 'I can cope.'],
  'distress.cant_go_on': ["I can't go on like this.", "I can't go on Friday."],
  'distress.cant_get_out_of_bed': ["I couldn't get out of bed for weeks.", 'I got out of bed early.'],
  'distress.cant_take_it': ["I can't take it anymore.", "I can't take it to the post office."],
  'distress.cant_stop_crying': ["I can't stop crying.", 'The baby has been crying for hours.'],
  'distress.falling_apart': ["I'm falling apart.", 'The project is falling apart.'],
  'distress.overwhelmed': ["I'm completely overwhelmed.", "I'm overwhelmed with emails."],
  'distress.barely_holding_on': ["I'm barely holding on.", 'Hold on, I am barely awake.'],
  'distress.empty_inside': ['I feel empty inside.', 'The fridge is empty inside.'],
  'distress.dont_think_i_can': ["I don't think I can go on.", "I don't think I can go on Friday."],
  'distress.whats_the_point': ['Everything feels hopeless.', 'This puzzle feels hopeless.'],
  'distress.panic_attack': ["I'm having a panic attack.", 'The market had a panic.'],
  'distress.panicking': ["I'm panicking.", 'Investors are panicking.'],
  'distress.cant_breathe': ["I can't breathe.", "I can't breathe through my nose with this cold."],
  'distress.breakdown': ["I'm having a breakdown.", 'The car had a breakdown.'],
  'distress.breaking_point': ["I'm at my breaking point.", 'The bridge has a breaking point.'],
  'distress.not_okay': ["I'm not okay.", "I'm not okay with the new schedule."],
  'distress.hopeless_trapped': ['I feel hopeless.', 'I feel hopeless at math.'],
  'distress.unbearable': ['The pain is unbearable.', 'The heat is bearable.'],
  'distress.want_it_to_stop': ['I just want it to stop.', 'I want it to stop by the office at 5.'],
  'distress.need_help_now': ['I need help right now.', 'I need help with my taxes.'],
  'distress.ambiguous_die': ["I'm dying inside.", 'The battery is dying.'],
  'distress.ambiguous_kill': ['This job is killing me.', 'Kill the process.'],
  'distress.ambiguous_to_death': ["I'm scared to death.", 'He was put to death.'],
  'distress.ambiguous_death_of_me': ['This will be the death of me.', 'The death of a salesman.'],
  // history
  'history.past_attempt': ['After my attempt I took a year off.', 'My attempt at baking failed.'],
  'history.psych_admission': ['I was in a psych ward in college.', 'I worked at a psych hospital.'],
  // immediacy
  'immediacy.timing': ['I want to do it tonight.', 'I did it last week.'],
  'immediacy.plan': ['I have a plan.', 'I have a planner.'],
  'immediacy.means': ["I've been saving up my pills.", 'I take my pills with lunch.'],
  'immediacy.preparation': ['I wrote letters to my family.', 'I read letters from my family.'],

  // negated
  'negated.not': ["I'm not going to hurt myself.", "I'm not sure."],
  'negated.contraction': ["I don't want to die.", "I don't know."],
  'negated.never': ['I would never do that.', "I've never felt so alone."],
  'negated.no': ['I have no plan.', 'I have no reason to stay.'],
  'negated.nor': ['Neither am I.', 'Nothing.'],
  // third_party
  'third_party.he_she': ['She said it.', 'The said it.'],
  'third_party.relation': ['My sister said it.', 'My own words.'],
  'third_party.people_who': ['Patients who are struggling.', 'How do people who struggle get help?'],
  'third_party.reflexive': ['She cut herself.', 'What if they hurt themselves?'],
  'third_party.possessive_life': ['He took his own life.', 'He took my advice.'],
  'third_party.block_first_person': ['I said so.', 'He said so.'],
  // hypothetical
  'hypothetical.what_if': ['What if I left?', 'What a day.'],
  'hypothetical.hypothetically': ['Hypothetically, yes.', 'Honestly, yes.'],
  'hypothetical.what_would_happen': ['What would happen if I left?', 'What happened yesterday?'],
  'hypothetical.is_it_normal': ['Is it normal to feel this way?', 'It is normally fine.'],
  'hypothetical.procedure': ['Would you have to report it?', 'Would you like tea?'],
  'hypothetical.asked_if': ['The nurse asked if I was okay.', 'The nurse asked for my name.'],
  'hypothetical.how_question': ['How do people cope with this?', 'How do I cope with this?'],
  'hypothetical.what_question': ['What should I say if a friend asks?', 'What should I say if I want to die?'],
  'hypothetical.generic_subject': ['How do you know if someone is sad?', 'Someone left a note.'],
  'hypothetical.block_first_person': ['Do you think I am okay?', 'Do you think it is okay?'],
  // past
  'past.years_ago': ['Years ago I moved.', 'Two weeks ago I moved.'],
  'past.back_then': ['Back then I was sad.', 'Back home I was sad.'],
  'past.life_stage': ['When I was nineteen I left.', 'When I was alone I left.'],
  'past.used_to': ['I used to run.', "I'm used to it."],
  'past.last_period': ['Last year was hard.', 'Last night was hard.'],
  'past.in_year': ['In 2015 I moved.', 'In 20 minutes I move.'],
  'past.first_period': ['The first months were hard.', 'The first one was hard.'],
  'past.during_period': ['During my divorce I struggled.', 'During the meeting I struggled.'],
  'past.life_event': ['When we lost the baby I struggled.', 'When we lost the game I laughed.'],
  'past.after_event': ['After the funeral I struggled.', 'After the meeting I struggled.'],
  'past.bereavement': ['When my dad died I struggled.', 'When my dad called I struggled.'],
  'past.that_was_ago': ['That was a long time ago.', 'That was a long time.'],
  'past.at_first': ['At first it was hard.', 'It was first.'],
  'past.history_of': ['I have a history of it.', 'I like history.'],
  'past.block_recent': ['It happened last night.', 'It happened last year.'],
  'past.block_present_tense': ["I'm sad.", 'I was sad.'],
  // resolved
  'resolved.not_there_anymore': ["I'm not there anymore.", "I'm not there yet."],
  'resolved.better_place': ["I'm in a much better place now.", "I'm in a different city now."],
  'resolved.doing_better': ["I'm doing a lot better now.", "I'm doing a lot of work now."],
  'resolved.got_through': ['I got through it.', 'I got to it.'],
  'resolved.clean_stable': ["I've been clean for six months.", "I've been cleaning for six hours."],
  'resolved.time_since': ["It's been two years.", "It's been raining."],
  'resolved.recovered': ["I've recovered.", "I've recorded it."],
  // idiom
  'idiom.thing_killing_me': ['This commute is killing me.', 'The depression is killing me.'],
  'idiom.someone_will_kill_me': ['My boss is going to kill me.', 'I wish someone would kill me.'],
  'idiom.interjection_kill_me': ['ugh kill me now', 'please kill me now'],
  'idiom.killed_me': ['That joke killed me.', 'That joke kills.'],
  'idiom.kill_me_laughing': ['kill me now lol', 'kill me now'],
  'idiom.killing_myself_effort': ["I'm killing myself to finish this report.", "I'm thinking of killing myself to end the pain."],
  'idiom.kill_it': ['We killed it at the pitch.', 'We killed the bug.'],
  'idiom.kill_for': ['I could kill for a coffee.', 'I could kill myself.'],
  'idiom.dying_to': ["I'm dying to know.", "I'm dying inside."],
  'idiom.dead_adjective': ['I was dead tired.', 'I was dead inside.'],
  'idiom.dead_laughing': ['im dead lmao', 'im dead'],
  'idiom.died_laughing': ['I nearly died laughing.', 'I nearly died.'],
  'idiom.could_just_die': ['I could just die, this cake is amazing.', 'I could just die.'],
  'idiom.to_death': ["I'm bored to death.", "I'm scared to death of what I might do."],
  'idiom.rather_die_than': ["I'd rather die than sit through that.", "I'd rather die than keep living like this."],
  'idiom.death_of_me': ['This will be the death of me.', 'The death of me is near.'],
  // quoted
  'quoted.double': ['The song goes "I want to die".', 'The song goes on.'],
  'quoted.curly_double': ['It says “I want to die”.', 'It says nothing.'],
  'quoted.single': ["The line goes 'I want to die'.", "I can't go, it's late."],
  'quoted.media_frame': ['The song goes I want to die young.', 'The song is loud.'],
  'quoted.block_self_speech': ['I keep thinking it.', 'He keeps thinking it.'],
  // boundaries
  'boundary.punctuation': ['yes, no', 'yes no'],
  'boundary.dash_semicolon': ['yes; no', 'yes-no'],
  'boundary.contrast': ['yes but no', 'yes butter no'],
  'boundary.new_first_person_clause': ['and I left', 'and then left'],
  'boundary.subordinate': ['because I left', 'the causeway'],
};

const all = [...file.patterns, ...file.modifiers, ...(file.boundaries ?? [])];

describe('pattern examples', () => {
  it('cover exactly the ids in the data file', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(all.map((e) => e.id).sort());
  });

  for (const e of all) {
    const ex = EXAMPLES[e.id];
    if (!ex) continue;
    const re = new RegExp(e.pattern, `${e.flags ?? ''}u`);
    it(`${e.id}: positive matches, negative does not`, () => {
      expect(re.test(ex[0]), `positive: ${ex[0]}`).toBe(true);
      expect(re.test(ex[1]), `negative: ${ex[1]}`).toBe(false);
    });
  }
});

describe('pattern file shape', () => {
  const PREFIX: Record<string, string> = {
    suicidal_ideation_passive: 'si_passive.',
    suicidal_ideation_active: 'si_active.',
    self_harm: 'self_harm.',
    unsafe_with_self: 'unsafe.',
    acute_distress: 'distress.',
    immediacy: 'immediacy.',
    history: 'history.',
  };
  const NOTICE_KEYS = new Set(['srl-v1.0', 'nimh-asq', 'nimh-warning-signs']);

  it('is version 0.1.0', () => {
    expect(file.version).toBe('0.1.0');
  });

  it('ids are unique and use the category or modifier prefix', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const p of file.patterns) expect(p.id.startsWith(PREFIX[p.category]), p.id).toBe(true);
    for (const c of file.modifiers) expect(c.id.startsWith(`${c.modifier}.`), c.id).toBe(true);
    for (const b of file.boundaries ?? []) expect(b.id.startsWith('boundary.'), b.id).toBe(true);
  });

  it('base levels follow the category table (SPEC §4)', () => {
    for (const p of file.patterns) {
      const expected =
        p.category === 'immediacy' ? 'none' : p.category === 'acute_distress' || p.category === 'history' ? 'concern' : 'crisis';
      expect(p.level, p.id).toBe(expected);
    }
  });

  it('every source key is defined in NOTICE and every relation is informed-by', () => {
    const notice = readFileSync(fileURLToPath(new URL('../NOTICE', import.meta.url)), 'utf8');
    for (const e of all) {
      expect(e.relation, e.id).toBe('informed-by');
      for (const s of e.sources) {
        expect(NOTICE_KEYS.has(s), `${e.id}: ${s}`).toBe(true);
        expect(notice.includes(s), `NOTICE defines ${s}`).toBe(true);
      }
    }
  });

  it('every category and modifier has at least one entry', () => {
    for (const cat of Object.keys(PREFIX)) expect(file.patterns.some((p) => p.category === cat), cat).toBe(true);
    for (const mod of ['negated', 'past', 'resolved', 'hypothetical', 'third_party', 'idiom', 'quoted']) {
      expect(file.modifiers.some((c) => c.modifier === mod && (c.effect ?? 'set') === 'set'), mod).toBe(true);
    }
  });
});

describe('detection patterns produce findings through the engine', () => {
  for (const p of file.patterns) {
    it(`${p.id} positive yields a finding with that rule`, () => {
      const r = screenText(EXAMPLES[p.id][0], { suppressIdioms: false });
      expect(r.findings.map((f) => f.ruleId)).toContain(p.id);
    });
  }
});
