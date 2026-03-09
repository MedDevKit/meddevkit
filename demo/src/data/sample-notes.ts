export const SIMPLE_NOTE = `CHIEF COMPLAINT: Chest pain

VITAL SIGNS:
BP: 120/80 mmHg
HR: 72 bpm
RR: 16
T: 98.6°F
O2 sat: 98% on room air

HISTORY OF PRESENT ILLNESS:
Patient is a 55 year old male presenting with chest pain for the past 2 days.
Pain is described as pressure-like, substernal, radiating to left arm.
No shortness of breath. No diaphoresis. No nausea or vomiting.

ASSESSMENT AND PLAN:
1. Chest pain - likely musculoskeletal given normal vital signs
   - Continue current medications
   - Follow up in 1 week`;

export const NOTE_WITH_PHI = `PATIENT INFORMATION:
Name: John Smith
DOB: 01/15/1960
MRN: 12345678
Phone: (555) 123-4567
Email: jsmith@email.com

CHIEF COMPLAINT: Follow-up visit

HISTORY:
Patient last seen on March 15, 2024 for annual physical.
Mr. Smith reports feeling well overall. No new complaints.

VITAL SIGNS:
BP: 128/78 mmHg
HR: 68 bpm
T: 98.4°F
O2 sat: 99% on room air

ASSESSMENT:
1. Annual wellness visit - patient is doing well
2. Continue current medications
3. Follow up in 12 months`;

export const LONG_NOTE = `PATIENT INFORMATION:
Name: Margaret Chen
DOB: 03/22/1961
MRN: 78432156
SSN: ***-**-4829
Phone: (555) 867-5309
Email: mchen@outlook.com
Address: 742 Evergreen Drive, Springfield, IL 62704
Insurance: Blue Cross Blue Shield, Policy #BCB-9927441
Emergency Contact: David Chen (spouse) - (555) 867-5310
Primary Care: Dr. Rebecca Patel, Springfield Medical Group
Visit Date: 03/08/2026
Visit Type: Follow-up, Established Patient

CHIEF COMPLAINT: Multiple complaints including fatigue, headaches, and joint stiffness

VITAL SIGNS:
BP: 138/82 mmHg
HR: 76 bpm
RR: 14 breaths/min
T: 98.2°F
O2 sat: 97% on room air
Weight: 168 lbs
Height: 5'4"
BMI: 28.8
Pain: 5/10

HISTORY OF PRESENT ILLNESS:
Patient is a 65 year old female with a complex medical history presenting today with multiple concerns. Mrs. Chen was last seen on September 14, 2025 for routine follow-up.

The patient reports ongoing fatigue for the past 3 months. She describes feeling tired throughout the day despite adequate sleep. She sleeps approximately 8 hours per night but wakes up feeling unrested. No sleep apnea symptoms. No snoring per family. No recent changes in weight.

Additionally, the patient reports intermittent headaches occurring 2-3 times per week. Headaches are bilateral, throbbing in nature, rated 5/10 in severity. No visual changes. No nausea or vomiting with headaches. Over-the-counter analgesics provide partial relief.

The patient also notes joint stiffness, particularly in the morning. Stiffness primarily affects the hands and knees. Duration is approximately 30 minutes each morning. No significant joint swelling or redness observed by patient.

PAST MEDICAL HISTORY:
1. Type 2 Diabetes Mellitus - diagnosed 2015
2. Hypertension - diagnosed 2010
3. Hyperlipidemia - diagnosed 2012
4. Osteoarthritis - diagnosed 2018
5. Hypothyroidism - diagnosed 2020

PAST SURGICAL HISTORY:
1. Cholecystectomy - 2008
2. Right knee arthroscopy - 2019

MEDICATIONS:
1. Metformin 1000mg twice daily
2. Lisinopril 20mg daily
3. Atorvastatin 40mg daily
4. Levothyroxine 75mcg daily
5. Acetaminophen 650mg as needed

ALLERGIES:
Penicillin - rash

FAMILY HISTORY:
Father - deceased, heart disease
Mother - alive, Type 2 Diabetes
Brother - alive, hypertension

SOCIAL HISTORY:
Non-smoker. Occasional alcohol use. Retired teacher. Lives at 742 Evergreen Drive.

REVIEW OF SYSTEMS:
Constitutional: Fatigue as noted above. No fever or chills.
HEENT: Headaches as noted. No vision changes. No hearing loss.
Cardiovascular: No chest pain. No palpitations. No edema.
Respiratory: No shortness of breath. No cough.
Gastrointestinal: No abdominal pain. Regular bowel movements.
Musculoskeletal: Joint stiffness as noted. No muscle weakness.
Neurologic: No numbness or tingling. No weakness.
Psychiatric: No depression. No anxiety.

PHYSICAL EXAMINATION:
General: Well-appearing female in no acute distress
Vital Signs: See above, BP slightly elevated
HEENT: Normocephalic, atraumatic. PERRLA. EOMI.
Neck: Supple. No lymphadenopathy. Thyroid normal.
Cardiovascular: Regular rate and rhythm. No murmurs.
Lungs: Clear to auscultation bilaterally.
Abdomen: Soft, non-tender. No hepatosplenomegaly.
Extremities: No edema. No joint swelling.
Neurologic: Alert and oriented x3. CN II-XII intact.

ASSESSMENT:
1. Fatigue - likely multifactorial
2. Tension headaches
3. Osteoarthritis with morning stiffness
4. Type 2 Diabetes - stable
5. Hypertension - slightly elevated today
6. Hypothyroidism - on replacement therapy

PLAN:
1. Order CBC, CMP, TSH, HbA1c, Vitamin D, B12
2. Consider sleep study if fatigue persists
3. Continue current headache management
4. Physical therapy referral for osteoarthritis
5. Continue current diabetes and hypertension management
6. Return visit in 4-6 weeks with lab results
7. Follow up with Dr. Patel if symptoms worsen

Electronically signed by Dr. Rebecca Patel on 03/08/2026`;

export const VITALS_NOTE = `EMERGENCY DEPARTMENT NOTE

CHIEF COMPLAINT: Shortness of breath

VITAL SIGNS:
BP: 158/94 mmHg
HR: 108 bpm
RR: 24
T: 101.2°F
O2 sat: 91% on room air

HISTORY OF PRESENT ILLNESS:
Patient is a 72 year old male presenting with acute shortness of breath for the past 6 hours. Patient reports progressive dyspnea at rest. Denies chest pain. Denies hemoptysis. No recent travel or immobilization.

Past medical history significant for CHF (EF 35%), COPD, and atrial fibrillation.

PHYSICAL EXAMINATION:
General: Elderly male in mild respiratory distress
Blood pressure 162/96 on recheck
Heart rate 112 beats per minute on recheck
Respiratory rate 22/min on recheck
Temperature 37.8 C on recheck
SpO2: 93% on 2L NC

Cardiovascular: Irregularly irregular. No murmurs. JVD present.
Lungs: Bilateral crackles, right greater than left. No wheezes.
Extremities: 2+ bilateral lower extremity edema.

ASSESSMENT AND PLAN:
1. Acute on chronic systolic heart failure exacerbation
   - IV Furosemide 40mg
   - Strict I&O
   - Daily weights
   - Repeat vitals in 2 hours: target BP <140/90, HR <100
2. COPD - continue home inhalers
3. Atrial fibrillation with rapid ventricular response
   - Rate control with IV diltiazem`;

export const NEGATIONS_NOTE = `HISTORY OF PRESENT ILLNESS:
Patient presents with abdominal pain for the past 24 hours. She denies any nausea or vomiting. No fever or chills reported. Patient denies chest pain or shortness of breath. Denies any urinary symptoms. No diarrhea or constipation.

VITAL SIGNS:
BP: 124/76 mmHg
HR: 82 bpm
RR: 16
T: 98.8°F
O2 sat: 99% on room air

PHYSICAL EXAMINATION:
Abdomen is soft with no rebound tenderness. No guarding present. Bowel sounds are normal. No masses palpated. No hepatosplenomegaly.

ASSESSMENT:
1. Abdominal pain - likely gastritis
   - Ruled out appendicitis based on clinical presentation
   - Negative for peritonitis
   - No evidence of obstruction
2. Denies any allergies to medications
3. Pain scale 4/10, without radiation`;

export type PresetKey = 'complex' | 'phi' | 'simple' | 'vitals' | 'negations';

export const PRESETS: Record<PresetKey, { label: string; note: string; description: string }> = {
  complex: {
    label: 'Complex Note',
    note: LONG_NOTE,
    description: '65 y/o female, 12+ sections, vitals, PHI, negations',
  },
  phi: {
    label: 'PHI Note',
    note: NOTE_WITH_PHI,
    description: 'Name, DOB, MRN, phone, email markers',
  },
  simple: {
    label: 'Simple',
    note: SIMPLE_NOTE,
    description: 'Basic visit with vitals and assessment',
  },
  vitals: {
    label: 'Vitals',
    note: VITALS_NOTE,
    description: 'ED note with multiple vital sign formats',
  },
  negations: {
    label: 'Negations',
    note: NEGATIONS_NOTE,
    description: 'Denials, rule-outs, and negative findings',
  },
};
