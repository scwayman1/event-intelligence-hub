import { AppEvent, Guest, LayoutObject, EventVersion, SeatingAssignment, SeatingRule } from '@/types/events';

export const mockEvents: AppEvent[] = [
  {
    id: 'evt-001',
    name: '2026 Scholarship Ceremony',
    type: 'ceremony',
    status: 'active',
    date: '2026-05-15',
    time: '18:00',
    venue: 'Grand Pavilion Ballroom',
    venueAddress: '1200 University Blvd, Suite 400',
    estimatedAttendance: 280,
    notes: 'Annual scholarship ceremony honoring 24 recipients. Donor recognition segment. Board of trustees in attendance.',
    activeVersionId: 'ver-001',
    createdAt: '2026-01-10T09:00:00Z',
    updatedAt: '2026-03-20T14:30:00Z',
  },
  {
    id: 'evt-002',
    name: "President's Circle Dinner",
    type: 'dinner',
    status: 'planning',
    date: '2026-06-22',
    time: '19:00',
    venue: 'Heritage House',
    venueAddress: '450 Oak Lane, Heritage District',
    estimatedAttendance: 120,
    notes: 'Intimate donor recognition dinner for President\'s Circle members ($25K+ annual giving).',
    activeVersionId: 'ver-003',
    createdAt: '2026-02-01T10:00:00Z',
    updatedAt: '2026-03-18T11:00:00Z',
  },
  {
    id: 'evt-003',
    name: 'Spring Commencement Reception',
    type: 'reception',
    status: 'planning',
    date: '2026-05-30',
    time: '16:00',
    venue: 'University Commons Lawn',
    venueAddress: 'Main Campus Green',
    estimatedAttendance: 450,
    notes: 'Post-commencement reception for graduates and families. Outdoor tent event with multiple catering stations.',
    activeVersionId: 'ver-005',
    createdAt: '2026-02-15T08:00:00Z',
    updatedAt: '2026-03-22T09:15:00Z',
  },
];

export const mockGuests: Guest[] = [
  // Donors
  { id: 'g-001', eventId: 'evt-001', firstName: 'Margaret', lastName: 'Thornton', displayName: 'Margaret Thornton', email: 'mthornton@foundation.org', phone: '555-0101', organization: 'Thornton Family Foundation', category: 'donor', rsvpStatus: 'confirmed', partySize: 2, dietaryRestrictions: 'Vegetarian', accessibilityNeeds: '', notes: 'Major donor. Funds 6 scholarships. Prefers front tables.', relationshipTags: ['thornton-family', 'major-donor'], tablePreference: 'Near stage', seatingPreference: 'With scholarship recipients she funds', plusOneId: 'g-002', householdId: 'h-001' },
  { id: 'g-002', eventId: 'evt-001', firstName: 'Richard', lastName: 'Thornton', displayName: 'Richard Thornton', email: 'rthornton@foundation.org', phone: '555-0102', organization: 'Thornton Family Foundation', category: 'donor', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: 'Wheelchair accessible seating', notes: 'Plus-one of Margaret. Mobility needs.', relationshipTags: ['thornton-family', 'major-donor'], tablePreference: 'Near stage', seatingPreference: '', plusOneId: 'g-001', householdId: 'h-001' },
  { id: 'g-003', eventId: 'evt-001', firstName: 'James', lastName: 'Wu', displayName: 'James Wu', email: 'jwu@techventures.com', phone: '555-0103', organization: 'Wu Tech Ventures', category: 'donor', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: 'Gluten-free', accessibilityNeeds: '', notes: 'First-time ceremony attendee. New major gift.', relationshipTags: ['new-donor'], tablePreference: '', seatingPreference: 'Near board members', householdId: 'h-002' },
  { id: 'g-004', eventId: 'evt-001', firstName: 'Patricia', lastName: 'Alvarez', displayName: 'Patricia Alvarez', email: 'palvarez@alvarez.org', phone: '555-0104', organization: 'Alvarez Education Fund', category: 'donor', rsvpStatus: 'confirmed', partySize: 2, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Funds 3 scholarships. Board candidate.', relationshipTags: ['legacy-donor'], tablePreference: 'Donor Table A', seatingPreference: '', householdId: 'h-003' },
  { id: 'g-005', eventId: 'evt-001', firstName: 'David', lastName: 'Chen', displayName: 'David Chen', email: 'dchen@chengroup.com', phone: '555-0105', organization: 'Chen Group', category: 'donor', rsvpStatus: 'declined', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Declined - sending representative instead.', relationshipTags: ['corporate-donor'], tablePreference: '', seatingPreference: '' },
  // Scholarship Recipients
  { id: 'g-006', eventId: 'evt-001', firstName: 'Amara', lastName: 'Johnson', displayName: 'Amara Johnson', email: 'ajohnson@university.edu', phone: '555-0201', organization: 'College of Engineering', category: 'scholarship_recipient', rsvpStatus: 'confirmed', partySize: 3, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Thornton Scholar. Speaking at ceremony. Family guests: mother, sister.', relationshipTags: ['thornton-scholar', 'speaker'], tablePreference: 'Near stage', seatingPreference: 'Near Margaret Thornton', householdId: 'h-004' },
  { id: 'g-007', eventId: 'evt-001', firstName: 'Lucas', lastName: 'Martinez', displayName: 'Lucas Martinez', email: 'lmartinez@university.edu', phone: '555-0202', organization: 'School of Business', category: 'scholarship_recipient', rsvpStatus: 'confirmed', partySize: 2, dietaryRestrictions: 'Vegan', accessibilityNeeds: '', notes: 'Alvarez Scholar. First-generation student.', relationshipTags: ['alvarez-scholar'], tablePreference: '', seatingPreference: 'Near Patricia Alvarez' },
  { id: 'g-008', eventId: 'evt-001', firstName: 'Priya', lastName: 'Patel', displayName: 'Priya Patel', email: 'ppatel@university.edu', phone: '555-0203', organization: 'College of Sciences', category: 'scholarship_recipient', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: 'Vegetarian', accessibilityNeeds: '', notes: 'Wu Scholar. Research presentation.', relationshipTags: ['wu-scholar'], tablePreference: '', seatingPreference: 'Near James Wu' },
  { id: 'g-009', eventId: 'evt-001', firstName: 'Tyler', lastName: 'Brooks', displayName: 'Tyler Brooks', email: 'tbrooks@university.edu', phone: '555-0204', organization: 'School of Arts', category: 'scholarship_recipient', rsvpStatus: 'waitlist', partySize: 2, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Thornton Arts Scholar. On waitlist due to late RSVP.', relationshipTags: ['thornton-scholar'], tablePreference: '', seatingPreference: '' },
  // Board Members
  { id: 'g-010', eventId: 'evt-001', firstName: 'Eleanor', lastName: 'Voss', displayName: 'Dr. Eleanor Voss', email: 'evoss@university.edu', phone: '555-0301', organization: 'Board of Trustees', category: 'board_member', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Board Chair. Opening remarks.', relationshipTags: ['board-chair', 'speaker'], tablePreference: 'Head table', seatingPreference: 'Near podium' },
  { id: 'g-011', eventId: 'evt-001', firstName: 'Robert', lastName: 'Kim', displayName: 'Robert Kim', email: 'rkim@kimholdings.com', phone: '555-0302', organization: 'Kim Holdings', category: 'board_member', rsvpStatus: 'confirmed', partySize: 2, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Board member and donor.', relationshipTags: ['board-member', 'donor'], tablePreference: '', seatingPreference: '' },
  { id: 'g-012', eventId: 'evt-001', firstName: 'Sandra', lastName: 'Okafor', displayName: 'Sandra Okafor', email: 'sokafor@university.edu', phone: '555-0303', organization: 'Board of Trustees', category: 'board_member', rsvpStatus: 'invited', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Awaiting RSVP. Follow up needed.', relationshipTags: ['board-member'], tablePreference: '', seatingPreference: '' },
  // VIPs
  { id: 'g-013', eventId: 'evt-001', firstName: 'William', lastName: 'Hayes', displayName: 'President William Hayes', email: 'president@university.edu', phone: '555-0401', organization: 'University', category: 'vip', rsvpStatus: 'confirmed', partySize: 2, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'University President. Keynote speaker.', relationshipTags: ['president', 'speaker'], tablePreference: 'Head table', seatingPreference: 'Center stage' },
  { id: 'g-014', eventId: 'evt-001', firstName: 'Maria', lastName: 'Gonzalez', displayName: 'Mayor Maria Gonzalez', email: 'mgonzalez@city.gov', phone: '555-0402', organization: 'City Hall', category: 'vip', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Special guest. Brief remarks.', relationshipTags: ['city-official'], tablePreference: 'Near stage', seatingPreference: '' },
  // Staff
  { id: 'g-015', eventId: 'evt-001', firstName: 'Karen', lastName: 'Mitchell', displayName: 'Karen Mitchell', email: 'kmitchell@university.edu', phone: '555-0501', organization: 'Advancement Office', category: 'staff', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Event lead. Needs position near check-in.', relationshipTags: ['event-staff'], tablePreference: 'Staff table', seatingPreference: 'Near entrance' },
  { id: 'g-016', eventId: 'evt-001', firstName: 'Derek', lastName: 'Washington', displayName: 'Derek Washington', email: 'dwashington@university.edu', phone: '555-0502', organization: 'Advancement Office', category: 'staff', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'AV coordinator.', relationshipTags: ['event-staff', 'av'], tablePreference: 'Staff table', seatingPreference: 'Near AV booth' },
  // Family
  { id: 'g-017', eventId: 'evt-001', firstName: 'Grace', lastName: 'Johnson', displayName: 'Grace Johnson', email: 'gjohnson@email.com', phone: '555-0601', organization: '', category: 'family', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Mother of Amara Johnson', relationshipTags: ['family-of-recipient'], tablePreference: '', seatingPreference: 'With Amara Johnson', householdId: 'h-004' },
  { id: 'g-018', eventId: 'evt-001', firstName: 'Zoe', lastName: 'Johnson', displayName: 'Zoe Johnson', email: '', phone: '', organization: '', category: 'family', rsvpStatus: 'confirmed', partySize: 1, dietaryRestrictions: '', accessibilityNeeds: '', notes: 'Sister of Amara Johnson', relationshipTags: ['family-of-recipient'], tablePreference: '', seatingPreference: 'With Amara Johnson', householdId: 'h-004' },
];

export const mockVersions: EventVersion[] = [
  { id: 'ver-001', eventId: 'evt-001', name: 'Final Layout v2', status: 'active', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-20T14:30:00Z', createdBy: 'Karen Mitchell', notes: 'Approved layout with updated donor table positions.' },
  { id: 'ver-002', eventId: 'evt-001', name: 'Rain Plan', status: 'draft', createdAt: '2026-03-05T11:00:00Z', updatedAt: '2026-03-15T09:00:00Z', createdBy: 'Karen Mitchell', notes: 'Indoor fallback with reduced capacity. Stage repositioned.' },
  { id: 'ver-003', eventId: 'evt-002', name: 'Draft Layout', status: 'active', createdAt: '2026-02-10T10:00:00Z', updatedAt: '2026-03-10T11:00:00Z', createdBy: 'Admin', notes: 'Initial layout concept.' },
  { id: 'ver-004', eventId: 'evt-001', name: 'Initial Draft', status: 'archived', createdAt: '2026-01-15T10:00:00Z', updatedAt: '2026-02-28T12:00:00Z', createdBy: 'Karen Mitchell', notes: 'First draft. Superseded by Final Layout.' },
  { id: 'ver-005', eventId: 'evt-003', name: 'Outdoor Plan', status: 'active', createdAt: '2026-02-20T10:00:00Z', updatedAt: '2026-03-20T10:00:00Z', createdBy: 'Admin', notes: 'Primary outdoor layout.' },
];

export const mockLayoutObjects: LayoutObject[] = [
  // Main tent
  { id: 'lo-001', versionId: 'ver-001', type: 'tent', name: 'Main Pavilion', x: 100, y: 80, width: 600, height: 400, rotation: 0, capacity: 250, notes: 'Primary event space', category: 'structure', locked: false, visible: true, zIndex: 0 },
  // Stage
  { id: 'lo-002', versionId: 'ver-001', type: 'stage', name: 'Main Stage', x: 300, y: 100, width: 200, height: 80, rotation: 0, capacity: 0, notes: 'Speaker stage with podium', category: 'presentation', parentId: 'lo-001', locked: true, visible: true, zIndex: 1 },
  // Podium
  { id: 'lo-003', versionId: 'ver-001', type: 'podium', name: 'Podium', x: 380, y: 110, width: 30, height: 30, rotation: 0, capacity: 0, notes: '', category: 'presentation', parentId: 'lo-002', locked: true, visible: true, zIndex: 2 },
  // Head table
  { id: 'lo-004', versionId: 'ver-001', type: 'rect_table', name: 'Head Table', x: 280, y: 200, width: 240, height: 40, rotation: 0, capacity: 10, notes: 'Board chair, President, VIPs', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  // Round tables
  { id: 'lo-005', versionId: 'ver-001', type: 'round_table', name: 'Donor Table A', x: 160, y: 280, width: 80, height: 80, rotation: 0, capacity: 8, notes: 'Thornton family and scholars', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  { id: 'lo-006', versionId: 'ver-001', type: 'round_table', name: 'Donor Table B', x: 300, y: 280, width: 80, height: 80, rotation: 0, capacity: 8, notes: 'Alvarez family and scholars', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  { id: 'lo-007', versionId: 'ver-001', type: 'round_table', name: 'Donor Table C', x: 440, y: 280, width: 80, height: 80, rotation: 0, capacity: 8, notes: 'Wu and corporate donors', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  { id: 'lo-008', versionId: 'ver-001', type: 'round_table', name: 'Table 4', x: 160, y: 380, width: 80, height: 80, rotation: 0, capacity: 8, notes: '', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  { id: 'lo-009', versionId: 'ver-001', type: 'round_table', name: 'Table 5', x: 300, y: 380, width: 80, height: 80, rotation: 0, capacity: 8, notes: '', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  { id: 'lo-010', versionId: 'ver-001', type: 'round_table', name: 'Table 6', x: 440, y: 380, width: 80, height: 80, rotation: 0, capacity: 8, notes: '', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  // Staff table
  { id: 'lo-011', versionId: 'ver-001', type: 'rect_table', name: 'Staff Table', x: 560, y: 440, width: 100, height: 40, rotation: 0, capacity: 6, notes: 'Event staff', category: 'seating', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  // Check-in
  { id: 'lo-012', versionId: 'ver-001', type: 'checkin', name: 'Check-In', x: 350, y: 490, width: 100, height: 30, rotation: 0, capacity: 0, notes: 'Main entrance check-in', category: 'operations', locked: false, visible: true, zIndex: 1 },
  // Bar
  { id: 'lo-013', versionId: 'ver-001', type: 'bar', name: 'Main Bar', x: 600, y: 280, width: 60, height: 40, rotation: 0, capacity: 0, notes: '', category: 'catering', parentId: 'lo-001', locked: false, visible: true, zIndex: 1 },
  // VIP area
  { id: 'lo-014', versionId: 'ver-001', type: 'vip_area', name: 'VIP Lounge', x: 120, y: 100, width: 120, height: 80, rotation: 0, capacity: 15, notes: 'Pre-ceremony reception for VIPs', category: 'zone', locked: false, visible: true, zIndex: 1 },
];

export const mockSeatingAssignments: SeatingAssignment[] = [
  // Head Table
  { id: 'sa-001', versionId: 'ver-001', guestId: 'g-010', tableId: 'lo-004', seatNumber: 1 },
  { id: 'sa-002', versionId: 'ver-001', guestId: 'g-013', tableId: 'lo-004', seatNumber: 2 },
  { id: 'sa-003', versionId: 'ver-001', guestId: 'g-014', tableId: 'lo-004', seatNumber: 3 },
  // Donor Table A - Thornton family + their scholars
  { id: 'sa-004', versionId: 'ver-001', guestId: 'g-001', tableId: 'lo-005', seatNumber: 1 },
  { id: 'sa-005', versionId: 'ver-001', guestId: 'g-002', tableId: 'lo-005', seatNumber: 2 },
  { id: 'sa-006', versionId: 'ver-001', guestId: 'g-006', tableId: 'lo-005', seatNumber: 3 },
  { id: 'sa-007', versionId: 'ver-001', guestId: 'g-017', tableId: 'lo-005', seatNumber: 4 },
  { id: 'sa-008', versionId: 'ver-001', guestId: 'g-018', tableId: 'lo-005', seatNumber: 5 },
  // Donor Table B - Alvarez + scholars
  { id: 'sa-009', versionId: 'ver-001', guestId: 'g-004', tableId: 'lo-006', seatNumber: 1 },
  { id: 'sa-010', versionId: 'ver-001', guestId: 'g-007', tableId: 'lo-006', seatNumber: 2 },
  // Donor Table C
  { id: 'sa-011', versionId: 'ver-001', guestId: 'g-003', tableId: 'lo-007', seatNumber: 1 },
  { id: 'sa-012', versionId: 'ver-001', guestId: 'g-008', tableId: 'lo-007', seatNumber: 2 },
  { id: 'sa-013', versionId: 'ver-001', guestId: 'g-011', tableId: 'lo-007', seatNumber: 3 },
  // Staff table
  { id: 'sa-014', versionId: 'ver-001', guestId: 'g-015', tableId: 'lo-011', seatNumber: 1 },
  { id: 'sa-015', versionId: 'ver-001', guestId: 'g-016', tableId: 'lo-011', seatNumber: 2 },
];

export const mockSeatingRules: SeatingRule[] = [
  { id: 'sr-001', eventId: 'evt-001', name: 'Keep households together', description: 'Guests in the same household should be at the same table', enabled: true, priority: 1 },
  { id: 'sr-002', eventId: 'evt-001', name: 'Pair donors with recipients', description: 'Seat scholarship recipients near their funding donors', enabled: true, priority: 2 },
  { id: 'sr-003', eventId: 'evt-001', name: 'VIPs near stage', description: 'Place VIP guests at tables closest to the stage', enabled: true, priority: 3 },
  { id: 'sr-004', eventId: 'evt-001', name: 'Spread board members', description: 'Distribute board members across different tables', enabled: true, priority: 4 },
  { id: 'sr-005', eventId: 'evt-001', name: 'Accessibility compliance', description: 'Ensure guests with accessibility needs are at accessible positions', enabled: true, priority: 5 },
  { id: 'sr-006', eventId: 'evt-001', name: 'Confirmed RSVPs only', description: 'Only assign confirmed guests to seats', enabled: false, priority: 6 },
];
