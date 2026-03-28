/**
 * Scholarship Ceremony Seed Data Generator
 *
 * Generates 18 donors and 200 scholarship recipients with realistic data,
 * plus relationship groups linking donors to their scholarship recipients.
 *
 * Run via the "Load Scholarship Test Data" button on the Welcome/Settings page,
 * or call loadScholarshipSeedData() from the store.
 */

import type { Guest, RelationshipGroup, RelationshipMembership } from '@/types/events';

// ─── Donor Fund Definitions ─────────────────────────────────────────────────

interface DonorDef {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  organization: string;
  donationAmount: string;
  annualAmount: number;
  fundName: string;
  recipientCount: number;
  partySize: number;
  rsvpStatus: Guest['rsvpStatus'];
  dietary: string;
  accessibility: string;
  tablePreference: string;
}

const DONOR_DEFS: DonorDef[] = [
  { firstName: 'Margaret', lastName: 'Thornton', displayName: 'Margaret & Richard Thornton', email: 'margaret.thornton@thorntonfoundation.org', phone: '(555) 201-1001', organization: 'Thornton Family Foundation', donationAmount: '$500,000', annualAmount: 50000, fundName: 'Thornton Excellence Scholarship', recipientCount: 15, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: 'Near stage' },
  { firstName: 'James', lastName: 'Wu', displayName: 'James & Patricia Wu', email: 'james.wu@wutechgroup.com', phone: '(555) 201-1002', organization: 'Wu Technology Group', donationAmount: '$250,000', annualAmount: 25000, fundName: 'Wu STEM Innovation Award', recipientCount: 12, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Eleanor', lastName: 'Voss', displayName: 'Dr. Eleanor Voss', email: 'evoss@vossmedical.org', phone: '(555) 201-1003', organization: 'Voss Medical Foundation', donationAmount: '$300,000', annualAmount: 30000, fundName: 'Voss Health Sciences Scholarship', recipientCount: 14, partySize: 1, rsvpStatus: 'confirmed', dietary: 'Vegetarian', accessibility: '', tablePreference: '' },
  { firstName: 'Robert', lastName: 'Kim', displayName: 'Robert & Linda Kim', email: 'robert.kim@kimtrust.org', phone: '(555) 201-1004', organization: 'Kim Family Trust', donationAmount: '$150,000', annualAmount: 15000, fundName: 'Kim Community Leaders Scholarship', recipientCount: 10, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: 'Near entrance' },
  { firstName: 'Charles', lastName: 'Harrington', displayName: 'The Harrington Estate', email: 'estate@harringtonfoundation.org', phone: '(555) 201-1005', organization: 'Harrington Estate Foundation', donationAmount: '$1,000,000 endowment', annualAmount: 100000, fundName: 'Harrington Legacy Scholarship', recipientCount: 18, partySize: 3, rsvpStatus: 'confirmed', dietary: 'Gluten-free', accessibility: '', tablePreference: 'Near stage' },
  { firstName: 'Maria', lastName: 'Gonzalez', displayName: 'Maria & Carlos Gonzalez', email: 'maria@gonzalezindustries.com', phone: '(555) 201-1006', organization: 'Gonzalez Industries', donationAmount: '$200,000', annualAmount: 20000, fundName: 'Gonzalez First-Generation Scholarship', recipientCount: 13, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'William', lastName: 'Hayes', displayName: 'William & Susan Hayes', email: 'whayes@hayesconsulting.com', phone: '(555) 201-1007', organization: 'Hayes Consulting Group', donationAmount: '$175,000', annualAmount: 17500, fundName: 'Hayes Business Leadership Award', recipientCount: 11, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: 'Mobility aid required', tablePreference: 'Accessible seating' },
  { firstName: 'Priya', lastName: 'Patel', displayName: 'Dr. Priya Patel', email: 'priya@patelresearch.org', phone: '(555) 201-1008', organization: 'Patel Research Foundation', donationAmount: '$225,000', annualAmount: 22500, fundName: 'Patel Science Discovery Grant', recipientCount: 12, partySize: 1, rsvpStatus: 'confirmed', dietary: 'Vegetarian', accessibility: '', tablePreference: '' },
  { firstName: 'Thomas', lastName: 'Morrison', displayName: 'Thomas & Angela Morrison', email: 'tmorrison@morrisonconstruction.com', phone: '(555) 201-1009', organization: 'Morrison Construction', donationAmount: '$125,000', annualAmount: 12500, fundName: 'Morrison Trades & Engineering Scholarship', recipientCount: 10, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Jennifer', lastName: 'Chen', displayName: 'Jennifer & David Chen', email: 'jennifer@chenphilanthropy.org', phone: '(555) 201-1010', organization: 'Chen Family Philanthropy', donationAmount: '$350,000', annualAmount: 35000, fundName: 'Chen Arts & Humanities Scholarship', recipientCount: 14, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Samuel', lastName: 'Okafor', displayName: 'Samuel Okafor', email: 'sokafor@okaforglobal.com', phone: '(555) 201-1011', organization: 'Okafor Global Enterprises', donationAmount: '$180,000', annualAmount: 18000, fundName: 'Okafor International Studies Award', recipientCount: 11, partySize: 1, rsvpStatus: 'invited', dietary: 'Halal', accessibility: '', tablePreference: '' },
  { firstName: 'Barbara', lastName: 'Mitchell', displayName: 'Barbara & George Mitchell', email: 'bmitchell@mitchellbanking.com', phone: '(555) 201-1012', organization: 'Mitchell Banking Corp', donationAmount: '$275,000', annualAmount: 27500, fundName: 'Mitchell Financial Literacy Scholarship', recipientCount: 12, partySize: 2, rsvpStatus: 'confirmed', dietary: 'Kosher', accessibility: '', tablePreference: '' },
  { firstName: 'Aisha', lastName: 'Rahman', displayName: 'Dr. Aisha Rahman', email: 'arahman@rahmantrust.org', phone: '(555) 201-1013', organization: 'Rahman Education Trust', donationAmount: '$160,000', annualAmount: 16000, fundName: 'Rahman Teaching Excellence Scholarship', recipientCount: 10, partySize: 1, rsvpStatus: 'invited', dietary: 'Halal', accessibility: '', tablePreference: '' },
  { firstName: 'Frank', lastName: 'DeLuca', displayName: 'Frank & Maria DeLuca', email: 'frank@delucahospitality.com', phone: '(555) 201-1014', organization: 'DeLuca Hospitality Group', donationAmount: '$140,000', annualAmount: 14000, fundName: 'DeLuca Service Industry Scholarship', recipientCount: 9, partySize: 2, rsvpStatus: 'confirmed', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Yuki', lastName: 'Nakamura', displayName: 'The Nakamura Foundation', email: 'grants@nakamurafoundation.org', phone: '(555) 201-1015', organization: 'Nakamura Foundation', donationAmount: '$400,000', annualAmount: 40000, fundName: 'Nakamura Innovation Fellowship', recipientCount: 15, partySize: 3, rsvpStatus: 'declined', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Derek', lastName: 'Washington', displayName: 'Derek & Vanessa Washington', email: 'dwashington@washingtonmedia.com', phone: '(555) 201-1016', organization: 'Washington Media Group', donationAmount: '$190,000', annualAmount: 19000, fundName: 'Washington Communications Scholarship', recipientCount: 11, partySize: 2, rsvpStatus: 'invited', dietary: '', accessibility: '', tablePreference: '' },
  { firstName: 'Katherine', lastName: "O'Brien", displayName: "Katherine O'Brien", email: 'kobrien@obrienlegal.org', phone: '(555) 201-1017', organization: "O'Brien Legal Foundation", donationAmount: '$210,000', annualAmount: 21000, fundName: "O'Brien Justice & Law Scholarship", recipientCount: 12, partySize: 1, rsvpStatus: 'declined', dietary: 'Gluten-free', accessibility: '', tablePreference: '' },
  { firstName: 'Alan', lastName: 'Foster', displayName: 'Alan & Rebecca Foster', email: 'afoster@fosterag.org', phone: '(555) 201-1018', organization: 'Foster Agricultural Trust', donationAmount: '$165,000', annualAmount: 16500, fundName: 'Foster Environmental Sustainability Award', recipientCount: 11, partySize: 2, rsvpStatus: 'confirmed', dietary: 'Vegan', accessibility: '', tablePreference: '' },
];

// ─── Student Name Pool ──────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aaliyah','Abigail','Adeline','Adrian','Aiden','Alejandro','Alex','Amara','Amber','Amelia',
  'Ana','Andre','Andrew','Angela','Aniya','Anthony','Aria','Ariana','Arjun','Ashton',
  'Autumn','Ava','Avery','Bella','Benjamin','Blake','Brandon','Briana','Brooke','Caleb',
  'Cameron','Carlos','Carmen','Caroline','Carter','Catherine','Chloe','Christian','Christopher','Clara',
  'Claudia','Cole','Connor','Courtney','Crystal','Daisy','Daniel','David','Destiny','Diana',
  'Diego','Dominic','Dylan','Eduardo','Elena','Elijah','Elise','Elizabeth','Ella','Emily',
  'Emma','Enrique','Eric','Ethan','Eva','Evan','Faith','Fatima','Fernando','Gabriel',
  'Genesis','Grace','Hailey','Hannah','Hassan','Hayden','Henry','Hope','Hunter','Ibrahim',
  'Isaac','Isabella','Isaiah','Jade','Jaiden','James','Jasmine','Jason','Javier','Jayden',
  'Jenna','Jessica','Joanna','Jordan','Jose','Joshua','Julia','Julian','Justin','Kaitlyn',
  'Karen','Kayla','Kenji','Kennedy','Kevin','Khadija','Kiana','Kylie','Laila','Lauren',
  'Leah','Leonardo','Liam','Lily','Logan','Lucas','Lucy','Luis','Luna','Lydia',
  'Mackenzie','Madison','Malik','Marco','Maria','Mariana','Mario','Mason','Mateo','Maya',
  'Melanie','Mia','Michael','Michelle','Miguel','Mila','Morgan','Nadia','Naomi','Nathan',
  'Natalie','Nicholas','Nicole','Noah','Nora','Nyla','Olivia','Omar','Oscar','Owen',
  'Paige','Parker','Patricia','Patrick','Penelope','Peter','Priya','Quinn','Rachel','Rafael',
  'Raymond','Reagan','Rebecca','Riley','Robert','Rosa','Ryan','Sabrina','Sage','Samantha',
  'Samuel','Santiago','Sara','Savannah','Sebastian','Sierra','Sofia','Sophia','Stella','Stephanie',
  'Sydney','Talia','Tariq','Taylor','Theodore','Thomas','Tiana','Timothy','Trinity','Tyler',
  'Valentina','Valeria','Victoria','Vincent','Violet','Wesley','William','Xavier','Yasmin','Zachary',
];

const LAST_NAMES = [
  'Adams','Aguilar','Ahmed','Ali','Allen','Alvarez','Anderson','Armstrong','Bailey','Baker',
  'Banks','Barnes','Bautista','Bell','Bennett','Berry','Bishop','Blake','Boyd','Brennan',
  'Brooks','Brown','Bryant','Burke','Burns','Butler','Byrd','Cabrera','Campbell','Campos',
  'Carlson','Carpenter','Carter','Casey','Castro','Chambers','Chang','Chapman','Chavez','Clark',
  'Cohen','Coleman','Collins','Contreras','Cook','Cooper','Cortez','Crawford','Cruz','Cunningham',
  'Dalton','Daniels','Davis','Delgado','Diaz','Dixon','Dominguez','Douglas','Dunn','Edwards',
  'Ellis','Espinoza','Estrada','Evans','Fernandez','Fisher','Flores','Ford','Foster','Fox',
  'Freeman','Fuller','Garcia','Gibson','Gilbert','Gomez','Gonzalez','Gordon','Graham','Grant',
  'Gray','Green','Griffin','Guerrero','Gutierrez','Hall','Hamilton','Hansen','Harper','Harris',
  'Hart','Harvey','Hawkins','Hayes','Henderson','Henry','Hernandez','Herrera','Hicks','Hill',
  'Holmes','Howard','Huang','Hudson','Hughes','Hunt','Hunter','Jackson','James','Jenkins',
  'Jimenez','Johnson','Johnston','Jones','Jordan','Kang','Kelly','Kennedy','Khan','Kim',
  'King','Knight','Kumar','Lambert','Lane','Larson','Lawrence','Lee','Lewis','Li',
  'Lin','Long','Lopez','Luna','Lyons','Maldonado','Mann','Manning','Marquez','Marshall',
  'Martin','Martinez','Mason','Matthews','McBride','McCarthy','McCoy','McDonald','McGee','McKenzie',
  'Medina','Mendez','Meyer','Miller','Mills','Mitchell','Molina','Monroe','Montgomery','Moore',
  'Morales','Morgan','Morris','Morrison','Murphy','Murray','Myers','Navarro','Nelson','Newman',
  'Nguyen','Nichols','Norton','Nunez','Oliver','Ortega','Ortiz','Owens','Pacheco','Padilla',
  'Page','Palmer','Park','Parker','Patel','Patterson','Perez','Perry','Peters','Peterson',
  'Phillips','Pierce','Ponce','Porter','Powell','Price','Quinn','Ramirez','Ramos','Reed',
];

const MAJORS = [
  'Biology','Computer Science','Nursing','Business Administration','Psychology','Engineering',
  'English Literature','Chemistry','Mathematics','Political Science','Communications','Sociology',
  'Economics','Environmental Science','Education','Pre-Med','Kinesiology','Art History',
  'Music Performance','Criminal Justice','Social Work','Public Health','Accounting','Marketing',
  'Mechanical Engineering','Electrical Engineering','Civil Engineering','Data Science',
  'Graphic Design','Theater Arts','Philosophy','History','International Relations','Journalism',
  'Hospitality Management','Agriculture','Marine Biology','Anthropology','Linguistics','Architecture',
];

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Nut allergy', 'Gluten-free', 'Dairy-free', 'Shellfish allergy'];
const ACCESSIBILITY_OPTIONS = ['Wheelchair accessible seating', 'Hearing assistance needed', 'Visual assistance needed', 'Mobility aid - aisle seat preferred'];

// ─── Deterministic Seed Helpers ─────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ─── Generator ──────────────────────────────────────────────────────────────

function generateData() {
  const rand = seededRandom(42);

  const donors: Guest[] = [];
  const recipients: Guest[] = [];
  const groups: RelationshipGroup[] = [];
  const memberships: RelationshipMembership[] = [];

  const EVENT_ID = 'evt-001';
  const ORG_ID = 'org-001';
  let recipientIndex = 0;
  let membershipIndex = 0;

  // ── Build Donors ──────────────────────────────────────────────────────

  for (let d = 0; d < DONOR_DEFS.length; d++) {
    const def = DONOR_DEFS[d];
    const donorId = `donor-${String(d + 1).padStart(3, '0')}`;

    donors.push({
      id: donorId,
      orgId: ORG_ID,
      eventId: EVENT_ID,
      firstName: def.firstName,
      lastName: def.lastName,
      displayName: def.displayName,
      email: def.email,
      phone: def.phone,
      organization: def.organization,
      category: 'donor',
      rsvpStatus: def.rsvpStatus,
      partySize: def.partySize,
      dietaryRestrictions: def.dietary,
      accessibilityNeeds: def.accessibility,
      notes: `${def.donationAmount} donation | ${def.fundName} | $${(def.annualAmount).toLocaleString()}/yr in scholarships | ${def.recipientCount} recipients this year`,
      relationshipTags: ['donor', 'vip'],
      tablePreference: def.tablePreference,
      seatingPreference: `Near ${def.fundName} recipients`,
    });

    // ── Build Scholarship Group ─────────────────────────────────────────

    const groupId = `rg-scholarship-${String(d + 1).padStart(3, '0')}`;

    groups.push({
      id: groupId,
      eventId: EVENT_ID,
      orgId: ORG_ID,
      name: def.fundName,
      type: 'scholarship',
      color: `hsl(${(d * 20) % 360} 55% 48%)`,
      notes: `${def.displayName} — ${def.donationAmount} donation, $${def.annualAmount.toLocaleString()}/yr`,
      createdAt: '2026-01-15T10:00:00Z',
    });

    // Donor membership
    memberships.push({
      id: `rm-sch-${String(++membershipIndex).padStart(4, '0')}`,
      groupId,
      guestId: donorId,
      role: 'Donor',
    });

    // ── Build Recipients for This Fund ─────────────────────────────────

    const perStudentAward = Math.round(def.annualAmount / def.recipientCount);

    for (let r = 0; r < def.recipientCount; r++) {
      recipientIndex++;
      const recipId = `recip-${String(recipientIndex).padStart(3, '0')}`;
      const fi = (recipientIndex * 7 + d * 13) % FIRST_NAMES.length;
      const li = (recipientIndex * 11 + d * 3) % LAST_NAMES.length;
      const firstName = FIRST_NAMES[fi];
      const lastName = LAST_NAMES[li];
      const major = MAJORS[(recipientIndex * 3 + d) % MAJORS.length];

      // RSVP distribution: 65% confirmed, 17.5% invited, 7.5% declined, 5% waitlist, 5% checked_in
      const rsvpRoll = rand();
      let rsvpStatus: Guest['rsvpStatus'];
      if (rsvpRoll < 0.65) rsvpStatus = 'confirmed';
      else if (rsvpRoll < 0.825) rsvpStatus = 'invited';
      else if (rsvpRoll < 0.90) rsvpStatus = 'declined';
      else if (rsvpRoll < 0.95) rsvpStatus = 'waitlist';
      else rsvpStatus = 'checked_in';

      // Party size: 10% = 1, 60% = 2, 20% = 3, 10% = 4
      const psRoll = rand();
      let partySize: number;
      if (psRoll < 0.10) partySize = 1;
      else if (psRoll < 0.70) partySize = 2;
      else if (psRoll < 0.90) partySize = 3;
      else partySize = 4;

      // ~15% dietary
      const dietary = rand() < 0.15 ? DIETARY_OPTIONS[Math.floor(rand() * DIETARY_OPTIONS.length)] : '';

      // ~5% accessibility
      const accessibility = rand() < 0.05 ? ACCESSIBILITY_OPTIONS[Math.floor(rand() * ACCESSIBILITY_OPTIONS.length)] : '';

      // Seating preference — ~40% want to sit near their scholarship cohort
      const seatPref = rand() < 0.4 ? `Near other ${def.fundName} recipients` : '';

      recipients.push({
        id: recipId,
        orgId: ORG_ID,
        eventId: EVENT_ID,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@student.greenfield.edu`,
        phone: `(555) ${String(300 + Math.floor(rand() * 700)).padStart(3, '0')}-${String(1000 + Math.floor(rand() * 9000)).padStart(4, '0')}`,
        organization: `${major}`,
        category: 'scholarship_recipient',
        rsvpStatus,
        partySize,
        dietaryRestrictions: dietary,
        accessibilityNeeds: accessibility,
        notes: `Recipient of ${def.fundName} — $${perStudentAward.toLocaleString()} award`,
        relationshipTags: [def.fundName.toLowerCase().replace(/\s+/g, '-')],
        tablePreference: '',
        seatingPreference: seatPref,
      });

      // Recipient membership
      memberships.push({
        id: `rm-sch-${String(++membershipIndex).padStart(4, '0')}`,
        groupId,
        guestId: recipId,
        role: 'Recipient',
      });
    }
  }

  return { donors, recipients, groups, memberships };
}

// Generate once at import time
const _data = generateData();

export const seedDonors: Guest[] = _data.donors;
export const seedRecipients: Guest[] = _data.recipients;
export const seedRelationshipGroups: RelationshipGroup[] = _data.groups;
export const seedRelationshipMemberships: RelationshipMembership[] = _data.memberships;

/** All guests combined (donors + recipients) */
export const seedAllGuests: Guest[] = [..._data.donors, ..._data.recipients];
