export const ZONES = {
  INSIDE_DHAKA: 'INSIDE_DHAKA',
  DHAKA_SUBURBAN: 'DHAKA_SUBURBAN',
  OUTSIDE_DHAKA: 'OUTSIDE_DHAKA',
  DISTRICT_TO_DISTRICT: 'DISTRICT_TO_DISTRICT',
};

export const DHAKA_SUBURBAN_DISTRICTS = ['SAVAR', 'GAZIPUR', 'NARAYANGANJ', 'KERANIGANJ', 'DHAMRAI'];

export const resolveZone = (pickupDistrict = '', deliveryDistrict = '') => {
  const pDist = pickupDistrict.trim().toUpperCase();
  const dDist = deliveryDistrict.trim().toUpperCase();

  const isPickupDhaka = pDist === 'DHAKA';
  const isDeliveryDhaka = dDist === 'DHAKA';
  const isDeliverySuburban = DHAKA_SUBURBAN_DISTRICTS.includes(dDist);

  // Both inside Dhaka City
  if (isPickupDhaka && isDeliveryDhaka) return ZONES.INSIDE_DHAKA;

  // Dhaka to Suburban
  if (isPickupDhaka && isDeliverySuburban) return ZONES.DHAKA_SUBURBAN;

  // Either Origin or Destination is Dhaka (Outstation to/from Dhaka)
  if (isPickupDhaka || isDeliveryDhaka) return ZONES.OUTSIDE_DHAKA;

  // Non-Dhaka to Non-Dhaka (Cross-country inter-district)
  return ZONES.DISTRICT_TO_DISTRICT;
};

export const TARIFF_MATRIX = {
  [ZONES.INSIDE_DHAKA]: {
    basePrice: 55,
    sameDayPrice: 105,
    baseWeightLimitKg: 1.0,
    weightSurchargePerKg: 20,
    codPercentage: 1.0,
  },
  [ZONES.DHAKA_SUBURBAN]: {
    basePrice: 105,
    sameDayPrice: 105,
    baseWeightLimitKg: 1.0,
    weightSurchargePerKg: 20,
    codPercentage: 1.0,
  },
  [ZONES.OUTSIDE_DHAKA]: {
    basePrice: 115,
    sameDayPrice: null,
    baseWeightLimitKg: 1.0,
    weightSurchargePerKg: 20,
    codPercentage: 1.0,
  },
  [ZONES.DISTRICT_TO_DISTRICT]: {
    basePrice: 135,
    sameDayPrice: null,
    baseWeightLimitKg: 1.0,
    weightSurchargePerKg: 20,
    codPercentage: 1.0,
  },
};