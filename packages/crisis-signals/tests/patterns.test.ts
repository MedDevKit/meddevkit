/**
 * Every fragment, pattern, cue and boundary id has at least one positive and
 * one negative example (MedDevKit testing rule). Negatives are near misses
 * where possible. The table must cover exactly the ids in the data file, so a
 * new pattern cannot land without examples.
 *
 * Examples run against the compiled data (fragments expanded, the same flags
 * as at runtime). A detection pattern's example counts its findings the way
 * the engine does: the first capturing group is the span, and an empty first
 * group is a veto that yields no finding. A fragment's example must match the
 * fragment as a whole string.
 *
 * Context-gated patterns are counted on their regex alone; their positive
 * example includes the context, so it also yields a finding through the
 * engine, and GATED_WITHOUT_CONTEXT shows each one yielding nothing without it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PatternFile } from '../src';
import { screenText } from '../src';
import { compileData, resolveFragments } from '../src/data';
import { findAll, findCores } from '../src/regex';

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/crisis.patterns.json', import.meta.url)), 'utf8'),
) as PatternFile;

/** id -> [positive, negative] */
const EXAMPLES: Record<string, [string, string]> = {
  // fragments (whole-string matches)
  SELF: ["I'm", 'him'],
  FILLW: ['kinda', 'banana'],
  FILL: [' just really', 'just'],
  START: ['', 'x'],
  ME: ["I'm so ", "he's so "],
  CANT: ["can't", 'can'],
  ABOUT: ['abt', 'around'],
  IDEATE: ['thinkin', 'thinker'],
  INTEND: ['wanna', 'wander'],
  MYSELF: ['my self', 'yourself'],
  ING: ['in', 'ed'],
  SUICIDE: ['sucide', 'suicidal'],
  PILLS: ['sleeping pills', 'pillows'],
  MEANS: ['rope', 'soap'],
  BODY: ['thighs', 'thoughts'],
  SH_MARK: ['until it bled', 'until it rained'],
  GONE: ["wasn't around", 'was around'],
  TIMING: ['tonight', 'last night'],
  RELATION: ['stepdad', 'stepladder'],
  PERSON: ['my ex', 'my car'],
  PERMANENT: ['for good', 'for now'],
  DROP: ['fire escape', 'escape'],
  LETHAL: ['shotgun', 'shot'],
  IMAGINE: ['part of me wants to', 'part of me'],
  IMAGERY_FILL: [' how easy it would be to', ' how it would be'],
  NUISANCE: ['leaf blower', 'leaf'],

  // suicidal_ideation_passive
  'si_passive.better_off_without_me': ['My family would honestly be fine without me.', 'The team will be fine without me for a week.'],
  'si_passive.better_off_dead': ["I'd be better off not existing.", 'I am better off now.'],
  'si_passive.wish_dead': ['I wish I was dead.', 'I wish I was there.'],
  'si_passive.wish_could_die': ["I wish I'd just die already.", 'I wish I could disappear into the mountains for a week.'],
  'si_passive.hope_i_die': ["I hope I don't make it through the night.", 'I hope I do well in my sleep study.'],
  'si_passive.want_to_not_exist': ['i want to cease to be', 'I want to disappear for a week on a beach.'],
  'si_passive.feel_like_dying': ['I feel like dying.', 'I feel like dyeing my hair.'],
  'si_passive.whats_the_point_of_living': ["what's the point of me even being alive", "What's the point of this meeting?"],
  'si_passive.wish_not_alive': ["I wish I wasn't alive.", "I wish I wasn't late."],
  'si_passive.never_born': ["I wish I'd never been born.", 'I wish I had never bought that car.'],
  'si_passive.not_wake_up': ['I hope I never wake up.', "I hope I don't wake up the baby."],
  'si_passive.dont_want_to_live': ["I don't think I want to be alive much longer.", "I don't want to wake up early tomorrow."],
  'si_passive.no_reason_to_live': ["I don't see why I should keep on living.", 'There is no reason to leave early.'],
  'si_passive.tired_of_living': ["I'm tired of living.", "I'm tired of living in this city."],
  'si_passive.suicidal': ["Do they have to call someone if you're suicidal?", 'We trained to support suicidal patients.'],
  'si_passive.think_about_dying': ['I keep fantasizing about my funeral.', "I'm planning my grandmother's funeral."],
  'si_passive.kill_me_wish': ['I wish someone would just end it for me.', 'Someone please call me.'],
  'si_passive.rather_be_dead': ["I'd rather be dead.", "I'd rather be home."],
  'si_passive.no_one_would_miss_me': ["If I'm gone nobody will even notice.", 'No one would miss me at the party tonight.'],
  'si_passive.shouldnt_exist': ["I shouldn't be alive.", "I shouldn't be late."],
  'si_passive.wont_be_around': ["I won't be around much longer.", "I won't be around on Friday."],
  'si_passive.death_would_be_relief': ['Honestly death sounds pretty good right now.', 'The death metal concert sounds good.'],
  'si_passive.wouldnt_mind_dying': ["Honestly I wouldn't mind if I died in my sleep.", "I wouldn't mind a coffee."],
  'si_passive.should_die': ['I feel like I should just die.', 'I should just dye my hair.'],
  'si_passive.not_make_it_alive': ["There's no way I'm making it through this week alive.", "There's no way I'm making it through this week of meetings."],
  'si_passive.want_life_over': ['I hate my life and I want it to be over.', 'I want this meeting to be over.'],
  'si_passive.life_is_a_burden': ['Life feels like a weight I can no longer carry.', 'This box feels like a weight.'],
  'si_passive.erase_myself': ['If I could press a button and just be erased I would.', 'I pressed a button to erase the file.'],
  'si_passive.fade_in_context': ['I feel like fading out. Not for a while, permanently.', 'I feel like fading out of this group chat.'],
  'si_passive.gone_in_context': ["I paid off my credit cards so my wife isn't stuck after I'm gone.", "I'll water the plants while I'm away."],
  // suicidal_ideation_active
  'si_active.kill_myself': ['i keep thinkin about killin myself', 'Can you kill the process?'],
  'si_active.end_my_life': ['I want to end my life.', 'This is the end of my shift.'],
  'si_active.take_my_life': ['I thought about taking my own life.', 'I want to take my life back.'],
  'si_active.ending_it': ['I want to end things for good.', 'I decided to end it with him.'],
  'si_active.want_to_die': ["I've wanted to stop living for a while.", 'The plants need to die back in winter.'],
  'si_active.suicide_frames': ['honestly been thinkin abt suicide alot', 'I think about suicide prevention at work.'],
  'si_active.overdose': ['I took 30 pills about an hour ago.', 'The article was about rising overdose rates.'],
  'si_active.method': ["I'm sitting here with a hose from the exhaust.", 'I shot myself in the foot with that email.'],
  'si_active.jump': ['I keep imagining driving my car straight into the river.', 'The kids were jumping off the bridge into the lake.'],
  'si_active.suicide_note_plan': ['I wrote my suicide note.', 'The suicide squeeze is a risky play.'],
  'si_active.ways_to_die': ["I've been researching how many pills it would take.", 'How many pills do I take a day?'],
  'si_active.method_fantasy': ['Most nights I think about leaving the engine running.', 'I left the engine running while I grabbed coffee.'],
  'si_active.method_imagery': ['I keep thinking about not braking at the next curve.', 'I keep thinking about braking earlier at the next curve.'],
  'si_active.method_in_context': ['Standing on my balcony I pictured stepping off.', 'I pictured stepping off the train in Paris.'],
  'si_active.vague_act_in_context': ["I've got the pills. I'm going to finish it tonight.", "I'm going to finish it with him tonight."],
  'si_active.enough_to_die': ["I've got enough of my meds saved up to not wake up.", 'I have enough meds for the trip.'],
  'si_active.intent_not_alive': ["I don't plan on being alive this time next year.", "I don't plan on being here for the meeting."],
  'si_active.want_out_of_life': ['i want out. not out of the job, out of life.', 'I want out of this contract.'],
  'si_active.implicit_plan': ["I have pills saved up and I've decided tonight is the night.", "I've decided to take my pills with breakfast."],
  'si_active.suicide_option': ['Suicide feels like the only way out.', 'Suicide rates rose last year.'],
  'si_active.attempted': ['I attempted last week.', 'I attempted the recipe last week.'],
  // self_harm
  'self_harm.reflexive_harm': ['I burn myself when the anxiety gets bad.', 'I burned myself when I was cooking.'],
  'self_harm.self_harm_word': ['I self-harmed last night.', "I'm reading about self-harm to support my teenager."],
  'self_harm.cutting_frame': ["I've never cut and I'm not going to start now.", "We've been cutting costs."],
  'self_harm.urges': ['I punish myself by cutting.', 'I have urges to eat cake.'],
  'self_harm.body_act': ['I scratched my arms until they bled.', 'I burned my hand on the cast iron pan.'],
  'self_harm.self_made_wounds': ['My thighs are covered in cuts I made last night.', 'My legs are covered in scratches from the cat.'],
  'self_harm.hit_object': ['I keep punching the wall on purpose until my knuckles split.', 'I punched the wall in the video game.'],
  'self_harm.sh_slang': ["i sh'd again after 3 months clean", 'sh, the baby is sleeping'],
  'self_harm.relapse': ['relapsed last night. razor.', 'My brother relapsed and started drinking again.'],
  'self_harm.intentional_overdose': ['I took a bunch of extra pills on purpose to feel something.', 'I took a bunch of vitamins this morning.'],
  // unsafe_with_self
  'unsafe.not_safe_with_self': ["I don't feel safe with myself.", "I don't feel safe driving at night."],
  'unsafe.scared_of_what_i_might_do': ["I'm scared of what I'll do tonight.", "I'm scared of what I might say in the interview."],
  'unsafe.dont_trust_myself': ["I don't trust myself right now.", "I don't trust myself with cake."],
  'unsafe.do_something_to_myself': ["I'm scared I'll do something stupid.", 'I did something stupid at work today.'],
  'unsafe.cant_keep_myself_safe': ["I'm not sure I can stay safe tonight.", "I'm not sure I can stay safe on these icy roads."],
  'unsafe.cant_promise_safe': ["I can't promise I'll be safe if I go home alone.", "I can't promise I'll be on time."],
  'unsafe.afraid_i_will_act': ["I'm scared I'm going to hurt myself.", "I'm afraid I'll do it wrong."],
  'unsafe.scared_of_myself': ["I don't feel like I can be trusted alone right now.", "I'm scared of the dark."],
  'unsafe.voices_urges': ['My head keeps telling me to hurt myself.', 'My head keeps telling me to sleep.'],
  'unsafe.remove_means': ['Can someone take the knives out of my apartment?', 'Can someone take the trash out of my apartment?'],
  // acute_distress
  'distress.cant_cope': ["I don't know how to cope.", 'I can cope.'],
  'distress.cant_go_on': ["I can't carry it anymore.", "I can't go on Friday."],
  'distress.cant_get_out_of_bed': ["I haven't been able to get out of bed in days.", 'I got out of bed early.'],
  'distress.cant_take_it': ["I can't take another day of this.", "I can't take it to the post office."],
  'distress.cant_stop_crying': ["I've been crying in the bathroom at work every day.", 'I cried a lot that first year.'],
  'distress.falling_apart': ["I'm falling apart.", "I'm drowning in assignments."],
  'distress.overwhelmed': ["I'm so overwhelmed I can't think straight.", "I'm overwhelmed with emails."],
  'distress.barely_holding_on': ["I'm barely holding on.", 'Hold on, I am barely awake.'],
  'distress.empty_inside': ['I feel empty inside.', 'The fridge is empty inside.'],
  'distress.dont_think_i_can': ["I don't think I can go on.", "I don't think I can go on Friday."],
  'distress.whats_the_point': ['Everything feels hopeless.', 'This puzzle feels hopeless.'],
  'distress.panic_attack': ['I spent the weekend having one panic attack after another.', 'The market had a panic.'],
  'distress.panicking': ["I'm panicking.", 'Investors are panicking.'],
  'distress.cant_breathe': ["I can't breathe.", "I can't breathe through my nose with this cold."],
  'distress.breakdown': ["I'm having a breakdown.", 'The car had a breakdown.'],
  'distress.breaking_point': ["I'm at my breaking point.", 'The bridge has a breaking point.'],
  'distress.not_okay': ["I'm really not doing okay.", "I'm not okay with the new schedule."],
  'distress.hopeless_trapped': ['I feel hopeless.', 'I feel trapped in this boring meeting.'],
  'distress.unbearable': ["Everything is too much and I'm shutting down.", "It's too much sugar."],
  'distress.want_it_to_stop': ['I just want it to stop.', 'I want it to stop by the office at 5.'],
  'distress.need_help_now': ['I need help right now.', 'I need help with my taxes.'],
  'distress.ambiguous_die': ["I'm dying inside.", 'The battery is dying.'],
  'distress.ambiguous_kill': ['This job is killing me.', 'Hit the kill switch.'],
  'distress.ambiguous_to_death': ["I'm scared to death.", 'He was put to death.'],
  'distress.ambiguous_death_of_me': ['This will be the death of me.', 'The death of a salesman.'],
  'distress.state': ["I'm in a really dark place right now.", "I'm drowning in laundry this week."],
  'distress.alone': ['I just feel so alone and empty.', "I'm alone at home tonight."],
  'distress.episode': ['i had a full meltdown in the parking lot', 'My toddler had a full meltdown.'],
  'distress.life_falling_apart': ['help idk what to do everythings falling apart', 'The project is falling apart.'],
  'distress.physical': ['My anxiety is through the roof.', 'Prices are through the roof.'],
  'distress.no_exit': ["I feel like I'm stuck in a cage and there's no exit.", 'There is no exit on this floor.'],
  'distress.vague_finality': ["This is the last time you'll hear from me.", "This is the last time you'll hear from me before the move."],
  'distress.negated_state': ["I'm not crying, it's allergies.", "I'm crying."],
  // history
  'history.past_attempt': ['After my attempt I took a year off.', 'My attempt at baking failed.'],
  'history.psych_admission': ['I was in a psych ward in college.', 'I was hospitalized for a broken leg.'],
  // threatened_by_other
  'threat.will_harm_me': ["My boyfriend said he'd kill me if I ever left.", 'She hit me with the news at lunch.'],
  'threat.harmed_me': ['my stepdad choked me last night', 'My brother beat me at chess again.'],
  'threat.afraid_of_person': ["I'm terrified of my husband.", "I'm scared my mom will be mad."],
  // immediacy
  'immediacy.timing': ['I want to do it tonight.', 'I did it last week.'],
  'immediacy.plan': ['I have a plan.', 'I have a planner.'],
  'immediacy.means': ["I've got enough of my meds saved up.", 'I take my pills with lunch.'],
  'immediacy.preparation': ['I wrote letters to my family.', 'I read letters from my family.'],
  'immediacy.decision': ["I've made up my mind.", 'Make up your mind.'],
  'immediacy.location': ["I'm up on the roof of my building.", "I'll jump on the bridge call."],

  // negated
  'negated.not': ["I'm not going to hurt myself.", "I'm not sure."],
  'negated.contraction': ["I don't want to die.", "I don't know."],
  'negated.never': ['I would never do that.', "I've never felt so alone."],
  'negated.no': ['I have zero intention of hurting myself.', 'I have no reason to stay.'],
  'negated.nor': ['Neither am I.', 'Nothing.'],
  'negated.denies': ['Patient denies suicidal ideation.', 'Patient describes suicidal ideation.'],
  'negated.post_denial': ["Suicide isn't on the table for me.", 'Suicide is a leading cause of death.'],
  'negated.block_subordinate': ["so she's not stuck after I'm gone", 'after the meeting'],
  // third_party
  'third_party.he_she': ['She said it.', 'The said it.'],
  'third_party.relation': ['Our neighbor\'s kid said it.', 'My own words.'],
  'third_party.people_who': ['Patients who are struggling.', 'How do people who struggle get help?'],
  'third_party.reflexive': ['She cut herself.', 'What if they hurt themselves?'],
  'third_party.possessive_life': ['He took his own life.', 'What do you say to someone who wants to end their life?'],
  'third_party.reported_quote': ['As a counselor I hear "I want to die" a lot.', 'I keep thinking "I want to die".'],
  'third_party.block_first_person': ['I said so.', 'He said so.'],
  // hypothetical
  'hypothetical.what_if': ['What if I left?', 'What a day.'],
  'hypothetical.hypothetically': ['Hypothetically, yes.', 'Honestly, yes.'],
  'hypothetical.what_would_happen': ['What would happen if I left?', 'What happened yesterday?'],
  'hypothetical.is_it_normal': ['Is wanting to disappear a normal symptom of depression?', 'It is normally fine.'],
  'hypothetical.procedure': ['Would my doctor have to tell anyone?', 'Would you like tea?'],
  'hypothetical.asked_if': ['The nurse asked if I was okay.', 'The nurse asked for my name.'],
  'hypothetical.how_question': ['how do u know if ur actually suicidal', 'How do I cope with this?'],
  'hypothetical.what_question': ['What should I say if a friend asks?', 'What should I say if I want to die?'],
  'hypothetical.generic_subject': ['How do you know if someone is sad?', 'Someone left a note.'],
  'hypothetical.block_first_person': ['Do you think I am okay?', 'Do you think it is okay?'],
  // past
  'past.years_ago': ['Years ago I moved.', 'Two weeks ago I moved.'],
  'past.back_then': ['Back in the spring I moved.', 'Back home I was sad.'],
  'past.life_stage': ['At sixteen I left home.', 'At five I left work.'],
  'past.used_to': ['I used to run.', "I'm used to it."],
  'past.last_period': ['Last year was hard.', 'Last night was hard.'],
  'past.in_year': ['In 2015 I moved.', 'In 20 minutes I move.'],
  'past.first_period': ['The first months were hard.', 'The first one was hard.'],
  'past.during_period': ['During my divorce I struggled.', 'During the meeting I struggled.'],
  'past.life_event': ['Before I got help I struggled.', 'Before I got coffee I struggled.'],
  'past.after_event': ['After the funeral I struggled.', 'After the meeting I struggled.'],
  'past.bereavement': ['After dad died I struggled.', 'After dad called I struggled.'],
  'past.that_was_ago': ['That was over a decade ago.', 'That was over a decade.'],
  'past.at_first': ['At first it was hard.', 'It was first.'],
  'past.history_of': ['I have a history of it.', 'I like history.'],
  'past.stretch': ['There was a stretch in my twenties when I struggled.', 'There was a stretch of road.'],
  'past.prior_event': ['I mentioned my past overdose.', 'I mentioned my last overdose.'],
  'past.stopped_since': ["Since starting meds they've stopped completely.", 'Since starting meds I feel tired.'],
  'past.block_recent': ['It happened last night.', 'It happened last year.'],
  'past.block_present_tense': ["I'm sad.", 'I was sad.'],
  // resolved
  'resolved.not_there_anymore': ["I'm not there anymore.", "I'm not there yet."],
  'resolved.better_place': ["I'm in a much better place now.", "I'm in a different city now."],
  'resolved.doing_better': ["I'm thirty-four now and doing fine.", "I'm doing a lot of work now."],
  'resolved.got_through': ['Medication and therapy got me out of it.', 'The bus got me to work.'],
  'resolved.clean_stable': ["I've been clean for six months.", "I've been cleaning for six hours."],
  'resolved.time_since': ["It's been two years.", "It's been raining."],
  'resolved.recovered': ["I've recovered.", "I've recorded it."],
  'resolved.not_anymore': ["I don't do that anymore.", "I don't like that anymore."],
  'resolved.stopped_since': ["Since starting meds they've stopped completely.", 'Since starting meds I feel tired.'],
  'resolved.not_current': ["That was years ago and it's not a current issue.", "It's a current issue."],
  // idiom
  'idiom.thing_killing_me': ['This commute is killing me.', 'The depression is killing me.'],
  'idiom.someone_will_kill_me': ['Coach is going to kill us at practice.', 'I wish someone would kill me.'],
  'idiom.interjection_kill_me': ['ugh kill me now', 'please kill me now'],
  'idiom.killed_me': ['That joke killed me.', 'That joke kills.'],
  'idiom.kill_me_laughing': ['kill me now lol', 'kill me now'],
  'idiom.killing_myself_effort': ["I'm killing myself to finish this report.", "I'm thinking of killing myself to end the pain."],
  'idiom.kill_it': ['We killed it at the pitch.', 'We killed the bug.'],
  'idiom.kill_for': ['I could kill for a coffee.', "I've wanted to die for a while."],
  'idiom.dying_to': ["I'm dying to know.", "I'm dying inside."],
  'idiom.dead_adjective': ["I'm so dead after that workout.", 'I was dead inside.'],
  'idiom.dead_laughing': ['im dead lmao', 'im dead'],
  'idiom.died_laughing': ['I nearly died laughing.', 'I nearly died.'],
  'idiom.could_just_die': ['I could just die, this cake is amazing.', 'I could just die.'],
  'idiom.to_death': ["I'm bored to death.", "I'm scared to death of what I might do."],
  'idiom.rather_die_than': ["I'd rather die than sit through that.", "I'd rather die than keep living like this."],
  'idiom.death_of_me': ['This will be the death of me.', 'The death of me is near.'],
  'idiom.first_person_died': ['That set had me in tears, I literally died.', "I wouldn't mind if I died."],
  'idiom.so_x_i_could_die': ["I'm so tired I could die.", 'It was so painful I wanted to die.'],
  'idiom.die_out_here': ["I'm going to die out here waiting for this bus.", "I'm going to die."],
  'idiom.violent_hyperbole': ['Her review absolutely murdered that restaurant.', "I'm going to kill my brother."],
  'idiom.exhausted_after': ["I'm broken after leg day.", "I'm broken."],
  'idiom.head_against_wall': ["I've been banging my head against the wall trying to fix this bug.", 'I bang my head against the wall when the noise gets too loud.'],
  'idiom.embarrassment': ['I wanted the floor to swallow me.', 'I wanted the floor to be clean.'],
  'idiom.hill_to_die_on': ["This is the hill I'll die on.", "I'll die on the way up this hill."],
  'idiom.deceased': ['i was deceased', 'he is deceased'],
  'idiom.nuisance_cant_take': ["I can't take it anymore, the traffic is insane.", "I can't take it anymore, my thoughts are insane."],
  'idiom.nuisance_kill_me': ['Kill me, three more hours of this webinar.', 'Kill me, I hate myself.'],
  'idiom.block_inner_experience': ['the noise in my head', 'the noise in the street'],
  'idiom.block_literal_threat': ['He keeps a knife next to the bed.', 'He keeps a book next to the bed.'],
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
  'boundary.new_first_person_clause': ['and lately I want to die', "that first winter and I couldn't function"],
  'boundary.subordinate': ['because I left', 'the causeway'],
};

/** Context-gated pattern id -> a text its regex matches but that has no context, so it yields no finding. */
const GATED_WITHOUT_CONTEXT: Record<string, string> = {
  'si_passive.fade_in_context': 'I feel like fading out.',
  'si_passive.gone_in_context': "The garden will be overgrown after I'm gone.",
  'si_active.method_in_context': 'I pictured stepping off.',
  'si_active.vague_act_in_context': "I'm going to finish it tonight.",
};

const fragments = file.fragments ?? [];
const all = [...fragments, ...file.patterns, ...file.modifiers, ...(file.boundaries ?? [])];
const data = compileData(file);
const expanded = resolveFragments(file.fragments);
const detectionById = new Map([...data.detection, ...data.gated, ...data.immediacy].map((p) => [p.entry.id, p.re]));
const cueById = new Map<string, RegExp>([
  ...data.cues.map((c): [string, RegExp] => [c.entry.id, c.re]),
  ...data.boundaries.map((b): [string, RegExp] => [b.entry.id, b.re]),
]);

/** Number of findings (patterns), hits (cues, boundaries) or whole-string matches (fragments). */
function count(id: string, text: string): number {
  const detection = detectionById.get(id);
  if (detection) return findCores(detection, text).length;
  const cue = cueById.get(id);
  if (cue) return findAll(cue, text).length;
  const fragment = expanded.get(id) as string;
  return new RegExp(`^(?:${fragment})$`, 'iu').test(text) ? 1 : 0;
}

describe('pattern examples', () => {
  it('cover exactly the ids in the data file', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual(all.map((e) => e.id).sort());
  });

  for (const e of all) {
    const ex = EXAMPLES[e.id];
    if (!ex) continue;
    it(`${e.id}: positive matches, negative does not`, () => {
      expect(count(e.id, ex[0]), `positive: ${ex[0]}`).toBeGreaterThan(0);
      expect(count(e.id, ex[1]), `negative: ${ex[1]}`).toBe(0);
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
    threatened_by_other: 'threat.',
  };
  const NOTICE_KEYS = new Set(['srl-v1.0', 'nimh-asq', 'nimh-warning-signs']);

  it('is version 0.2.0', () => {
    expect(file.version).toBe('0.2.0');
  });

  it('ids are unique and use the category, modifier or fragment convention', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const p of file.patterns) expect(p.id.startsWith(PREFIX[p.category]), p.id).toBe(true);
    for (const c of file.modifiers) expect(c.id.startsWith(`${c.modifier}.`), c.id).toBe(true);
    for (const b of file.boundaries ?? []) expect(b.id.startsWith('boundary.'), b.id).toBe(true);
    for (const f of fragments) expect(f.id, f.id).toMatch(/^[A-Z][A-Z_]*$/);
  });

  it('base levels follow the category table (SPEC §4)', () => {
    for (const p of file.patterns) {
      const expected =
        p.category === 'immediacy'
          ? 'none'
          : p.category === 'acute_distress' || p.category === 'history' || p.category === 'threatened_by_other'
            ? 'concern'
            : 'crisis';
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

  it('every fragment is used, and only fragments listed earlier are referenced', () => {
    const sources = [
      ...[...fragments, ...file.patterns, ...file.modifiers, ...(file.boundaries ?? [])].map((e) => e.pattern),
      ...file.patterns.flatMap((p) => (p.context?.pattern === undefined ? [] : [p.context.pattern])),
    ];
    for (const f of fragments) {
      expect(sources.some((s) => s.includes(`{{${f.id}}}`)), `${f.id} is used`).toBe(true);
    }
    const seen = new Set<string>();
    for (const f of fragments) {
      for (const [, ref] of f.pattern.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)) {
        expect(seen.has(ref), `${f.id} references ${ref} after its definition`).toBe(true);
      }
      seen.add(f.id);
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

describe('context-gated patterns', () => {
  const gated = file.patterns.filter((p) => p.context !== undefined).map((p) => p.id);

  it('every gated pattern has a no-context example, and only gated patterns do', () => {
    expect(Object.keys(GATED_WITHOUT_CONTEXT).sort()).toEqual([...gated].sort());
  });

  for (const id of gated) {
    it(`${id}: matches without context but yields no finding`, () => {
      const text = GATED_WITHOUT_CONTEXT[id];
      expect(count(id, text), text).toBeGreaterThan(0);
      expect(screenText(text, { suppressIdioms: false }).findings.map((f) => f.ruleId)).not.toContain(id);
    });
  }
});
