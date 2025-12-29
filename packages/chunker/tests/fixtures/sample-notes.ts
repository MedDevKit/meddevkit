/**
 * Sample Clinical Notes for Testing
 *
 * These are synthetic clinical notes for testing purposes only.
 * No real patient data is included.
 */

/**
 * Simple clinic visit note with vital signs
 */
export const SIMPLE_NOTE = `
CHIEF COMPLAINT: Chest pain

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
   - Follow up in 1 week
`.trim();

/**
 * Note with PHI markers
 */
export const NOTE_WITH_PHI = `
PATIENT INFORMATION:
Name: John Smith
DOB: 01/15/1960
MRN: 12345678
Phone: (555) 123-4567
Email: jsmith@email.com

CHIEF COMPLAINT: Follow-up visit

HISTORY:
Patient last seen on March 15, 2024 for annual physical.
`.trim();

/**
 * Long note requiring multiple chunks
 */
export const LONG_NOTE = `
CHIEF COMPLAINT: Multiple complaints

HISTORY OF PRESENT ILLNESS:
Patient is a 65 year old female with a complex medical history presenting today with multiple concerns.

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
Non-smoker. Occasional alcohol use. Retired teacher.

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
Vital Signs: BP 138/82 mmHg, HR 76 bpm, RR 14, T 98.2°F, O2 sat 97% on RA
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
`.trim();

/**
 * Note with negations
 */
export const NOTE_WITH_NEGATIONS = `
HISTORY OF PRESENT ILLNESS:
Patient presents with abdominal pain. She denies any nausea or vomiting.
No fever or chills. Patient denies chest pain or shortness of breath.
Rules out pregnancy - patient is post-menopausal.

PHYSICAL EXAM:
Abdomen is soft with no rebound tenderness. No guarding present.
Bowel sounds are normal. No masses palpated.

ASSESSMENT:
Abdominal pain - likely gastritis
Ruled out appendicitis based on clinical presentation
Negative for peritonitis
`.trim();

/**
 * Note with various vital sign formats
 */
export const VITALS_VARIATIONS = `
Different vital sign formats for testing:

Standard format:
BP: 120/80 mmHg
HR: 72 bpm
Temp: 98.6 F
SpO2: 98%

Alternative formats:
Blood pressure 138/82
Heart rate 76 beats per minute
Temperature 37.0 C
Oxygen saturation 97% on room air
Respiratory rate 16/min

Abbreviated:
B/P 140/90
HR 80
T 99.1°F
RR 18
O2 sat 96% on 2L NC
`.trim();
