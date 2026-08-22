export const BASE_URL =
  'https://www.royalcaribbean.com/content/dam/royal/resources/pdf/casino/offers/';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const POINTS_REFERENCE = {
  CHN01: '48,088',
  CHN02: '28,088',
  CHN03: '16,088',
  CHN04: '12,888',
  CHN05: '6,488',
  CHN06: '2,808',
  CHN07: '2,088',
  SVIP2: '40,000',
  S01:   '25,000',
  S02:   '15,000',
  S02A:  '9,000',
  S03:   '6,500',
  S03A:  '4,000',
  S04:   '3,000',
  S05:   '2,000',
  S06:   '1,500',
  S07:   '1,200',
  S08:   '800',
};

export const S_CODES = ['SVIP2', 'S01', 'S02', 'S02A', 'S03', 'S03A', 'S04', 'S05', 'S06', 'S07', 'S08'];

export const PERK_PRESETS = [
  { label: 'Free Interior Cabin (3-night)',  value: 450 },
  { label: 'Free Interior Cabin (5-night)',  value: 700 },
  { label: 'Free Interior Cabin (7-night)',  value: 950 },
  { label: 'Free Balcony Cabin (3-night)',   value: 750 },
  { label: 'Free Balcony Cabin (5-night)',   value: 1100 },
  { label: 'Free Balcony Cabin (7-night)',   value: 1450 },
  { label: 'Onboard Credit $50',             value: 50 },
  { label: 'Onboard Credit $100',            value: 100 },
  { label: 'Onboard Credit $200',            value: 200 },
  { label: 'Onboard Credit $300',            value: 300 },
  { label: 'Free Surf WiFi (7 nights)',      value: 105 },
  { label: 'Free Stream WiFi (7 nights)',    value: 175 },
  { label: 'Free Drinks Package',            value: 350 },
  { label: 'Free Specialty Dining',          value: 75 },
  { label: 'Casino Cash Play Credit',        value: 100 },
  { label: 'Custom Perk',                    value: 0 },
];

export const EMPTY_TRIP = {
  id: null,
  name: '',
  sailDate: '',
  ship: '',
  nights: '',
  cruiseCost: '',
  taxes: '',
  airfare: '',
  hotel: '',
  roaming: '',
  insurance: '',
  foodDrinks: '',
  excursions: '',
  spa: '',
  shopping: '',
  otherOnboard: '',
  casinoSpend: '',
  casinoPointsEarned: '',
  casinoPointsGoal: '',
  perks: [],
  notes: '',
  tripFxRate: '',   // per-trip SGD/USD rate override for gambling & spending
};
